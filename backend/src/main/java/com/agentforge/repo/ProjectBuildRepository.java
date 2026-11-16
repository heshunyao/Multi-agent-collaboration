package com.agentforge.repo;

import com.agentforge.domain.ProjectBuild;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectBuildRepository extends JpaRepository<ProjectBuild, String> {

    List<ProjectBuild> findByProjectIdOrderByCreatedAtDesc(String projectId);

    List<ProjectBuild> findAllByOrderByCreatedAtDesc();

    ProjectBuild findFirstByProjectIdOrderByCreatedAtDesc(String projectId);

    void deleteByProjectId(String projectId);
}
