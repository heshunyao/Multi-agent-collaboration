package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** 一次多 Agent 协作运行。status: pending / running / paused / done / failed / cancelled */
@Entity
@Table(name = "team_runs", indexes = {
        @Index(name = "idx_team_runs_created", columnList = "createdAt")
})
public class TeamRun {

    @Id
    public String id;

    public String teamId;

    public String teamName;

    public String title;

    @Lob
    public String prompt;

    /** sequential / group */
    public String mode;

    public String status;

    @Lob
    public String summary;

    public long createdAt;

    public long startedAt;

    public long finishedAt;

    public long updatedAt;
}
