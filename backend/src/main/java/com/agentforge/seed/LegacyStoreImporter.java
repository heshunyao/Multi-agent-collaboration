package com.agentforge.seed;

import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.ChatMessage;
import com.agentforge.domain.Conversation;
import com.agentforge.domain.ModelConfig;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.ChatMessageRepository;
import com.agentforge.repo.ConversationRepository;
import com.agentforge.repo.ModelRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * 一次性迁移：旧版 Node 服务把数据存在 data/store.json。
 * 首次启动且数据库为空时导入，避免用户已配置的模型密钥与历史和对话丢失。
 */
@Component
@Order(0)
public class LegacyStoreImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyStoreImporter.class);

    private final ObjectMapper mapper;
    private final String storePath;
    private final ModelRepository modelRepository;
    private final AgentRepository agentRepository;
    private final ConversationRepository conversationRepository;
    private final ChatMessageRepository messageRepository;

    public LegacyStoreImporter(ObjectMapper mapper,
                               @Value("${agentforge.legacy-store-file:../data/store.json}") String storePath,
                               ModelRepository modelRepository,
                               AgentRepository agentRepository,
                               ConversationRepository conversationRepository,
                               ChatMessageRepository messageRepository) {
        this.mapper = mapper;
        this.storePath = storePath;
        this.modelRepository = modelRepository;
        this.agentRepository = agentRepository;
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (modelRepository.count() > 0 || agentRepository.count() > 0) {
            return;
        }
        Path file = Paths.get(storePath).toAbsolutePath().normalize();
        if (!Files.exists(file)) {
            return;
        }
        try {
            JsonNode root = mapper.readTree(Files.readString(file, StandardCharsets.UTF_8));
            List<ModelConfig> models = importModels(root.path("models"));
            List<Agent> agents = importAgents(root.path("agents"));
            int conversations = importConversations(root.path("conversations"));
            log.info("已从 {} 迁移数据：models={} agents={} conversations={}",
                    file, models.size(), agents.size(), conversations);
        } catch (Exception e) {
            log.warn("迁移旧版 store.json 失败，将使用默认种子数据：{}", e.getMessage());
        }
    }

    private List<ModelConfig> importModels(JsonNode nodes) {
        List<ModelConfig> models = new ArrayList<>();
        long index = 0;
        for (JsonNode node : nodes) {
            ModelConfig model = new ModelConfig();
            model.id = text(node, "id", Ids.shortId("model"));
            model.label = text(node, "label", "模型");
            model.vendor = text(node, "vendor", "自定义");
            model.modelName = text(node, "modelName", "");
            model.baseUrl = text(node, "baseUrl", "").replaceAll("/+$", "");
            model.apiKey = text(node, "apiKey", "");
            model.color = text(node, "color", "#8b93ff");
            model.context = text(node, "context", "—");
            model.price = text(node, "price", "—");
            model.latency = text(node, "latency", "—");
            model.tagsJson = JsonLists.write(stringList(node.path("tags")));
            model.connected = node.path("connected").asBoolean(true);
            // 用递增时间戳保留旧数据中的展示顺序
            model.createdAt = System.currentTimeMillis() + index++;
            model.updatedAt = model.createdAt;
            models.add(model);
        }
        modelRepository.saveAll(models);
        return models;
    }

    private List<Agent> importAgents(JsonNode nodes) {
        List<Agent> agents = new ArrayList<>();
        long index = 0;
        for (JsonNode node : nodes) {
            Agent agent = new Agent();
            agent.id = text(node, "id", Ids.shortId("agent"));
            agent.name = text(node, "name", "Agent");
            agent.role = text(node, "role", "");
            agent.model = text(node, "model", "");
            agent.icon = text(node, "icon", "generic");
            agent.responsibilitiesJson = JsonLists.write(stringList(node.path("responsibilities")));
            agent.toolsJson = JsonLists.write(stringList(node.path("tools")));
            agent.systemPrompt = text(node, "systemPrompt", "");
            agent.temperature = node.path("temperature").asDouble(0.3);
            agent.enabled = node.path("enabled").asBoolean(true);
            // 用递增时间戳保留旧数据中的展示顺序
            agent.createdAt = System.currentTimeMillis() + index++;
            agent.updatedAt = agent.createdAt;
            agents.add(agent);
        }
        agentRepository.saveAll(agents);
        return agents;
    }

    private int importConversations(JsonNode nodes) {
        int count = 0;
        for (JsonNode node : nodes) {
            Conversation conversation = new Conversation();
            conversation.id = text(node, "id", Ids.shortId("conv"));
            conversation.agentId = text(node, "agentId", "");
            conversation.title = text(node, "title", "新对话");
            conversation.createdAt = node.path("createdAt").asLong(System.currentTimeMillis());
            conversation.updatedAt = node.path("updatedAt").asLong(conversation.createdAt);
            conversationRepository.save(conversation);

            long seq = 0;
            for (JsonNode messageNode : node.path("messages")) {
                ChatMessage message = new ChatMessage();
                message.id = text(messageNode, "id", Ids.shortId("msg"));
                message.conversationId = conversation.id;
                message.role = text(messageNode, "role", "user");
                message.content = text(messageNode, "content", "");
                message.reasoning = text(messageNode, "reasoning", null);
                message.modelId = text(messageNode, "modelId", null);
                message.seq = ++seq;
                message.createdAt = messageNode.path("createdAt").asLong(conversation.createdAt);
                message.aborted = messageNode.path("aborted").asBoolean(false);
                message.error = messageNode.path("error").asBoolean(false);
                messageRepository.save(message);
            }
            count++;
        }
        return count;
    }

    private static String text(JsonNode node, String field, String fallback) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? fallback : value.asText(fallback);
    }

    private static List<String> stringList(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(item -> values.add(item.asText()));
        }
        return values;
    }
}
