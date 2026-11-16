package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.ModelConfig;
import com.agentforge.dto.ModelDto;
import com.agentforge.dto.ModelInput;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.ModelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Service
public class ModelService {

    private final ModelRepository modelRepository;
    private final AgentRepository agentRepository;
    private final AuditService auditService;

    public ModelService(ModelRepository modelRepository,
                        AgentRepository agentRepository,
                        AuditService auditService) {
        this.modelRepository = modelRepository;
        this.agentRepository = agentRepository;
        this.auditService = auditService;
    }

    public List<ModelDto> list() {
        return modelRepository.findAll().stream()
                .sorted(Comparator.comparingLong(model -> model.createdAt))
                .map(ModelService::toDto)
                .toList();
    }

    public ModelConfig require(String id) {
        return modelRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("模型不存在"));
    }

    @Transactional
    public ModelDto create(ModelInput input) {
        String label = trim(input.label());
        if (label.isEmpty()) {
            throw ApiException.badRequest("模型名称不能为空");
        }
        ModelConfig model = new ModelConfig();
        model.id = Ids.shortId("model");
        model.createdAt = System.currentTimeMillis();
        model.updatedAt = model.createdAt;
        model.connected = true;
        model.color = "#8b93ff";
        apply(model, input);
        model.label = label;
        modelRepository.save(model);
        auditService.record("model.create", "model", model.id, "接入模型：" + model.label, true);
        return toDto(model);
    }

    @Transactional
    public ModelDto update(String id, ModelInput input) {
        ModelConfig model = require(id);
        apply(model, input);
        model.updatedAt = System.currentTimeMillis();
        modelRepository.save(model);
        auditService.record("model.update", "model", model.id, "更新模型：" + model.label, true);
        return toDto(model);
    }

    @Transactional
    public void delete(String id) {
        ModelConfig model = require(id);
        List<Agent> bound = agentRepository.findAll().stream()
                .filter(agent -> id.equals(agent.model))
                .toList();
        if (!bound.isEmpty()) {
            String names = bound.stream().map(agent -> agent.name).reduce((a, b) -> a + "、" + b).orElse("");
            throw ApiException.conflict("该模型已被 " + bound.size() + " 个 Agent 使用，请先修改绑定（" + names + "）");
        }
        modelRepository.delete(model);
        auditService.record("model.delete", "model", id, "删除模型：" + model.label, true);
    }

    private void apply(ModelConfig model, ModelInput input) {
        if (input.label() != null) {
            String label = trim(input.label());
            if (label.isEmpty()) {
                throw ApiException.badRequest("模型名称不能为空");
            }
            model.label = label;
        }
        if (model.label == null) {
            throw ApiException.badRequest("模型名称不能为空");
        }
        if (input.vendor() != null) {
            model.vendor = trim(input.vendor());
        } else if (model.vendor == null) {
            model.vendor = "自定义";
        }
        if (input.modelName() != null) {
            model.modelName = trim(input.modelName());
        } else if (model.modelName == null) {
            model.modelName = "";
        }
        if (input.baseUrl() != null) {
            model.baseUrl = trimBase(input.baseUrl());
        } else if (model.baseUrl == null) {
            model.baseUrl = "";
        }
        if (input.apiKey() != null && !input.apiKey().trim().isEmpty()) {
            model.apiKey = input.apiKey().trim();
        } else if (model.apiKey == null) {
            model.apiKey = "";
        }
        if (input.color() != null && !input.color().isBlank()) {
            model.color = input.color();
        }
        if (input.context() != null) {
            model.context = input.context();
        } else if (model.context == null) {
            model.context = "—";
        }
        if (input.price() != null) {
            model.price = input.price();
        } else if (model.price == null) {
            model.price = "—";
        }
        if (input.latency() != null) {
            model.latency = input.latency();
        } else if (model.latency == null) {
            model.latency = "—";
        }
        if (input.tags() != null) {
            model.tagsJson = JsonLists.write(input.tags());
        } else if (model.tagsJson == null) {
            model.tagsJson = "[]";
        }
        if (input.connected() != null) {
            model.connected = input.connected();
        }
    }

    public static ModelDto toDto(ModelConfig model) {
        return new ModelDto(
                model.id,
                model.label,
                model.vendor,
                model.modelName,
                model.baseUrl,
                maskKey(model.apiKey),
                model.apiKey != null && !model.apiKey.isEmpty(),
                model.color,
                model.context,
                model.price,
                model.latency,
                JsonLists.read(model.tagsJson),
                model.connected,
                model.createdAt,
                model.updatedAt
        );
    }

    private static String maskKey(String apiKey) {
        if (apiKey == null || apiKey.isEmpty()) {
            return "";
        }
        String head = apiKey.substring(0, Math.min(3, apiKey.length()));
        String tail = apiKey.substring(Math.max(0, apiKey.length() - 4));
        return head + "••••" + tail;
    }

    public static String trimBase(String baseUrl) {
        return baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
