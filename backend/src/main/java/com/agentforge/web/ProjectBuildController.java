package com.agentforge.web;

import com.agentforge.dto.ProjectBuildDto;
import com.agentforge.service.ProjectBuildService;
import com.agentforge.service.ProjectEventBus;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/** AI 项目构建：详情、事件流与人工干预。 */
@RestController
@RequestMapping("/api/project-builds")
public class ProjectBuildController {

    private final ProjectBuildService buildService;
    private final ProjectEventBus eventBus;

    public ProjectBuildController(ProjectBuildService buildService, ProjectEventBus eventBus) {
        this.buildService = buildService;
        this.eventBus = eventBus;
    }

    @GetMapping("/{id}")
    public ProjectBuildDto detail(@PathVariable String id) {
        return buildService.detail(id);
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String id, HttpServletResponse response) {
        ProjectBuildDto detail = buildService.detail(id);
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        SseEmitter emitter = eventBus.subscribe(id);
        boolean finished = "done".equals(detail.status()) || "failed".equals(detail.status())
                || "cancelled".equals(detail.status());
        if (finished) {
            eventBus.complete(id);
        }
        return emitter;
    }

    @PostMapping("/{id}/pause")
    public Map<String, Object> pause(@PathVariable String id) {
        buildService.pause(id);
        return Map.of("ok", true, "status", buildService.require(id).status);
    }

    @PostMapping("/{id}/resume")
    public Map<String, Object> resume(@PathVariable String id) {
        buildService.resume(id);
        return Map.of("ok", true, "status", buildService.require(id).status);
    }

    @PostMapping("/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable String id) {
        buildService.cancel(id);
        return Map.of("ok", true, "status", buildService.require(id).status);
    }
}
