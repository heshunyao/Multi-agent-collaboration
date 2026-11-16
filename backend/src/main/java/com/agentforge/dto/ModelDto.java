package com.agentforge.dto;

import java.util.List;

public record ModelDto(
        String id,
        String label,
        String vendor,
        String modelName,
        String baseUrl,
        String apiKeyMasked,
        boolean hasKey,
        String color,
        String context,
        String price,
        String latency,
        List<String> tags,
        boolean connected,
        long createdAt,
        long updatedAt
) {
}
