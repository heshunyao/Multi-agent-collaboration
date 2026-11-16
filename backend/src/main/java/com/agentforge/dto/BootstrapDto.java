package com.agentforge.dto;

import java.util.List;

public record BootstrapDto(
        List<AgentDto> agents,
        List<ModelDto> models,
        List<ConversationSummaryDto> conversations
) {
}
