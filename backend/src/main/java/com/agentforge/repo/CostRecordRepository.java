package com.agentforge.repo;

import com.agentforge.domain.CostRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CostRecordRepository extends JpaRepository<CostRecord, String> {

    List<CostRecord> findTop200ByOrderByCreatedAtDesc();

    List<CostRecord> findByConversationIdOrderByCreatedAtAsc(String conversationId);

    @Query("select coalesce(sum(c.totalTokens), 0) from CostRecord c")
    long sumTotalTokens();

    @Query("select coalesce(sum(c.amount), 0) from CostRecord c")
    double sumAmount();
}
