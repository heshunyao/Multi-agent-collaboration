package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "project_tasks", indexes = {
        @Index(name = "idx_project_tasks_project", columnList = "projectId")
})
public class TaskItem {

    @Id
    public String id;

    public String projectId;

    /** 由哪次 AI 构建拆解产生，手工任务为空。 */
    public String buildId;

    /** frontend / backend / database / devops / general */
    public String area;

    public String title;

    @Column(length = 4000)
    public String description;

    /** todo / doing / review / done */
    public String status;

    /** low / medium / high */
    public String priority;

    /** 执行该任务的 Agent ID。 */
    public String assigneeAgentId;

    public int orderIndex;

    public long createdAt;

    public long updatedAt;
}
