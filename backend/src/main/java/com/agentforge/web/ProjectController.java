package com.agentforge.web;

import com.agentforge.domain.Project;
import com.agentforge.domain.TaskItem;
import com.agentforge.dto.ProjectBuildDto;
import com.agentforge.dto.ProjectDetailDto;
import com.agentforge.dto.ProjectSummaryDto;
import com.agentforge.service.GitService;
import com.agentforge.service.ProjectBuildService;
import com.agentforge.service.ProjectService;
import com.agentforge.service.WorkspaceService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    public record BuildRequest(String requirement, String stack) {
    }

    public record FileWriteRequest(String path, String content) {
    }

    public record CommitRequest(String message, String buildId) {
    }

    public record BranchRequest(String name) {
    }

    private final ProjectService projectService;
    private final ProjectBuildService buildService;
    private final WorkspaceService workspaceService;
    private final GitService gitService;

    public ProjectController(ProjectService projectService,
                             ProjectBuildService buildService,
                             WorkspaceService workspaceService,
                             GitService gitService) {
        this.projectService = projectService;
        this.buildService = buildService;
        this.workspaceService = workspaceService;
        this.gitService = gitService;
    }

    @GetMapping
    public List<ProjectSummaryDto> list() {
        return projectService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Project create(@RequestBody ProjectService.ProjectInput input) {
        return projectService.create(input);
    }

    @GetMapping("/{id}")
    public ProjectDetailDto detail(@PathVariable String id) {
        return projectService.detail(id);
    }

    @PutMapping("/{id}")
    public Project update(@PathVariable String id, @RequestBody ProjectService.ProjectInput input) {
        return projectService.update(id, input);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        projectService.delete(id);
        return Map.of("ok", true);
    }

    @GetMapping("/{id}/tasks")
    public List<TaskItem> tasks(@PathVariable String id) {
        return projectService.tasks(id);
    }

    @PostMapping("/{id}/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskItem createTask(@PathVariable String id, @RequestBody ProjectService.TaskInput input) {
        return projectService.createTask(id, input);
    }

    /* ---------- AI 构建 ---------- */

    @PostMapping("/{id}/build")
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectBuildDto build(@PathVariable String id, @RequestBody(required = false) BuildRequest request) {
        BuildRequest body = request == null ? new BuildRequest(null, null) : request;
        return buildService.start(id, body.requirement(), body.stack());
    }

    @GetMapping("/{id}/builds")
    public List<ProjectBuildDto> builds(@PathVariable String id) {
        projectService.require(id);
        return buildService.list(id);
    }

    /* ---------- 文件管理 ---------- */

    @GetMapping("/{id}/files")
    public Map<String, Object> files(@PathVariable String id) {
        projectService.require(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tree", workspaceService.tree(id));
        result.put("fileCount", workspaceService.countFiles(id));
        result.put("workspace", workspaceService.relativePath(id));
        return result;
    }

    @GetMapping("/{id}/file")
    public Map<String, Object> readFile(@PathVariable String id, @RequestParam("path") String path) {
        projectService.require(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", path);
        result.put("content", workspaceService.readFile(id, path));
        return result;
    }

    @PutMapping("/{id}/file")
    public Map<String, Object> writeFile(@PathVariable String id, @RequestBody FileWriteRequest request) {
        projectService.require(id);
        long bytes = workspaceService.writeFile(id, request.path(), request.content());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("path", request.path());
        result.put("bytes", bytes);
        return result;
    }

    @DeleteMapping("/{id}/file")
    public Map<String, Object> deleteFile(@PathVariable String id, @RequestParam("path") String path) {
        projectService.require(id);
        workspaceService.deleteFile(id, path);
        return Map.of("ok", true);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable String id) {
        Project project = projectService.require(id);
        byte[] data = workspaceService.zip(id);
        String filename = project.name.replaceAll("[\\\\/:*?\"<>|]", "_") + ".zip";
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(data.length)
                .body(data);
    }

    /* ---------- Git ---------- */

    @GetMapping("/{id}/git")
    public Map<String, Object> git(@PathVariable String id) {
        projectService.require(id);
        return gitService.status(id);
    }

    @PostMapping("/{id}/git/commit")
    public Map<String, Object> commit(@PathVariable String id, @RequestBody(required = false) CommitRequest request) {
        projectService.require(id);
        CommitRequest body = request == null ? new CommitRequest(null, null) : request;
        String message = body.message() == null || body.message().isBlank()
                ? "chore: 人工提交项目变更" : body.message();
        var commit = gitService.commit(id, body.buildId(), message);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", commit != null);
        result.put("commit", commit);
        result.put("message", commit == null ? "工作区没有可提交的变更" : "提交成功");
        return result;
    }

    @PostMapping("/{id}/git/branch")
    public Map<String, Object> branch(@PathVariable String id, @RequestBody BranchRequest request) {
        projectService.require(id);
        return gitService.createBranch(id, request.name());
    }

    @PostMapping("/{id}/git/checkout")
    public Map<String, Object> checkout(@PathVariable String id, @RequestBody BranchRequest request) {
        projectService.require(id);
        return gitService.checkout(id, request.name());
    }
}
