package com.agentforge.repo;

import com.agentforge.domain.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationRepository extends JpaRepository<Conversation, String> {

    List<Conversation> findAllByOrderByUpdatedAtDesc();

    List<Conversation> findByAgentIdOrderByUpdatedAtDesc(String agentId);

    void deleteByAgentId(String agentId);
}
