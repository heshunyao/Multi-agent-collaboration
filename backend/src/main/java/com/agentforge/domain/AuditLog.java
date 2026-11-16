package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "audit_logs", indexes = {
        @Index(name = "idx_audit_logs_created", columnList = "createdAt")
})
public class AuditLog {

    @Id
    public String id;

    /** 操作者（开发态默认 dev）。 */
    public String actor;

    /** 例：agent.create、model.update、chat.stream */
    public String action;

    public String targetType;

    public String targetId;

    @Lob
    public String detail;

    public boolean success;

    public long createdAt;
}
