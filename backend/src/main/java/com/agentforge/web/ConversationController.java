package com.agentforge.web;

import com.agentforge.dto.ConversationDetailDto;
import com.agentforge.dto.ConversationSummaryDto;
import com.agentforge.service.ConversationService;
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

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    public record CreateConversationRequest(String agentId, String title) {
    }

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @GetMapping
    public List<ConversationSummaryDto> list(@RequestParam(name = "agentId", required = false) String agentId) {
        return conversationService.list(agentId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConversationDetailDto create(@RequestBody CreateConversationRequest request) {
        return conversationService.create(request.agentId(), request.title());
    }

    @GetMapping("/{id}")
    public ConversationDetailDto detail(@PathVariable String id) {
        return conversationService.detail(id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        conversationService.delete(id);
        return Map.of("ok", true);
    }
}
