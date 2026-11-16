package com.agentforge.web;

import com.agentforge.dto.RunDetailDto;
import com.agentforge.dto.RunSummaryDto;
import com.agentforge.service.RunEventBus;
import com.agentforge.service.RunService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/runs")
public class RunController {

    public record CreateRunRequest(String teamId, String prompt) {
    }

    private final RunService runService;
    private final RunEventBus eventBus;

    public RunController(RunService runService, RunEventBus eventBus) {
        this.runService = runService;
        this.eventBus = eventBus;
    }

    @GetMapping
    public List<RunSummaryDto> list(@RequestParam(name = "teamId", required = false) String teamId,
                                    @RequestParam(name = "limit", defaultValue = "30") int limit) {
        return runService.list(teamId, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RunDetailDto create(@RequestBody CreateRunRequest request) {
        return runService.create(request.teamId(), request.prompt());
    }

    @GetMapping("/{id}")
    public RunDetailDto detail(@PathVariable String id) {
        return runService.detail(id);
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String id, HttpServletResponse response) {
        RunDetailDto detail = runService.detail(id);
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
        runService.pause(id);
        return Map.of("ok", true, "status", runService.require(id).status);
    }

    @PostMapping("/{id}/resume")
    public Map<String, Object> resume(@PathVariable String id) {
        runService.resume(id);
        return Map.of("ok", true, "status", runService.require(id).status);
    }

    @PostMapping("/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable String id) {
        runService.cancel(id);
        return Map.of("ok", true, "status", runService.require(id).status);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        runService.delete(id);
        return Map.of("ok", true);
    }
}
