package com.agentforge.web;

import com.agentforge.service.RunService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Python Agent Engine 轮询运行控制状态，实现暂停 / 继续 / 终止。 */
@RestController
@RequestMapping("/internal/runs")
public class InternalRunController {

    private final RunService runService;

    public InternalRunController(RunService runService) {
        this.runService = runService;
    }

    @GetMapping("/{id}/control")
    public Map<String, String> control(@PathVariable String id) {
        return Map.of("status", runService.control(id));
    }
}
