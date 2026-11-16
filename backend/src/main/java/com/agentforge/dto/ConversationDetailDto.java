package com.agentforge.dto;

import java.util.List;

public record ConversationDetailDto(
        String id,
        String agentId,
        String title,
        long createdAt,
        long updatedAt,
        long messageCount,
        String preview,
        List<MessageDto> messages
) {
}
