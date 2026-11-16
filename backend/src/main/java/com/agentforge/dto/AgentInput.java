package com.agentforge.dto;

import java.util.List;

/** Agent 新增/更新入参；字段为 null 表示"不修改"。 */
public record AgentInput(
        String name,
        String role,
        String model,
        String icon,
        List<String> responsibilities,
        List<String> tools,
        String systemPrompt,
        Double temperature,
        Boolean enabled
) {
}
