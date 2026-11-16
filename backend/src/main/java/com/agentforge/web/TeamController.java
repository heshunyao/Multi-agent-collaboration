package com.agentforge.web;

import com.agentforge.domain.Agent;
import com.agentforge.domain.AgentTeam;
import com.agentforge.service.TeamService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/teams")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return teamService.list().stream().map(this::withMembers).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody TeamService.TeamInput input) {
        return withMembers(teamService.create(input));
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        return withMembers(teamService.require(id));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody TeamService.TeamInput input) {
        return withMembers(teamService.update(id, input));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        teamService.delete(id);
        return Map.of("ok", true);
    }

    /** 团队信息 + 成员摘要，前端组队卡片直接消费。 */
    private Map<String, Object> withMembers(AgentTeam team) {
        List<Agent> agents = teamService.members(team);
        List<Map<String, Object>> members = agents.stream().map(agent -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", agent.id);
            item.put("name", agent.name);
            item.put("role", agent.role);
            item.put("icon", agent.icon);
            item.put("model", agent.model);
            return item;
        }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", team.id);
        result.put("name", team.name);
        result.put("description", team.description);
        result.put("mode", team.mode);
        result.put("agentIds", agents.stream().map(agent -> agent.id).toList());
        result.put("members", members);
        result.put("createdAt", team.createdAt);
        result.put("updatedAt", team.updatedAt);
        return result;
    }
}
