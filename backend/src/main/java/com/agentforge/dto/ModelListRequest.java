package com.agentforge.dto;

/** 拉取供应商可用模型列表的请求，apiKey 留空时使用已保存的 Key。 */
public record ModelListRequest(String id, String baseUrl, String apiKey) {
}
