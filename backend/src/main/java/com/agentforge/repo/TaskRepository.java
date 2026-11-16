package com.agentforge.repo;

import com.agentforge.domain.TaskItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskRepository extends JpaRepository<TaskItem, String> {

    List<TaskItem> findByProjectIdOrderByOrderIndexAscCreatedAtAsc(String projectId);

    List<TaskItem> findByBuildIdOrderByOrderIndexAsc(String buildId);

    void deleteByProjectId(String projectId);

    void deleteByBuildId(String buildId);
}
