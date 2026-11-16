package com.agentforge.repo;

import com.agentforge.domain.GitCommit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GitCommitRepository extends JpaRepository<GitCommit, String> {

    List<GitCommit> findByProjectIdOrderByCreatedAtDesc(String projectId);

    GitCommit findFirstByProjectIdOrderByCreatedAtDesc(String projectId);

    void deleteByProjectId(String projectId);
}
