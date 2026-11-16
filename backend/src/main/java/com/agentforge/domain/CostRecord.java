package com.agentforge.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** 费用记录：每次模型调用写入一条，token 为估算值。 */
@Entity
@Table(name = "cost_records", indexes = {
        @Index(name = "idx_cost_records_conversation", columnList = "conversationId"),
        @Index(name = "idx_cost_records_created", columnList = "createdAt")
})
public class CostRecord {

    @Id
    public String id;

    public String projectId;

    public String conversationId;

    public String agentId;

    public String modelId;

    public int promptTokens;

    public int completionTokens;

    public int totalTokens;

    public String currency;

    /** 金额（按模型单价换算，未配置单价时为 0）。 */
    public double amount;

    public long createdAt;
}
