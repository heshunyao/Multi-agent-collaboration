package com.agentforge.web;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.domain.GitProject;
import com.agentforge.repo.GitProjectRepository;
import com.agentforge.repo.ProjectRepository;
import org.springframework.http.HttpStatus;
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

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git-projects")
public class GitProjectController {

    public record GitProjectInput(String projectId, String name, String repoUrl, String provider,
                                  String branch, String localPath, String status) {
    }

    private final GitProjectRepository gitProjectRepository;
    private final ProjectRepository projectRepository;

    public GitProjectController(GitProjectRepository gitProjectRepository, ProjectRepository projectRepository) {
        this.gitProjectRepository = gitProjectRepository;
        this.projectRepository = projectRepository;
    }

    @GetMapping
    public List<GitProject> list(@RequestParam(name = "projectId", required = false) String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return gitProjectRepository.findAll();
        }
        return gitProjectRepository.findByProjectId(projectId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GitProject create(@RequestBody GitProjectInput input) {
        if (input.projectId() == null || !projectRepository.existsById(input.projectId())) {
            throw ApiException.badRequest("项目不存在");
        }
        if (input.repoUrl() == null || input.repoUrl().isBlank()) {
            throw ApiException.badRequest("仓库地址不能为空");
        }
        GitProject project = new GitProject();
        project.id = Ids.shortId("git");
        project.projectId = input.projectId();
        project.name = input.name() == null || input.name().isBlank() ? input.repoUrl() : input.name().trim();
        project.repoUrl = input.repoUrl().trim();
        project.provider = input.provider() == null ? "github" : input.provider();
        project.branch = input.branch() == null ? "main" : input.branch();
        project.localPath = input.localPath();
        project.status = input.status() == null ? "disconnected" : input.status();
        project.createdAt = System.currentTimeMillis();
        return gitProjectRepository.save(project);
    }

    @PutMapping("/{id}")
    public GitProject update(@PathVariable String id, @RequestBody GitProjectInput input) {
        GitProject project = gitProjectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Git 项目不存在"));
        if (input.name() != null && !input.name().isBlank()) {
            project.name = input.name().trim();
        }
        if (input.repoUrl() != null && !input.repoUrl().isBlank()) {
            project.repoUrl = input.repoUrl().trim();
        }
        if (input.provider() != null) {
            project.provider = input.provider();
        }
        if (input.branch() != null) {
            project.branch = input.branch();
        }
        if (input.localPath() != null) {
            project.localPath = input.localPath();
        }
        if (input.status() != null) {
            project.status = input.status();
            project.lastSyncedAt = System.currentTimeMillis();
        }
        return gitProjectRepository.save(project);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        GitProject project = gitProjectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Git 项目不存在"));
        gitProjectRepository.delete(project);
        return Map.of("ok", true);
    }
}
