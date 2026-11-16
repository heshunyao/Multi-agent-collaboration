package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.dto.AgentDto;
import com.agentforge.dto.AgentInput;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.ModelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
public class AgentService {

    private final AgentRepository agentRepository;
    private final ModelRepository modelRepository;
    private final ConversationService conversationService;
    private final AuditService auditService;

    public AgentService(AgentRepository agentRepository,
                        ModelRepository modelRepository,
                        ConversationService conversationService,
                        AuditService auditService) {
        this.agentRepository = agentRepository;
        this.modelRepository = modelRepository;
        this.conversationService = conversationService;
        this.auditService = auditService;
    }

    public List<AgentDto> list(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return agentRepository.findAll().stream()
                .filter(agent -> q.isEmpty() || matches(agent, q))
                .sorted(Comparator.comparingLong(agent -> agent.createdAt))
                .map(AgentService::toDto)
                .toList();
    }

    public Agent require(String id) {
        return agentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Agent 不存在"));
    }

    @Transactional
    public AgentDto create(AgentInput input) {
        String name = trim(input.name());
        if (name.isEmpty()) {
            throw ApiException.badRequest("Agent 名称不能为空");
        }
        Agent agent = new Agent();
        agent.id = Ids.shortId("agent");
        agent.createdAt = System.currentTimeMillis();
        agent.updatedAt = agent.createdAt;
        agent.temperature = 0.3;
        agent.enabled = true;
        apply(agent, input);
        agent.name = name;
        agentRepository.save(agent);
        auditService.record("agent.create", "agent", agent.id, "创建 Agent：" + agent.name, true);
        return toDto(agent);
    }

    @Transactional
    public AgentDto update(String id, AgentInput input) {
        Agent agent = require(id);
        apply(agent, input);
        agent.updatedAt = System.currentTimeMillis();
        agentRepository.save(agent);
        auditService.record("agent.update", "agent", agent.id, "更新 Agent：" + agent.name, true);
        return toDto(agent);
    }

    @Transactional
    public void delete(String id) {
        Agent agent = require(id);
        conversationService.deleteByAgent(id);
        agentRepository.delete(agent);
        auditService.record("agent.delete", "agent", id, "删除 Agent：" + agent.name, true);
    }

    private void apply(Agent agent, AgentInput input) {
        if (input.name() != null) {
            String name = trim(input.name());
            if (name.isEmpty()) {
                throw ApiException.badRequest("Agent 名称不能为空");
            }
            agent.name = name;
        }
        if (agent.name == null) {
            throw ApiException.badRequest("Agent 名称不能为空");
        }
        if (input.role() != null) {
            agent.role = trim(input.role());
        }
        if (input.model() != null) {
            agent.model = trim(input.model());
        }
        if (agent.model == null || agent.model.isEmpty()) {
            agent.model = modelRepository.findAll().stream()
                    .min(Comparator.comparingLong(model -> model.createdAt))
                    .map(model -> model.id)
                    .orElse("");
        }
        if (input.icon() != null) {
            agent.icon = trim(input.icon());
        }
        if (agent.icon == null || agent.icon.isEmpty()) {
            agent.icon = "generic";
        }
        if (input.responsibilities() != null) {
            agent.responsibilitiesJson = JsonLists.write(input.responsibilities());
        }
        if (input.tools() != null) {
            agent.toolsJson = JsonLists.write(input.tools());
        }
        if (input.systemPrompt() != null) {
            agent.systemPrompt = input.systemPrompt();
        }
        if (input.temperature() != null) {
            agent.temperature = Math.min(1, Math.max(0, input.temperature()));
        }
        if (input.enabled() != null) {
            agent.enabled = input.enabled();
        }
    }

    private static boolean matches(Agent agent, String q) {
        StringBuilder sb = new StringBuilder();
        sb.append(agent.name).append(' ').append(agent.role).append(' ');
        JsonLists.read(agent.responsibilitiesJson).forEach(item -> sb.append(item).append(' '));
        JsonLists.read(agent.toolsJson).forEach(item -> sb.append(item).append(' '));
        return sb.toString().toLowerCase(Locale.ROOT).contains(q);
    }

    public static AgentDto toDto(Agent agent) {
        return new AgentDto(
                agent.id,
                agent.name,
                agent.role == null ? "" : agent.role,
                agent.model == null ? "" : agent.model,
                agent.icon == null ? "generic" : agent.icon,
                JsonLists.read(agent.responsibilitiesJson),
                JsonLists.read(agent.toolsJson),
                agent.systemPrompt == null ? "" : agent.systemPrompt,
                agent.temperature,
                agent.enabled,
                agent.createdAt,
                agent.updatedAt
        );
    }

    static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
