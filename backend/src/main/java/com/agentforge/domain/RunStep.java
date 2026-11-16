package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** 运行中的单个 Agent 步骤。 */
@Entity
@Table(name = "run_steps", indexes = {
        @Index(name = "idx_run_steps_run", columnList = "runId, seq")
})
public class RunStep {

    @Id
    public String id;

    public String runId;

    public int seq;

    public String agentId;

    public String agentName;

    public String title;

    /** pending / running / done / failed / skipped */
    public String status;

    @Lob
    public String content;

    @Lob
    public String reasoning;

    @Column(length = 2000)
    public String error;

    public int promptTokens;

    public int completionTokens;

    public long startedAt;

    public long finishedAt;
}
