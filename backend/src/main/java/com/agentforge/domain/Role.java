package com.agentforge.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

/** 角色与权限：权限以字符串集合表达，例：agent:write、model:test、project:read。 */
@Entity
@Table(name = "app_roles")
public class Role {

    @Id
    public String id;

    @Column(unique = true)
    public String code;

    public String name;

    public String description;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Column(name = "permission")
    public List<String> permissions = new ArrayList<>();

    public long createdAt;
}
