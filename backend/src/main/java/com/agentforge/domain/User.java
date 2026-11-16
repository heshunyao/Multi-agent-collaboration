package com.agentforge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 用户：单用户开发态下由启动器自动创建。 */
@Entity
@Table(name = "app_users")
public class User {

    @Id
    public String id;

    @Column(unique = true)
    public String username;

    public String displayName;

    public String email;

    public String roleId;

    public boolean enabled;

    public long createdAt;
}
