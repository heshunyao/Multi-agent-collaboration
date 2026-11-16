package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.domain.GitCommit;
import com.agentforge.repo.GitCommitRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 项目工作区的 Git 集成：初始化、提交、分支管理、日志，全部调用本机 git CLI。 */
@Service
public class GitService {

    private static final Logger log = LoggerFactory.getLogger(GitService.class);
    private static final String IDENTITY_NAME = "AgentForge";
    private static final String IDENTITY_EMAIL = "agentforge@local";
    private static final int TIMEOUT_SECONDS = 30;

    private final WorkspaceService workspaceService;
    private final GitCommitRepository commitRepository;
    private volatile Boolean gitAvailable;

    public GitService(WorkspaceService workspaceService, GitCommitRepository commitRepository) {
        this.workspaceService = workspaceService;
        this.commitRepository = commitRepository;
    }

    public boolean available() {
        Boolean cached = gitAvailable;
        if (cached != null) {
            return cached;
        }
        boolean result = exec(workspaceService.root(), "git", "--version").code() == 0;
        gitAvailable = result;
        return result;
    }

    public Map<String, Object> status(String projectId) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("available", available());
        info.put("commits", commitRepository.findByProjectIdOrderByCreatedAtDesc(projectId));
        Path workspace = workspaceService.projectRoot(projectId);
        boolean initialized = Files.exists(workspace.resolve(".git"));
        String branch = initialized ? currentBranch(workspace) : "";
        info.put("initialized", initialized);
        info.put("branch", branch);
        info.put("branches", initialized ? listBranches(workspace, branch) : List.of());
        info.put("changedFiles", initialized ? countLines(run(workspace, "status", "--porcelain").output()) : 0);
        info.put("fileCount", workspaceService.countFiles(projectId));
        return info;
    }

    private List<String> listBranches(Path workspace, String current) {
        Result result = run(workspace, "branch", "--list", "--format=%(refname:short)");
        List<String> branches = result.code() == 0
                ? result.output().lines().map(String::trim).filter(value -> !value.isBlank()).toList()
                : List.of();
        if (branches.isEmpty() && !current.isBlank()) {
            return List.of(current);
        }
        return branches;
    }

    /** 切换到已存在的本地分支。 */
    public Map<String, Object> checkout(String projectId, String name) {
        if (!ensureRepository(projectId)) {
            throw ApiException.badRequest("本机未安装 Git，无法切换分支");
        }
        String branch = name == null ? "" : name.trim();
        if (!branch.matches("[A-Za-z0-9._/-]{1,80}") || branch.contains("..")) {
            throw ApiException.badRequest("分支名不合法");
        }
        Path workspace = workspaceService.projectRoot(projectId);
        Result result = run(workspace, "checkout", branch);
        if (result.code() != 0) {
            throw ApiException.badRequest("切换分支失败：" + tail(result.output(), 300));
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("ok", true);
        info.put("branch", currentBranch(workspace));
        return info;
    }

    /** 初始化仓库（幂等），返回是否可用。 */
    public boolean ensureRepository(String projectId) {
        if (!available()) {
            return false;
        }
        Path workspace = workspaceService.ensureProjectRoot(projectId);
        if (Files.exists(workspace.resolve(".git"))) {
            return true;
        }
        Result init = run(workspace, "init", "-b", "main");
        if (init.code() != 0) {
            run(workspace, "init");
        }
        try {
            String ignore = """
                    node_modules/
                    target/
                    dist/
                    .venv/
                    __pycache__/
                    .build-test/
                    .testclasses/
                    out/
                    *.log
                    """;
            Path gitignore = workspace.resolve(".gitignore");
            if (!Files.exists(gitignore)) {
                Files.writeString(gitignore, ignore, StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            log.warn("写入 .gitignore 失败 projectId={}", projectId, e);
        }
        return true;
    }

    /** 提交工作区全部变更；没有变更时返回 null（不产生空提交）。 */
    public GitCommit commit(String projectId, String buildId, String message) {
        if (!ensureRepository(projectId)) {
            return null;
        }
        Path workspace = workspaceService.projectRoot(projectId);
        run(workspace, "add", "-A");
        String staged = run(workspace, "diff", "--cached", "--name-only").output();
        int files = countLines(staged);
        if (files == 0) {
            return null;
        }
        String text = (message == null || message.isBlank()) ? "chore: AI 项目构建提交" : message.trim();
        Result commit = exec(workspace, "git",
                "-c", "user.name=" + IDENTITY_NAME,
                "-c", "user.email=" + IDENTITY_EMAIL,
                "commit", "-m", text);
        if (commit.code() != 0) {
            throw new ApiException(500, "Git 提交失败：" + tail(commit.output(), 400));
        }
        String hash = run(workspace, "rev-parse", "HEAD").output().trim();
        String shortHash = run(workspace, "rev-parse", "--short", "HEAD").output().trim();
        GitCommit record = new GitCommit();
        record.id = Ids.shortId("commit");
        record.projectId = projectId;
        record.buildId = buildId;
        record.hash = hash;
        record.shortHash = shortHash;
        record.branch = currentBranch(workspace);
        record.message = text.length() > 500 ? text.substring(0, 500) : text;
        record.fileCount = files;
        record.createdAt = System.currentTimeMillis();
        return commitRepository.save(record);
    }

    public Map<String, Object> createBranch(String projectId, String name) {
        if (!ensureRepository(projectId)) {
            throw ApiException.badRequest("本机未安装 Git，无法使用分支管理");
        }
        String branch = name == null ? "" : name.trim();
        if (!branch.matches("[A-Za-z0-9._/-]{1,80}") || branch.contains("..")) {
            throw ApiException.badRequest("分支名不合法");
        }
        Path workspace = workspaceService.projectRoot(projectId);
        Result result = run(workspace, "checkout", "-b", branch);
        if (result.code() != 0) {
            throw ApiException.badRequest("创建分支失败：" + tail(result.output(), 300));
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("ok", true);
        info.put("branch", branch);
        return info;
    }

    public List<GitCommit> commits(String projectId) {
        return commitRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
    }

    private String currentBranch(Path workspace) {
        Result result = run(workspace, "rev-parse", "--abbrev-ref", "HEAD");
        return result.code() == 0 ? result.output().trim() : "";
    }

    private Result run(Path workspace, String... args) {
        String[] command = new String[args.length + 1];
        command[0] = "git";
        System.arraycopy(args, 0, command, 1, args.length);
        return exec(workspace, command);
    }

    private Result exec(Path workspace, String... command) {
        try {
            ProcessBuilder builder = new ProcessBuilder(command);
            builder.directory(workspace.toFile());
            builder.redirectErrorStream(true);
            Process process = builder.start();
            byte[] output = process.getInputStream().readAllBytes();
            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new Result(124, "命令执行超时");
            }
            String text = new String(output, StandardCharsets.UTF_8);
            return new Result(process.exitValue(), text);
        } catch (IOException e) {
            return new Result(127, "Git 不可用：" + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(130, "命令被中断");
        }
    }

    private static int countLines(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return (int) text.lines().filter(line -> !line.isBlank()).count();
    }

    private static String tail(String text, int max) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(trimmed.length() - max);
    }

    private record Result(int code, String output) {
    }
}
