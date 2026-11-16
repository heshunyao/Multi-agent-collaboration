package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "projects")
public class Project {

    @Id
    public String id;

    public String name;

    @Column(length = 2000)
    public String description;

    /** planning / building / ready / failed / archived */
    public String status;

    public String ownerId;

    /** 技术栈：java-react / node-react / python-fastapi */
    public String stack;

    /** 用户原始需求，AI 构建的唯一输入。 */
    @Lob
    public String requirement;

    /** 相对工作区路径：workspaces/<projectId> */
    public String workspacePath;

    public long createdAt;

    public long updatedAt;
}
