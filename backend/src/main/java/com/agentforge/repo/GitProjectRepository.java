package com.agentforge.repo;

import com.agentforge.domain.GitProject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GitProjectRepository extends JpaRepository<GitProject, String> {

    List<GitProject> findByProjectId(String projectId);
}
