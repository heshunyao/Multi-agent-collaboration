package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** 项目工作区的一次 Git 提交记录。 */
@Entity
@Table(name = "git_commits", indexes = {
        @Index(name = "idx_git_commits_project", columnList = "projectId, createdAt")
})
public class GitCommit {

    @Id
    public String id;

    public String projectId;

    public String buildId;

    public String hash;

    public String shortHash;

    public String branch;

    @Column(length = 2000)
    public String message;

    public int fileCount;

    public long createdAt;
}
