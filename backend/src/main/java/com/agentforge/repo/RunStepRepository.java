package com.agentforge.repo;

import com.agentforge.domain.RunStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RunStepRepository extends JpaRepository<RunStep, String> {

    List<RunStep> findByRunIdOrderBySeqAsc(String runId);

    void deleteByRunId(String runId);
}
