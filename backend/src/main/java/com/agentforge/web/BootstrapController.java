package com.agentforge.web;

import com.agentforge.dto.BootstrapDto;
import com.agentforge.engine.AgentEngineClient;
import com.agentforge.service.AgentService;
import com.agentforge.service.ConversationService;
import com.agentforge.service.ModelService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class BootstrapController {

    private final AgentService agentService;
    private final ModelService modelService;
    private final ConversationService conversationService;
    private final AgentEngineClient engineClient;

    public BootstrapController(AgentService agentService,
                               ModelService modelService,
                               ConversationService conversationService,
                               AgentEngineClient engineClient) {
        this.agentService = agentService;
        this.modelService = modelService;
        this.conversationService = conversationService;
        this.engineClient = engineClient;
    }

    @GetMapping("/bootstrap")
    public BootstrapDto bootstrap() {
        return new BootstrapDto(agentService.list(""), modelService.list(), conversationService.list(null));
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("time", System.currentTimeMillis());
        result.put("service", "agentforge-backend");
        result.put("engine", engineClient.isHealthy() ? "up" : "down");
        return result;
    }
}
