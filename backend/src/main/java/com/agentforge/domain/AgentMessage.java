package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** Agent 之间的消息：任务分配、讨论发言、阶段结果。 */
@Entity
@Table(name = "agent_messages", indexes = {
        @Index(name = "idx_agent_messages_run", columnList = "runId, seq")
})
public class AgentMessage {

    @Id
    public String id;

    public String runId;

    public String stepId;

    public long seq;

    public String fromAgentId;

    public String fromName;

    public String toAgentId;

    public String toName;

    /** assignment / discussion / result / summary / system */
    public String kind;

    @Lob
    public String content;

    public long createdAt;
}
