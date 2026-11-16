package com.agentforge.web;

import com.agentforge.service.ProjectBuildService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Python 项目流水线轮询构建控制状态，实现暂停 / 继续 / 终止。 */
@RestController
@RequestMapping("/internal/project-builds")
public class InternalProjectController {

    private final ProjectBuildService buildService;

    public InternalProjectController(ProjectBuildService buildService) {
        this.buildService = buildService;
    }

    @GetMapping("/{id}/control")
    public Map<String, String> control(@PathVariable String id) {
        return Map.of("status", buildService.control(id));
    }
}
