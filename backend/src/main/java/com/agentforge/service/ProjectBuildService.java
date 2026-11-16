package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.AgentTeam;
import com.agentforge.domain.ModelConfig;
import com.agentforge.domain.Project;
import com.agentforge.domain.ProjectBuild;
import com.agentforge.domain.ProjectStage;
import com.agentforge.domain.TaskItem;
import com.agentforge.dto.ProjectBuildDto;
import com.agentforge.engine.AgentEngineClient;
import com.agentforge.engine.EngineException;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.AgentTeamRepository;
import com.agentforge.repo.GitCommitRepository;
import com.agentforge.repo.ModelRepository;
import com.agentforge.repo.ProjectBuildRepository;
import com.agentforge.repo.ProjectRepository;
import com.agentforge.repo.ProjectStageRepository;
import com.agentforge.repo.TaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

/**
 * AI 软件项目构建服务：调度 Python 项目流水线（需求分析 → 架构 → 任务拆解 → 代码生成 →
 * 真实测试 → 自动修复 → 交付文档），持久化阶段 / 任务 / 测试 / Git 结果并转发 SSE 事件。
 */
@Service
public class ProjectBuildService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ProjectBuildService.class);

    public static final Set<String> STACKS = Set.of("java-react", "node-react", "python-fastapi");
    private static final Set<String> ACTIVE = Set.of("pending", "running", "paused");
    private static final int MAX_TEST_OUTPUT = 12_000;

    private record MemberSpec(Agent agent, ModelConfig model) {
    }

    private final ProjectRepository projectRepository;
    private final ProjectBuildRepository buildRepository;
    private final ProjectStageRepository stageRepository;
    private final TaskRepository taskRepository;
    private final GitCommitRepository gitCommitRepository;
    private final AgentRepository agentRepository;
    private final AgentTeamRepository teamRepository;
    private final ModelRepository modelRepository;
    private final AgentEngineClient engineClient;
    private final ProjectEventBus eventBus;
    private final WorkspaceService workspaceService;
    private final GitService gitService;
    private final AuditService auditService;
    private final Executor executor;
    private final String callbackBaseUrl;

    private final Map<String, StringBuilder> contentBuffers = new ConcurrentHashMap<>();
    private final Map<String, StringBuilder> reasoningBuffers = new ConcurrentHashMap<>();

    public ProjectBuildService(ProjectRepository projectRepository,
                               ProjectBuildRepository buildRepository,
                               ProjectStageRepository stageRepository,
                               TaskRepository taskRepository,
                               GitCommitRepository gitCommitRepository,
                               AgentRepository agentRepository,
                               AgentTeamRepository teamRepository,
                               ModelRepository modelRepository,
                               AgentEngineClient engineClient,
                               ProjectEventBus eventBus,
                               WorkspaceService workspaceService,
                               GitService gitService,
                               AuditService auditService,
                               @Qualifier("chatExecutor") Executor executor,
                               @Value("${agentforge.engine.callback-base-url:http://127.0.0.1:8080}") String callbackBaseUrl) {
        this.projectRepository = projectRepository;
        this.buildRepository = buildRepository;
        this.stageRepository = stageRepository;
        this.taskRepository = taskRepository;
        this.gitCommitRepository = gitCommitRepository;
        this.agentRepository = agentRepository;
        this.teamRepository = teamRepository;
        this.modelRepository = modelRepository;
        this.engineClient = engineClient;
        this.eventBus = eventBus;
        this.workspaceService = workspaceService;
        this.gitService = gitService;
        this.auditService = auditService;
        this.executor = executor;
        this.callbackBaseUrl = callbackBaseUrl.replaceAll("/+$", "");
    }

    /** 服务重启后把未完成的构建标记为中断，避免状态卡在 running。 */
    @Override
    public void run(ApplicationArguments args) {
        for (ProjectBuild build : buildRepository.findAll()) {
            if (ACTIVE.contains(build.status)) {
                build.status = "failed";
                build.summary = "服务重启导致构建中断，请重新发起构建";
                build.finishedAt = System.currentTimeMillis();
                build.updatedAt = build.finishedAt;
                buildRepository.save(build);
            }
        }
    }

    public ProjectBuild require(String id) {
        return buildRepository.findById(id).orElseThrow(() -> ApiException.notFound("构建记录不存在"));
    }

    public List<ProjectBuildDto> list(String projectId) {
        return buildRepository.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(this::toDto)
                .toList();
    }

    public ProjectBuildDto detail(String buildId) {
        return toDto(require(buildId));
    }

    public ProjectBuildDto start(String projectId, String requirement, String stack) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> ApiException.notFound("项目不存在"));

        ProjectBuild latest = buildRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId);
        if (latest != null && ACTIVE.contains(latest.status)) {
            throw ApiException.conflict("该项目已有构建在进行中，请先等待完成或终止");
        }

        String stacked = firstNonBlank(stack, project.stack, "java-react");
        if (!STACKS.contains(stacked)) {
            throw ApiException.badRequest("不支持的技术栈：" + stacked);
        }
        String requirementText = firstNonBlank(requirement, project.requirement, project.description);
        if (requirementText.isBlank()) {
            throw ApiException.badRequest("请先填写项目需求，AI 需要需求才能构建");
        }
        List<MemberSpec> team = resolveTeam();

        Path workspace = workspaceService.ensureProjectRoot(project.id);
        long now = System.currentTimeMillis();
        ProjectBuild build = new ProjectBuild();
        build.id = Ids.shortId("build");
        build.projectId = project.id;
        build.projectName = project.name;
        build.stack = stacked;
        build.requirement = requirementText;
        build.status = "pending";
        build.currentStage = "排队中";
        build.createdAt = now;
        build.updatedAt = now;
        buildRepository.save(build);

        project.stack = stacked;
        project.requirement = requirementText;
        project.workspacePath = workspaceService.relativePath(project.id);
        project.status = "building";
        project.updatedAt = now;
        projectRepository.save(project);

        auditService.record("project.build", "project", project.id, "启动 AI 项目构建：" + project.name, true);
        eventBus.publish(build.id, "status", Map.of("buildId", build.id, "status", "pending"));
        String finalRequirement = requirementText;
        executor.execute(() -> execute(build.id, finalRequirement, stacked, workspace, team));
        return detail(build.id);
    }

    public String control(String buildId) {
        return buildRepository.findById(buildId).map(build -> build.status).orElse("cancelled");
    }

    public void pause(String id) {
        ProjectBuild build = require(id);
        if (!"running".equals(build.status)) {
            throw ApiException.badRequest("当前状态无法暂停：" + build.status);
        }
        updateStatus(build, "paused");
    }

    public void resume(String id) {
        ProjectBuild build = require(id);
        if (!"paused".equals(build.status)) {
            throw ApiException.badRequest("当前状态无法继续：" + build.status);
        }
        updateStatus(build, "running");
    }

    public void cancel(String id) {
        ProjectBuild build = require(id);
        if (!ACTIVE.contains(build.status)) {
            throw ApiException.badRequest("构建已结束");
        }
        build.status = "cancelled";
        build.summary = "已终止";
        build.finishedAt = System.currentTimeMillis();
        build.updatedAt = build.finishedAt;
        buildRepository.save(build);
        eventBus.publish(id, "status", Map.of("buildId", id, "status", "cancelled"));
        auditService.record("project.cancel", "project", build.projectId, "终止项目构建", true);
    }

    public void deleteForProject(String projectId) {
        for (ProjectBuild build : buildRepository.findByProjectIdOrderByCreatedAtDesc(projectId)) {
            stageRepository.deleteByBuildId(build.id);
            taskRepository.deleteByBuildId(build.id);
            buildRepository.delete(build);
        }
        stageRepository.deleteByProjectId(projectId);
        gitCommitRepository.deleteByProjectId(projectId);
        contentBuffers.clear();
        reasoningBuffers.clear();
    }

    /* ---------- 引擎执行 ---------- */

    private void execute(String buildId, String requirement, String stack, Path workspace, List<MemberSpec> team) {
        ProjectBuild build;
        try {
            build = require(buildId);
        } catch (ApiException e) {
            return;
        }
        String prefix = "stage-" + buildId + "-";
        try {
            build.status = "running";
            build.startedAt = System.currentTimeMillis();
            build.updatedAt = build.startedAt;
            build.currentStage = "需求分析";
            buildRepository.save(build);
            eventBus.publish(build.id, "status", Map.of("buildId", build.id, "status", "running"));

            Map<String, Object> payload = buildPayload(build, requirement, stack, workspace, team);
            engineClient.stream("/internal/project/stream", payload,
                    (event, data) -> handleEvent(build, event, data));
            handleStreamEnded(build);
        } catch (EngineException e) {
            log.warn("项目构建失败 buildId={}：{}", buildId, e.getMessage());
            failBuild(build, e.getMessage());
        } catch (Exception e) {
            log.error("项目构建异常 buildId={}", buildId, e);
            failBuild(build, "项目构建异常：" + e.getMessage());
        } finally {
            contentBuffers.keySet().removeIf(key -> key.startsWith(prefix));
            reasoningBuffers.keySet().removeIf(key -> key.startsWith(prefix));
        }
    }

    private Map<String, Object> buildPayload(ProjectBuild build, String requirement, String stack,
                                             Path workspace, List<MemberSpec> team) {
        List<Map<String, Object>> members = new ArrayList<>();
        for (MemberSpec spec : team) {
            Agent agent = spec.agent();
            ModelConfig model = spec.model();
            Map<String, Object> member = new LinkedHashMap<>();
            member.put("id", agent.id);
            member.put("name", agent.name);
            member.put("role", agent.role);
            member.put("systemPrompt", agent.systemPrompt == null ? "" : agent.systemPrompt);
            member.put("temperature", agent.temperature);
            member.put("tools", JsonLists.read(agent.toolsJson));
            Map<String, Object> modelSpec = new LinkedHashMap<>();
            modelSpec.put("id", model.id);
            modelSpec.put("label", model.label);
            modelSpec.put("modelName", model.modelName == null || model.modelName.isBlank()
                    ? model.id : model.modelName);
            modelSpec.put("baseUrl", model.baseUrl);
            modelSpec.put("apiKey", model.apiKey);
            member.put("model", modelSpec);
            members.add(member);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("buildId", build.id);
        payload.put("projectId", build.projectId);
        payload.put("projectName", build.projectName);
        payload.put("stack", stack);
        payload.put("requirement", requirement);
        payload.put("workspace", workspace.toAbsolutePath().toString());
        payload.put("team", members);
        payload.put("controlUrl", callbackBaseUrl + "/internal/project-builds/" + build.id + "/control");
        return payload;
    }

    private void handleEvent(ProjectBuild build, String event, JsonNode data) {
        switch (event) {
            case "stage" -> {
                ProjectStage stage = persistStage(build, data, false);
                if (stage != null) {
                    build.currentStage = stage.title;
                    build.stageCount = stageRepository.findByBuildIdOrderBySeqAsc(build.id).size();
                    build.updatedAt = System.currentTimeMillis();
                    buildRepository.save(build);
                }
                eventBus.publish(build.id, "stage", data);
            }
            case "delta" -> {
                String stageId = data.path("stageId").asText("");
                contentBuffers.computeIfAbsent(stageId, key -> new StringBuilder())
                        .append(data.path("text").asText(""));
                eventBus.publish(build.id, "delta", data);
            }
            case "reasoning" -> {
                String stageId = data.path("stageId").asText("");
                reasoningBuffers.computeIfAbsent(stageId, key -> new StringBuilder())
                        .append(data.path("text").asText(""));
                eventBus.publish(build.id, "reasoning", data);
            }
            case "stage_done" -> {
                ProjectStage stage = persistStage(build, data, true);
                if (stage != null) {
                    build.doneStages = (int) stageRepository.findByBuildIdOrderBySeqAsc(build.id).stream()
                            .filter(item -> "done".equals(item.status))
                            .count();
                    build.updatedAt = System.currentTimeMillis();
                    buildRepository.save(build);
                }
                eventBus.publish(build.id, "stage_done", data);
            }
            case "task" -> {
                persistTask(build, data);
                eventBus.publish(build.id, "task", data);
            }
            case "file" -> {
                ProjectBuild current = require(build.id);
                current.fileCount = Math.max(current.fileCount + 1, data.path("fileCount").asInt(0));
                current.updatedAt = System.currentTimeMillis();
                buildRepository.save(current);
                eventBus.publish(build.id, "file", data);
            }
            case "test" -> {
                ProjectBuild current = require(build.id);
                current.testRounds = Math.max(current.testRounds, data.path("round").asInt(current.testRounds));
                current.testsPassed = data.path("ok").asBoolean(current.testsPassed);
                String output = data.path("output").asText("");
                current.lastTestOutput = tail(output, MAX_TEST_OUTPUT);
                current.updatedAt = System.currentTimeMillis();
                buildRepository.save(current);
                eventBus.publish(build.id, "test", data);
            }
            case "git" -> {
                ProjectBuild current = require(build.id);
                current.gitCommit = data.path("hash").asText(current.gitCommit);
                current.gitBranch = data.path("branch").asText(current.gitBranch);
                current.updatedAt = System.currentTimeMillis();
                buildRepository.save(current);
                eventBus.publish(build.id, "git", data);
            }
            case "status" -> {
                String status = data.path("status").asText("running");
                ProjectBuild current = require(build.id);
                if ("cancelled".equals(current.status) && !"cancelled".equals(status)) {
                    return;
                }
                current.status = status;
                current.updatedAt = System.currentTimeMillis();
                buildRepository.save(current);
                eventBus.publish(build.id, "status", data);
            }
            case "done" -> finalizeBuild(build, data);
            case "error" -> failBuild(build, data.path("message").asText("项目构建失败"));
            default -> log.debug("忽略项目构建事件 {}", event);
        }
    }

    private void finalizeBuild(ProjectBuild build, JsonNode data) {
        ProjectBuild current = require(build.id);
        boolean cancelled = "cancelled".equals(current.status);
        String engineStatus = data.path("status").asText("done");
        String status = cancelled ? "cancelled" : engineStatus;

        if (!cancelled && "done".equals(status)) {
            try {
                var commit = gitService.commit(build.projectId, build.id,
                        "feat: AI 生成 " + build.projectName + "（" + build.stack + "）");
                if (commit != null) {
                    current.gitCommit = commit.hash;
                    current.gitBranch = commit.branch;
                    Map<String, Object> gitEvent = new LinkedHashMap<>();
                    gitEvent.put("ok", true);
                    gitEvent.put("hash", commit.hash);
                    gitEvent.put("shortHash", commit.shortHash);
                    gitEvent.put("branch", commit.branch);
                    gitEvent.put("message", commit.message);
                    gitEvent.put("files", commit.fileCount);
                    eventBus.publish(build.id, "git", gitEvent);
                } else {
                    eventBus.publish(build.id, "git", Map.of("ok", false, "message", "工作区没有可提交的变更"));
                }
            } catch (Exception e) {
                log.warn("自动 Git 提交失败 buildId={}", build.id, e);
                eventBus.publish(build.id, "git", Map.of("ok", false, "message", "Git 提交失败：" + e.getMessage()));
            }
        }

        current.status = status;
        current.summary = "cancelled".equals(status)
                ? "已终止"
                : data.path("summary").asText("");
        current.fileCount = Math.max(current.fileCount, data.path("fileCount").asInt(0));
        current.testRounds = Math.max(current.testRounds, data.path("testRounds").asInt(0));
        if (data.has("testsPassed")) {
            current.testsPassed = data.path("testsPassed").asBoolean(current.testsPassed);
        }
        current.currentStage = "done".equals(status) ? "已完成" : "已结束";
        current.finishedAt = System.currentTimeMillis();
        current.updatedAt = current.finishedAt;
        buildRepository.save(current);

        projectRepository.findById(build.projectId).ifPresent(project -> {
            project.status = "done".equals(status) ? "ready" : "failed";
            project.updatedAt = System.currentTimeMillis();
            projectRepository.save(project);
        });

        Map<String, Object> done = new LinkedHashMap<>();
        done.put("buildId", build.id);
        done.put("status", status);
        done.put("summary", current.summary == null ? "" : current.summary);
        done.put("fileCount", current.fileCount);
        done.put("testRounds", current.testRounds);
        done.put("testsPassed", current.testsPassed);
        done.put("gitCommit", current.gitCommit == null ? "" : current.gitCommit);
        eventBus.publish(build.id, "done", done);
        eventBus.complete(build.id);
        auditService.record("project.done", "project", build.projectId, "项目构建结束：" + status, true);
    }

    private void updateStatus(ProjectBuild build, String status) {
        build.status = status;
        build.updatedAt = System.currentTimeMillis();
        buildRepository.save(build);
        eventBus.publish(build.id, "status", Map.of("buildId", build.id, "status", status));
    }

    private void handleStreamEnded(ProjectBuild build) {
        ProjectBuild current = require(build.id);
        if (ACTIVE.contains(current.status)) {
            failBuild(current, "Agent 引擎连接中断，构建已结束");
            return;
        }
        eventBus.complete(build.id);
    }

    private void failBuild(ProjectBuild build, String message) {
        ProjectBuild current = require(build.id);
        current.status = "failed";
        current.summary = message;
        current.currentStage = "构建失败";
        current.finishedAt = System.currentTimeMillis();
        current.updatedAt = current.finishedAt;
        buildRepository.save(current);
        for (ProjectStage stage : stageRepository.findByBuildIdOrderBySeqAsc(build.id)) {
            if ("running".equals(stage.status) || "pending".equals(stage.status)) {
                stage.status = "failed";
                stage.error = message;
                stage.finishedAt = System.currentTimeMillis();
                stageRepository.save(stage);
            }
        }
        projectRepository.findById(build.projectId).ifPresent(project -> {
            project.status = "failed";
            project.updatedAt = System.currentTimeMillis();
            projectRepository.save(project);
        });
        eventBus.publish(build.id, "error", Map.of("buildId", build.id, "message", message));
        eventBus.publish(build.id, "done", Map.of("buildId", build.id, "status", "failed", "summary", message));
        eventBus.complete(build.id);
        auditService.record("project.failed", "project", build.projectId, message, false);
    }

    private ProjectStage persistStage(ProjectBuild build, JsonNode data, boolean finished) {
        String stageId = data.path("stageId").asText("");
        if (stageId.isEmpty()) {
            return null;
        }
        ProjectStage stage = stageRepository.findById(stageId).orElseGet(() -> {
            ProjectStage created = new ProjectStage();
            created.id = stageId;
            created.buildId = build.id;
            created.projectId = build.projectId;
            created.startedAt = System.currentTimeMillis();
            return created;
        });
        stage.seq = data.path("seq").asInt(stage.seq);
        stage.stageKey = data.path("stageKey").asText(stage.stageKey);
        stage.title = data.path("title").asText(stage.title);
        stage.agentId = data.path("agentId").asText(stage.agentId);
        stage.agentName = data.path("agentName").asText(stage.agentName);
        stage.status = data.path("status").asText(finished ? "done" : "running");
        if (finished) {
            String content = data.path("content").asText("");
            StringBuilder buffer = contentBuffers.remove(stageId);
            if (content.isEmpty() && buffer != null) {
                content = buffer.toString();
            }
            stage.content = content;
            String reasoning = data.path("reasoning").asText("");
            StringBuilder reasoningBuffer = reasoningBuffers.remove(stageId);
            if (reasoning.isEmpty() && reasoningBuffer != null) {
                reasoning = reasoningBuffer.toString();
            }
            stage.reasoning = reasoning;
            String error = data.path("error").asText("");
            stage.error = error.isEmpty() ? null : error;
            stage.promptTokens = data.path("promptTokens").asInt(0);
            stage.completionTokens = data.path("completionTokens").asInt(0);
            stage.finishedAt = System.currentTimeMillis();
        }
        return stageRepository.save(stage);
    }

    private void persistTask(ProjectBuild build, JsonNode data) {
        String id = data.path("id").asText("");
        if (!id.isEmpty() && taskRepository.existsById(id)) {
            return;
        }
        long now = System.currentTimeMillis();
        TaskItem task = new TaskItem();
        task.id = id.isEmpty() ? Ids.shortId("task") : id;
        task.projectId = build.projectId;
        task.buildId = build.id;
        task.area = normalizeArea(data.path("area").asText("general"));
        task.title = data.path("title").asText("未命名任务");
        task.description = data.path("description").asText("");
        task.priority = normalizePriority(data.path("priority").asText("medium"));
        task.status = "todo";
        task.orderIndex = taskRepository.findByBuildIdOrderByOrderIndexAsc(build.id).size();
        task.createdAt = now;
        task.updatedAt = now;
        taskRepository.save(task);
    }

    private static String normalizeArea(String area) {
        return switch (area) {
            case "frontend", "backend", "database", "devops" -> area;
            default -> "general";
        };
    }

    private static String normalizePriority(String priority) {
        return switch (priority) {
            case "high", "low" -> priority;
            default -> "medium";
        };
    }

    /* ---------- 团队与模型 ---------- */

    private List<MemberSpec> resolveTeam() {
        List<ModelConfig> usable = modelRepository.findAll().stream()
                .filter(model -> notBlank(model.baseUrl) && notBlank(model.apiKey))
                .sorted(Comparator.comparingLong(model -> model.createdAt))
                .toList();
        if (usable.isEmpty()) {
            throw ApiException.badRequest("还没有可用的模型：请先在「模型中心」为至少一个模型配置 Base URL 与 API Key");
        }

        List<Agent> agents = new ArrayList<>();
        AgentTeam team = teamRepository.findAll().stream()
                .sorted(Comparator.comparingLong(item -> item.createdAt))
                .findFirst().orElse(null);
        if (team != null) {
            for (String agentId : JsonLists.read(team.agentIdsJson)) {
                agentRepository.findById(agentId).ifPresent(agents::add);
            }
        }
        if (agents.isEmpty()) {
            agents = new ArrayList<>(agentRepository.findAll().stream()
                    .filter(agent -> agent.enabled)
                    .sorted(Comparator.comparingLong(agent -> agent.createdAt))
                    .toList());
        }
        if (agents.isEmpty()) {
            throw ApiException.badRequest("没有可用的 Agent，请先在「Agent 配置」中创建");
        }

        List<MemberSpec> members = new ArrayList<>();
        for (Agent agent : agents) {
            ModelConfig model = usable.stream()
                    .filter(item -> item.id.equals(agent.model))
                    .findFirst()
                    .orElse(usable.get(0));
            members.add(new MemberSpec(agent, model));
        }
        return members;
    }

    private ProjectBuildDto toDto(ProjectBuild build) {
        List<ProjectStage> stages = stageRepository.findByBuildIdOrderBySeqAsc(build.id);
        List<TaskItem> tasks = taskRepository.findByBuildIdOrderByOrderIndexAsc(build.id);
        return new ProjectBuildDto(build.id, build.projectId, build.projectName, build.stack, build.requirement,
                build.status, build.currentStage, build.summary, build.stageCount, build.doneStages,
                build.fileCount, build.testRounds, build.lastTestOutput, build.testsPassed,
                build.gitCommit, build.gitBranch, build.createdAt, build.startedAt, build.finishedAt,
                build.updatedAt, stages, tasks);
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String tail(String text, int max) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(trimmed.length() - max);
    }
}
