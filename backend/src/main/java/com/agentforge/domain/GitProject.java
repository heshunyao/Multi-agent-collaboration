package com.agentforge.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Git 仓库绑定：Webhook / 分支策略等后续在此扩展。 */
@Entity
@Table(name = "git_projects")
public class GitProject {

    @Id
    public String id;

    public String projectId;

    public String name;

    public String repoUrl;

    /** github / gitlab / gitee / local */
    public String provider;

    public String branch;

    public String localPath;

    /** connected / disconnected / syncing */
    public String status;

    public long lastSyncedAt;

    public long createdAt;
}
