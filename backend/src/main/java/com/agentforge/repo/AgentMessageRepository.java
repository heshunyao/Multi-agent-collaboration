package com.agentforge.repo;

import com.agentforge.domain.AgentMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AgentMessageRepository extends JpaRepository<AgentMessage, String> {

    List<AgentMessage> findByRunIdOrderBySeqAsc(String runId);

    void deleteByRunId(String runId);

    @Query("select coalesce(max(m.seq), 0) from AgentMessage m where m.runId = :runId")
    long maxSeq(@Param("runId") String runId);
}
