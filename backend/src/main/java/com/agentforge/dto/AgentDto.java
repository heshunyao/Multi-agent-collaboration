package com.agentforge.dto;

import java.util.List;

public record AgentDto(
        String id,
        String name,
        String role,
        String model,
        String icon,
        List<String> responsibilities,
        List<String> tools,
        String systemPrompt,
        double temperature,
        boolean enabled,
        long createdAt,
        long updatedAt
) {
}
