package com.agentforge.dto;

import java.util.List;

/** 模型新增/更新入参；字段为 null 表示"不修改"，apiKey 传空串表示保留原值。 */
public record ModelInput(
        String label,
        String vendor,
        String modelName,
        String baseUrl,
        String apiKey,
        String color,
        String context,
        String price,
        String latency,
        List<String> tags,
        Boolean connected
) {
}
