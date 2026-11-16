package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.AgentTeam;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.AgentTeamRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/** Agent 团队管理：组队、调整成员与协作模式。 */
@Service
public class TeamService {

    public record TeamInput(String name, String description, String mode, List<String> agentIds) {
    }

    private final AgentTeamRepository teamRepository;
    private final AgentRepository agentRepository;
    private final RunService runService;
    private final AuditService auditService;

    public TeamService(AgentTeamRepository teamRepository,
                       AgentRepository agentRepository,
                       RunService runService,
                       AuditService auditService) {
        this.teamRepository = teamRepository;
        this.agentRepository = agentRepository;
        this.runService = runService;
        this.auditService = auditService;
    }

    public List<AgentTeam> list() {
        return teamRepository.findAllByOrderByUpdatedAtDesc();
    }

    public AgentTeam require(String id) {
        return teamRepository.findById(id).orElseThrow(() -> ApiException.notFound("团队不存在"));
    }

    public List<Agent> members(AgentTeam team) {
        List<Agent> agents = new ArrayList<>();
        for (String agentId : JsonLists.read(team.agentIdsJson)) {
            agentRepository.findById(agentId).ifPresent(agents::add);
        }
        return agents;
    }

    @Transactional
    public AgentTeam create(TeamInput input) {
        if (input.name() == null || input.name().isBlank()) {
            throw ApiException.badRequest("团队名称不能为空");
        }
        List<String> agentIds = normalizeAgents(input.agentIds());
        if (agentIds.size() < 2) {
            throw ApiException.badRequest("团队至少需要 2 个 Agent");
        }
        long now = System.currentTimeMillis();
        AgentTeam team = new AgentTeam();
        team.id = Ids.shortId("team");
        team.name = input.name().trim();
        team.description = input.description() == null ? "" : input.description();
        team.mode = normalizeMode(input.mode());
        team.agentIdsJson = JsonLists.write(agentIds);
        team.createdAt = now;
        team.updatedAt = now;
        teamRepository.save(team);
        auditService.record("team.create", "team", team.id, "创建团队：" + team.name, true);
        return team;
    }

    @Transactional
    public AgentTeam update(String id, TeamInput input) {
        AgentTeam team = require(id);
        if (input.name() != null) {
            if (input.name().isBlank()) {
                throw ApiException.badRequest("团队名称不能为空");
            }
            team.name = input.name().trim();
        }
        if (input.description() != null) {
            team.description = input.description();
        }
        if (input.mode() != null) {
            team.mode = normalizeMode(input.mode());
        }
        if (input.agentIds() != null) {
            List<String> agentIds = normalizeAgents(input.agentIds());
            if (agentIds.size() < 2) {
                throw ApiException.badRequest("团队至少需要 2 个 Agent");
            }
            team.agentIdsJson = JsonLists.write(agentIds);
        }
        team.updatedAt = System.currentTimeMillis();
        teamRepository.save(team);
        auditService.record("team.update", "team", team.id, "更新团队：" + team.name, true);
        return team;
    }

    @Transactional
    public void delete(String id) {
        AgentTeam team = require(id);
        runService.deleteByTeam(id);
        teamRepository.delete(team);
        auditService.record("team.delete", "team", id, "删除团队：" + team.name, true);
    }

    private List<String> normalizeAgents(List<String> agentIds) {
        List<String> result = new ArrayList<>();
        if (agentIds == null) {
            return result;
        }
        for (String agentId : agentIds) {
            if (agentId == null || agentId.isBlank()) {
                continue;
            }
            if (!agentRepository.existsById(agentId)) {
                throw ApiException.badRequest("Agent 不存在：" + agentId);
            }
            if (!result.contains(agentId)) {
                result.add(agentId);
            }
        }
        return result;
    }

    private static String normalizeMode(String mode) {
        return "group".equalsIgnoreCase(mode) ? "group" : "sequential";
    }
}
