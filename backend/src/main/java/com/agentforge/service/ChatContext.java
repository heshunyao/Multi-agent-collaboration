package com.agentforge.service;

import com.agentforge.domain.Agent;
import com.agentforge.domain.Conversation;
import com.agentforge.domain.ModelConfig;
import com.agentforge.dto.MessageDto;

import java.util.List;
import java.util.Map;

/** 一次流式对话所需的上下文快照。 */
public record ChatContext(
        Conversation conversation,
        Agent agent,
        ModelConfig model,
        MessageDto userMessage,
        List<Map<String, String>> history
) {
}
