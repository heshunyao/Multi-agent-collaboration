package com.agentforge.web;

import com.agentforge.dto.AgentDto;
import com.agentforge.dto.AgentInput;
import com.agentforge.service.AgentService;
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
@RequestMapping("/api/agents")
public class AgentController {

    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping
    public List<AgentDto> list(@RequestParam(name = "q", required = false) String query) {
        return agentService.list(query);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AgentDto create(@RequestBody AgentInput input) {
        return agentService.create(input);
    }

    @PutMapping("/{id}")
    public AgentDto update(@PathVariable String id, @RequestBody AgentInput input) {
        return agentService.update(id, input);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        agentService.delete(id);
        return Map.of("ok", true);
    }
}
