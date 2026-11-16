package com.agentforge.web;

import com.agentforge.domain.TaskItem;
import com.agentforge.service.ProjectService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final ProjectService projectService;

    public TaskController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public List<TaskItem> list(@RequestParam(name = "projectId", required = false) String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return List.of();
        }
        return projectService.tasks(projectId);
    }

    @GetMapping("/{id}")
    public TaskItem detail(@PathVariable String id) {
        return projectService.requireTask(id);
    }

    @PutMapping("/{id}")
    public TaskItem update(@PathVariable String id, @RequestBody ProjectService.TaskInput input) {
        return projectService.updateTask(id, input);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        projectService.deleteTask(id);
        return Map.of("ok", true);
    }
}
