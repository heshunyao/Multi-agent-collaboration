package com.agentforge.repo;

import com.agentforge.domain.ProjectStage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectStageRepository extends JpaRepository<ProjectStage, String> {

    List<ProjectStage> findByBuildIdOrderBySeqAsc(String buildId);

    void deleteByBuildId(String buildId);

    void deleteByProjectId(String projectId);
}
