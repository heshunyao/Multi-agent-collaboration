package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** 一次 AI 项目构建（需求分析 → 交付的完整流水线）。 */
@Entity
@Table(name = "project_builds", indexes = {
        @Index(name = "idx_project_builds_project", columnList = "projectId, createdAt")
})
public class ProjectBuild {

    @Id
    public String id;

    public String projectId;

    public String projectName;

    /** java-react / node-react / python-fastapi */
    public String stack;

    @Lob
    public String requirement;

    /** pending / running / paused / done / failed / cancelled */
    public String status;

    public String currentStage;

    @Lob
    public String summary;

    public int stageCount;

    public int doneStages;

    public int fileCount;

    public int testRounds;

    @Lob
    public String lastTestOutput;

    public boolean testsPassed;

    public String gitCommit;

    public String gitBranch;

    public long createdAt;

    public long startedAt;

    public long finishedAt;

    public long updatedAt;
}
