package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.domain.Project;
import com.agentforge.domain.ProjectBuild;
import com.agentforge.domain.TaskItem;
import com.agentforge.dto.ProjectBuildDto;
import com.agentforge.dto.ProjectDetailDto;
import com.agentforge.dto.ProjectSummaryDto;
import com.agentforge.repo.GitProjectRepository;
import com.agentforge.repo.ProjectBuildRepository;
import com.agentforge.repo.ProjectRepository;
import com.agentforge.repo.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 项目与任务：为用户输入的自然语言需求提供结构化承载，并聚合构建、文件与 Git 结果。 */
@Service
public class ProjectService {

    public record ProjectInput(String name, String description, String status, String ownerId,
                               String stack, String requirement) {
    }

    public record TaskInput(String title, String description, String status, String priority,
                            String assigneeAgentId, Integer orderIndex) {
    }

    private final ProjectRepository projectRepository;
    private final TaskRepository taskRepository;
    private final GitProjectRepository gitProjectRepository;
    private final ProjectBuildRepository buildRepository;
    private final ProjectBuildService buildService;
    private final WorkspaceService workspaceService;
    private final GitService gitService;
    private final AuditService auditService;

    public ProjectService(ProjectRepository projectRepository,
                          TaskRepository taskRepository,
                          GitProjectRepository gitProjectRepository,
                          ProjectBuildRepository buildRepository,
                          ProjectBuildService buildService,
                          WorkspaceService workspaceService,
                          GitService gitService,
                          AuditService auditService) {
        this.projectRepository = projectRepository;
        this.taskRepository = taskRepository;
        this.gitProjectRepository = gitProjectRepository;
        this.buildRepository = buildRepository;
        this.buildService = buildService;
        this.workspaceService = workspaceService;
        this.gitService = gitService;
        this.auditService = auditService;
    }

    public List<ProjectSummaryDto> list() {
        return projectRepository.findAllByOrderByUpdatedAtDesc().stream().map(project -> {
            ProjectBuild latest = buildRepository.findFirstByProjectIdOrderByCreatedAtDesc(project.id);
            return new ProjectSummaryDto(
                    project.id, project.name, project.description, project.status,
                    project.stack == null ? "java-react" : project.stack,
                    project.requirement == null ? "" : project.requirement,
                    project.workspacePath == null ? "" : project.workspacePath,
                    project.createdAt, project.updatedAt,
                    latest == null ? "" : latest.id,
                    latest == null ? "" : latest.status,
                    latest == null ? "" : (latest.currentStage == null ? "" : latest.currentStage),
                    latest == null ? 0 : latest.fileCount,
                    latest == null ? 0 : latest.testRounds,
                    latest == null ? 0 : latest.createdAt);
        }).toList();
    }

    public Project require(String id) {
        return projectRepository.findById(id).orElseThrow(() -> ApiException.notFound("项目不存在"));
    }

    public ProjectDetailDto detail(String id) {
        Project project = require(id);
        ProjectBuild latest = buildRepository.findFirstByProjectIdOrderByCreatedAtDesc(id);
        ProjectBuildDto build = latest == null ? null : buildService.detail(latest.id);
        return new ProjectDetailDto(
                project.id, project.name, project.description, project.status,
                project.stack == null ? "java-react" : project.stack,
                project.requirement == null ? "" : project.requirement,
                project.workspacePath == null ? "" : project.workspacePath,
                project.createdAt, project.updatedAt,
                build,
                gitService.commits(id),
                workspaceService.tree(id),
                workspaceService.countFiles(id));
    }

    @Transactional
    public Project create(ProjectInput input) {
        if (input.name() == null || input.name().isBlank()) {
            throw ApiException.badRequest("项目名称不能为空");
        }
        String stack = input.stack() == null || input.stack().isBlank() ? "java-react" : input.stack();
        if (!ProjectBuildService.STACKS.contains(stack)) {
            throw ApiException.badRequest("不支持的技术栈：" + stack);
        }
        long now = System.currentTimeMillis();
        Project project = new Project();
        project.id = Ids.shortId("proj");
        project.name = input.name().trim();
        project.description = input.description() == null ? "" : input.description();
        project.status = input.status() == null ? "planning" : input.status();
        project.ownerId = input.ownerId() == null ? AuditService.DEV_ACTOR : input.ownerId();
        project.stack = stack;
        project.requirement = input.requirement() == null ? "" : input.requirement();
        project.createdAt = now;
        project.updatedAt = now;
        projectRepository.save(project);
        project.workspacePath = workspaceService.relativePath(project.id);
        workspaceService.ensureProjectRoot(project.id);
        projectRepository.save(project);
        auditService.record("project.create", "project", project.id, "创建项目：" + project.name, true);
        return project;
    }

    @Transactional
    public Project update(String id, ProjectInput input) {
        Project project = require(id);
        if (input.name() != null) {
            if (input.name().isBlank()) {
                throw ApiException.badRequest("项目名称不能为空");
            }
            project.name = input.name().trim();
        }
        if (input.description() != null) {
            project.description = input.description();
        }
        if (input.status() != null) {
            project.status = input.status();
        }
        if (input.ownerId() != null) {
            project.ownerId = input.ownerId();
        }
        if (input.stack() != null && !input.stack().isBlank()) {
            if (!ProjectBuildService.STACKS.contains(input.stack())) {
                throw ApiException.badRequest("不支持的技术栈：" + input.stack());
            }
            project.stack = input.stack();
        }
        if (input.requirement() != null) {
            project.requirement = input.requirement();
        }
        project.updatedAt = System.currentTimeMillis();
        projectRepository.save(project);
        return project;
    }

    @Transactional
    public void delete(String id) {
        Project project = require(id);
        taskRepository.deleteByProjectId(id);
        gitProjectRepository.deleteAll(gitProjectRepository.findByProjectId(id));
        buildService.deleteForProject(id);
        workspaceService.deleteWorkspace(id);
        projectRepository.delete(project);
        auditService.record("project.delete", "project", id, "删除项目：" + project.name, true);
    }

    public List<TaskItem> tasks(String projectId) {
        return taskRepository.findByProjectIdOrderByOrderIndexAscCreatedAtAsc(projectId);
    }

    @Transactional
    public TaskItem createTask(String projectId, TaskInput input) {
        require(projectId);
        if (input.title() == null || input.title().isBlank()) {
            throw ApiException.badRequest("任务标题不能为空");
        }
        long now = System.currentTimeMillis();
        TaskItem task = new TaskItem();
        task.id = Ids.shortId("task");
        task.projectId = projectId;
        task.area = "general";
        task.title = input.title().trim();
        task.description = input.description() == null ? "" : input.description();
        task.status = input.status() == null ? "todo" : input.status();
        task.priority = input.priority() == null ? "medium" : input.priority();
        task.assigneeAgentId = input.assigneeAgentId();
        task.orderIndex = input.orderIndex() == null ? tasks(projectId).size() : input.orderIndex();
        task.createdAt = now;
        task.updatedAt = now;
        taskRepository.save(task);
        return task;
    }

    @Transactional
    public TaskItem updateTask(String id, TaskInput input) {
        TaskItem task = taskRepository.findById(id).orElseThrow(() -> ApiException.notFound("任务不存在"));
        if (input.title() != null) {
            if (input.title().isBlank()) {
                throw ApiException.badRequest("任务标题不能为空");
            }
            task.title = input.title().trim();
        }
        if (input.description() != null) {
            task.description = input.description();
        }
        if (input.status() != null) {
            task.status = input.status();
        }
        if (input.priority() != null) {
            task.priority = input.priority();
        }
        if (input.assigneeAgentId() != null) {
            task.assigneeAgentId = input.assigneeAgentId();
        }
        if (input.orderIndex() != null) {
            task.orderIndex = input.orderIndex();
        }
        task.updatedAt = System.currentTimeMillis();
        taskRepository.save(task);
        return task;
    }

    @Transactional
    public void deleteTask(String id) {
        TaskItem task = taskRepository.findById(id).orElseThrow(() -> ApiException.notFound("任务不存在"));
        taskRepository.delete(task);
    }

    public TaskItem requireTask(String id) {
        return taskRepository.findById(id).orElseThrow(() -> ApiException.notFound("任务不存在"));
    }
}
