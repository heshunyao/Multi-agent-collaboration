package com.agentforge.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    public String id;

    public String agentId;

    public String title;

    public long createdAt;

    public long updatedAt;
}
