package com.agentforge.dto;

public record RunMessageDto(
        String id,
        String stepId,
        long seq,
        String fromAgentId,
        String fromName,
        String toAgentId,
        String toName,
        String kind,
        String content,
        long createdAt
) {
}
