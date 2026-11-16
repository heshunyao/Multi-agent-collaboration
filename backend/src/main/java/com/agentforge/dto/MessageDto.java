package com.agentforge.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MessageDto(
        String id,
        String role,
        String content,
        String reasoning,
        String modelId,
        long createdAt,
        Boolean aborted,
        Boolean error
) {
}
