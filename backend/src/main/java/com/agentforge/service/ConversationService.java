package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.domain.ChatMessage;
import com.agentforge.domain.Conversation;
import com.agentforge.dto.ConversationDetailDto;
import com.agentforge.dto.ConversationSummaryDto;
import com.agentforge.dto.MessageDto;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.ChatMessageRepository;
import com.agentforge.repo.ConversationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final ChatMessageRepository messageRepository;
    private final AgentRepository agentRepository;

    public ConversationService(ConversationRepository conversationRepository,
                               ChatMessageRepository messageRepository,
                               AgentRepository agentRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.agentRepository = agentRepository;
    }

    public List<ConversationSummaryDto> list(String agentId) {
        List<Conversation> conversations = (agentId == null || agentId.isBlank())
                ? conversationRepository.findAllByOrderByUpdatedAtDesc()
                : conversationRepository.findByAgentIdOrderByUpdatedAtDesc(agentId);
        return conversations.stream().map(this::toSummary).toList();
    }

    public Conversation require(String id) {
        return conversationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("会话不存在"));
    }

    @Transactional
    public ConversationDetailDto create(String agentId, String title) {
        if (agentId == null || !agentRepository.existsById(agentId)) {
            throw ApiException.badRequest("Agent 不存在");
        }
        long now = System.currentTimeMillis();
        Conversation conversation = new Conversation();
        conversation.id = Ids.shortId("conv");
        conversation.agentId = agentId;
        conversation.title = normalizeTitle(title);
        conversation.createdAt = now;
        conversation.updatedAt = now;
        conversationRepository.save(conversation);
        return new ConversationDetailDto(conversation.id, conversation.agentId, conversation.title,
                conversation.createdAt, conversation.updatedAt, 0, "", List.of());
    }

    public ConversationDetailDto detail(String id) {
        Conversation conversation = require(id);
        List<MessageDto> messages = messages(id);
        ConversationSummaryDto summary = toSummary(conversation);
        return new ConversationDetailDto(summary.id(), summary.agentId(), summary.title(), summary.createdAt(),
                summary.updatedAt(), summary.messageCount(), summary.preview(), messages);
    }

    public ConversationSummaryDto summaryOf(String id) {
        return toSummary(require(id));
    }

    @Transactional
    public void delete(String id) {
        Conversation conversation = require(id);
        messageRepository.deleteByConversationId(id);
        conversationRepository.delete(conversation);
    }

    @Transactional
    public void deleteByAgent(String agentId) {
        List<Conversation> conversations = conversationRepository.findByAgentIdOrderByUpdatedAtDesc(agentId);
        conversations.forEach(conversation -> messageRepository.deleteByConversationId(conversation.id));
        conversationRepository.deleteByAgentId(agentId);
    }

    public List<MessageDto> messages(String conversationId) {
        return messageRepository.findByConversationIdOrderBySeqAsc(conversationId).stream()
                .map(ConversationService::toDto)
                .toList();
    }

    /** 追加一条消息并推进会话更新时间；返回持久化后的 DTO。 */
    @Transactional
    public MessageDto append(String conversationId, String role, String content, String reasoning,
                             String modelId, boolean aborted, boolean error) {
        Conversation conversation = require(conversationId);
        ChatMessage message = new ChatMessage();
        message.id = Ids.shortId("msg");
        message.conversationId = conversationId;
        message.role = role;
        message.content = content;
        message.reasoning = reasoning;
        message.modelId = modelId;
        message.seq = messageRepository.maxSeq(conversationId) + 1;
        message.createdAt = System.currentTimeMillis();
        message.aborted = aborted;
        message.error = error;
        messageRepository.save(message);
        conversation.updatedAt = message.createdAt;
        conversationRepository.save(conversation);
        return toDto(message);
    }

    /** 首条用户消息用作会话标题。 */
    @Transactional
    public void titleFromFirstMessage(String conversationId, String text) {
        Conversation conversation = require(conversationId);
        if (messageRepository.countByConversationId(conversationId) == 1) {
            conversation.title = text.replaceAll("\\s+", " ").trim();
            if (conversation.title.length() > 24) {
                conversation.title = conversation.title.substring(0, 24);
            }
            conversationRepository.save(conversation);
        }
    }

    @Transactional
    public void touch(String conversationId, long timestamp) {
        Conversation conversation = require(conversationId);
        conversation.updatedAt = timestamp;
        conversationRepository.save(conversation);
    }

    private ConversationSummaryDto toSummary(Conversation conversation) {
        List<ChatMessage> messages = messageRepository.findByConversationIdOrderBySeqAsc(conversation.id);
        ChatMessage last = messages.isEmpty() ? null : messages.get(messages.size() - 1);
        String preview = "";
        if (last != null && last.content != null) {
            String normalized = last.content.replaceAll("\\s+", " ").trim();
            preview = normalized.length() > 60 ? normalized.substring(0, 60) : normalized;
        }
        return new ConversationSummaryDto(conversation.id, conversation.agentId, conversation.title,
                conversation.createdAt, conversation.updatedAt, messages.size(), preview);
    }

    private static String normalizeTitle(String title) {
        String value = title == null ? "" : title.trim();
        if (value.isEmpty()) {
            value = "新对话";
        }
        return value.length() > 40 ? value.substring(0, 40) : value;
    }

    static MessageDto toDto(ChatMessage message) {
        return new MessageDto(
                message.id,
                message.role,
                message.content == null ? "" : message.content,
                message.reasoning == null || message.reasoning.isBlank() ? null : message.reasoning,
                message.modelId,
                message.createdAt,
                message.aborted ? Boolean.TRUE : null,
                message.error ? Boolean.TRUE : null
        );
    }
}
