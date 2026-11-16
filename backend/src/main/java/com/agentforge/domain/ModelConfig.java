package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 模型配置（OpenAI 兼容协议）。apiKey 只存服务端，永不下发浏览器。 */
@Entity
@Table(name = "model_configs")
public class ModelConfig {

    @Id
    public String id;

    public String label;

    public String vendor;

    public String modelName;

    public String baseUrl;

    public String apiKey;

    public String color;

    @Column(name = "context_info")
    public String context;

    public String price;

    public String latency;

    @Column(length = 2000)
    public String tagsJson = "[]";

    public boolean connected;

    public long createdAt;

    public long updatedAt;
}
