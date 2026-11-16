package com.agentforge.repo;

import com.agentforge.domain.AgentTeam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentTeamRepository extends JpaRepository<AgentTeam, String> {

    List<AgentTeam> findAllByOrderByUpdatedAtDesc();
}
