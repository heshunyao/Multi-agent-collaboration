package com.agentforge.dto;

public record RunSummaryDto(
        String id,
        String teamId,
        String teamName,
        String title,
        String prompt,
        String mode,
        String status,
        int stepCount,
        int doneCount,
        long createdAt,
        long startedAt,
        long finishedAt
) {
}
