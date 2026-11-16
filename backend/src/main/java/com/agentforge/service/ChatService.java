package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.ClientAbortException;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.Conversation;
import com.agentforge.domain.ModelConfig;
import com.agentforge.dto.MessageDto;
import com.agentforge.engine.AgentEngineClient;
import com.agentforge.engine.EngineException;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.ModelRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 流式对话编排：持久化消息 → 调用 Python Agent Engine → 转发 SSE → 记录费用与审计。 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ConversationService conversationService;
    private final AgentRepository agentRepository;
    private final ModelRepository modelRepository;
    private final AgentEngineClient engineClient;
    private final CostService costService;
    private final AuditService auditService;
    private final int historyLimit;

    public ChatService(ConversationService conversationService,
                       AgentRepository agentRepository,
                       ModelRepository modelRepository,
                       AgentEngineClient engineClient,
                       CostService costService,
                       AuditService auditService,
                       @Value("${agentforge.chat.history-limit:20}") int historyLimit) {
        this.conversationService = conversationService;
        this.agentRepository = agentRepository;
        this.modelRepository = modelRepository;
        this.engineClient = engineClient;
        this.costService = costService;
        this.auditService = auditService;
        this.historyLimit = historyLimit;
    }

    /** 校验请求并落库用户消息，保证错误能以标准 JSON 返回而不是 SSE。 */
    @Transactional
    public ChatContext prepare(String conversationId, String rawContent) {
        String content = rawContent == null ? "" : rawContent.trim();
        if (content.isEmpty()) {
            throw ApiException.badRequest("消息内容不能为空");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw ApiException.badRequest("会话 ID 不能为空");
        }
        Conversation conversation = conversationService.require(conversationId);
        Agent agent = agentRepository.findById(conversation.agentId)
                .orElseThrow(() -> ApiException.notFound("Agent 不存在"));
        MessageDto userMessage = conversationService.append(conversationId, "user", content, null, null, false, false);
        conversationService.titleFromFirstMessage(conversationId, content);
        ModelConfig model = (agent.model == null || agent.model.isEmpty())
                ? null
                : modelRepository.findById(agent.model).orElse(null);

        List<MessageDto> all = new ArrayList<>(conversationService.messages(conversationId));
        if (!all.isEmpty()) {
            all.remove(all.size() - 1);
        }
        int from = Math.max(0, all.size() - historyLimit);
        List<Map<String, String>> history = new ArrayList<>();
        for (MessageDto message : all.subList(from, all.size())) {
            Map<String, String> turn = new LinkedHashMap<>();
            turn.put("role", message.role());
            turn.put("content", message.content());
            history.add(turn);
        }
        return new ChatContext(conversation, agent, model, userMessage, history);
    }

    public void stream(ChatContext ctx, SseEmitter emitter) {
        String conversationId = ctx.conversation().id;
        StringBuilder content = new StringBuilder();
        StringBuilder reasoning = new StringBuilder();
        JsonNode[] doneEvent = new JsonNode[1];

        try {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("conversationId", conversationId);
            meta.put("userMessage", ctx.userMessage());
            meta.put("conversation", conversationService.summaryOf(conversationId));
            send(emitter, "meta", meta);

            ModelConfig model = ctx.model();
            if (model == null) {
                send(emitter, "error", Map.of("message", "当前 Agent 绑定的模型不存在，请前往模型中心配置。"));
                return;
            }
            if (model.apiKey == null || model.apiKey.isBlank()) {
                send(emitter, "error", Map.of("message", "「" + model.label + "」尚未配置 API Key，请前往模型中心完成配置后重试。"));
                return;
            }
            if (model.baseUrl == null || model.baseUrl.isBlank()) {
                send(emitter, "error", Map.of("message", "「" + model.label + "」尚未配置 Base URL，请前往模型中心完成配置后重试。"));
                return;
            }

            Map<String, Object> payload = buildPayload(ctx, model);

            engineClient.stream(payload, (event, data) -> {
                switch (event) {
                    case "delta" -> {
                        String text = data.path("text").asText("");
                        if (!text.isEmpty()) {
                            content.append(text);
                            send(emitter, "delta", Map.of("text", text));
                        }
                    }
                    case "reasoning" -> {
                        String text = data.path("text").asText("");
                        if (!text.isEmpty()) {
                            reasoning.append(text);
                            send(emitter, "reasoning", Map.of("text", text));
                        }
                    }
                    case "tool" -> send(emitter, "tool", data);
                    case "done" -> doneEvent[0] = data;
                    case "error" -> throw new EngineException(data.path("message").asText("模型调用失败"));
                    default -> {
                        // 心跳等事件忽略
                    }
                }
            });

            if (doneEvent[0] == null) {
                throw new EngineException("Agent 引擎未返回完整结果，请重试。");
            }
            JsonNode done = doneEvent[0];
            String finalContent = done.path("content").asText("");
            if (finalContent.isEmpty()) {
                finalContent = content.toString();
            }
            String finalReasoning = done.path("reasoning").asText("");
            if (finalReasoning.isEmpty()) {
                finalReasoning = reasoning.toString();
            }
            if (finalContent.isEmpty()) {
                throw new EngineException("模型返回内容为空，请检查模型配置或稍后重试。");
            }

            MessageDto assistant = conversationService.append(conversationId, "assistant", finalContent,
                    finalReasoning.isBlank() ? null : finalReasoning, model.id, false, false);

            Map<String, Object> donePayload = new LinkedHashMap<>();
            donePayload.put("message", assistant);
            donePayload.put("conversation", conversationService.summaryOf(conversationId));
            send(emitter, "done", donePayload);

            JsonNode usage = done.path("usage");
            int promptTokens = usage.path("promptTokens").asInt(0);
            int completionTokens = usage.path("completionTokens").asInt(0);
            if (promptTokens == 0) {
                promptTokens = CostService.estimateTokens(joinPrompt(ctx));
            }
            if (completionTokens == 0) {
                completionTokens = CostService.estimateTokens(finalContent);
            }
            costService.recordChat(conversationId, ctx.agent().id, model, promptTokens, completionTokens);
            auditService.record("chat.completed", "conversation", conversationId,
                    "model=" + model.id + " prompt=" + promptTokens + " completion=" + completionTokens, true);
        } catch (ClientAbortException e) {
            if (content.length() > 0) {
                try {
                    conversationService.append(conversationId, "assistant", content.toString(),
                            reasoning.length() == 0 ? null : reasoning.toString(), ctx.model() == null ? null : ctx.model().id,
                            true, false);
                } catch (Exception persistError) {
                    log.warn("保存中断消息失败", persistError);
                }
            }
            log.info("客户端中断对话 conversationId={}，已停止上游推理", conversationId);
        } catch (EngineException e) {
            log.warn("对话失败 conversationId={}：{}", conversationId, e.getMessage());
            try {
                send(emitter, "error", Map.of("message", e.getMessage()));
            } catch (ClientAbortException ignored) {
                // 浏览器已断开，无需再发
            }
            auditService.record("chat.failed", "conversation", conversationId, e.getMessage(), false);
        } catch (Exception e) {
            log.error("对话异常 conversationId={}", conversationId, e);
            try {
                send(emitter, "error", Map.of("message", "请求模型失败：" + e.getMessage()));
            } catch (ClientAbortException ignored) {
                // 浏览器已断开
            }
        } finally {
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // 已关闭
            }
        }
    }

    private Map<String, Object> buildPayload(ChatContext ctx, ModelConfig model) {
        Agent agent = ctx.agent();

        Map<String, Object> agentSpec = new LinkedHashMap<>();
        agentSpec.put("id", agent.id);
        agentSpec.put("name", agent.name);
        agentSpec.put("role", agent.role);
        agentSpec.put("systemPrompt", agent.systemPrompt == null ? "" : agent.systemPrompt);
        agentSpec.put("temperature", agent.temperature);
        agentSpec.put("tools", JsonLists.read(agent.toolsJson));

        Map<String, Object> modelSpec = new LinkedHashMap<>();
        modelSpec.put("id", model.id);
        modelSpec.put("label", model.label);
        modelSpec.put("modelName", model.modelName == null || model.modelName.isBlank() ? model.id : model.modelName);
        modelSpec.put("baseUrl", model.baseUrl);
        modelSpec.put("apiKey", model.apiKey);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("conversationId", ctx.conversation().id);
        payload.put("agent", agentSpec);
        payload.put("model", modelSpec);

        List<Map<String, String>> messages = new ArrayList<>(ctx.history());
        Map<String, String> current = new LinkedHashMap<>();
        current.put("role", "user");
        current.put("content", ctx.userMessage().content());
        messages.add(current);
        payload.put("messages", messages);
        return payload;
    }

    private String joinPrompt(ChatContext ctx) {
        StringBuilder sb = new StringBuilder();
        if (ctx.agent().systemPrompt != null) {
            sb.append(ctx.agent().systemPrompt);
        }
        ctx.history().forEach(turn -> sb.append(turn.get("content")));
        sb.append(ctx.userMessage().content());
        return sb.toString();
    }

    private void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            throw new ClientAbortException();
        }
    }
}
