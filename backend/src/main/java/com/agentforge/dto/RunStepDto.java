package com.agentforge.dto;

public record RunStepDto(
        String id,
        int seq,
        String agentId,
        String agentName,
        String title,
        String status,
        String content,
        String reasoning,
        String error,
        int promptTokens,
        int completionTokens,
        long startedAt,
        long finishedAt
) {
}
