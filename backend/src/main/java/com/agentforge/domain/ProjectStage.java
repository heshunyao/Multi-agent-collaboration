package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** 项目构建流水线中的单个阶段（需求分析、架构设计、任务拆解、代码生成、测试、修复、交付）。 */
@Entity
@Table(name = "project_stages", indexes = {
        @Index(name = "idx_project_stages_build", columnList = "buildId, seq")
})
public class ProjectStage {

    @Id
    public String id;

    public String buildId;

    public String projectId;

    public int seq;

    public String stageKey;

    public String title;

    public String agentId;

    public String agentName;

    /** pending / running / done / failed */
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
