package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Agent 团队：有序的 Agent 组合，顺序执行时按列表顺序依次工作。 */
@Entity
@Table(name = "agent_teams")
public class AgentTeam {

    @Id
    public String id;

    public String name;

    @Column(length = 1000)
    public String description;

    /** sequential / group */
    public String mode;

    /** 团队成员 Agent ID 列表（JSON），顺序即执行顺序。 */
    @Column(length = 4000)
    public String agentIdsJson = "[]";

    public long createdAt;

    public long updatedAt;
}
