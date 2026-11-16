package com.agentforge.dto;

public record ConversationSummaryDto(
        String id,
        String agentId,
        String title,
        long createdAt,
        long updatedAt,
        long messageCount,
        String preview
) {
}
