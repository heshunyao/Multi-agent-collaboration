package com.agentforge.web;

import com.agentforge.domain.CostRecord;
import com.agentforge.service.CostService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/costs")
public class CostController {

    private final CostService costService;

    public CostController(CostService costService) {
        this.costService = costService;
    }

    @GetMapping
    public List<CostRecord> list(@RequestParam(name = "conversationId", required = false) String conversationId) {
        if (conversationId == null || conversationId.isBlank()) {
            return costService.recent();
        }
        return costService.byConversation(conversationId);
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        return costService.summary();
    }
}
