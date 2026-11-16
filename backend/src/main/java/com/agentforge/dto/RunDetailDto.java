package com.agentforge.dto;

import java.util.List;

public record RunDetailDto(
        String id,
        String teamId,
        String teamName,
        String title,
        String prompt,
        String mode,
        String status,
        String summary,
        long createdAt,
        long startedAt,
        long finishedAt,
        long updatedAt,
        List<RunStepDto> steps,
        List<RunMessageDto> messages
) {
}
