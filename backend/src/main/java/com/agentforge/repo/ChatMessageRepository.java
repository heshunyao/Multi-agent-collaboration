package com.agentforge.repo;

import com.agentforge.domain.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, String> {

    List<ChatMessage> findByConversationIdOrderBySeqAsc(String conversationId);

    long countByConversationId(String conversationId);

    void deleteByConversationId(String conversationId);

    @Query("select coalesce(max(m.seq), 0) from ChatMessage m where m.conversationId = :conversationId")
    long maxSeq(@Param("conversationId") String conversationId);
}
