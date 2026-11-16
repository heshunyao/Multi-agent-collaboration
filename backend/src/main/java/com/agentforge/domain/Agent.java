package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** Agent 配置（业务侧只做存储与编排参数，推理由 Python Agent Engine 执行）。 */
@Entity
@Table(name = "agents")
public class Agent {

    @Id
    public String id;

    public String name;

    public String role;

    /** 绑定的模型 ID，对应 {@link ModelConfig#id}。 */
    public String model;

    public String icon;

    @Column(length = 4000)
    public String responsibilitiesJson = "[]";

    @Column(length = 4000)
    public String toolsJson = "[]";

    @Lob
    public String systemPrompt;

    public double temperature;

    public boolean enabled;

    public long createdAt;

    public long updatedAt;
}
