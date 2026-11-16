package com.agentforge.repo;

import com.agentforge.domain.TeamRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TeamRunRepository extends JpaRepository<TeamRun, String> {

    List<TeamRun> findAllByOrderByCreatedAtDesc();

    List<TeamRun> findByTeamIdOrderByCreatedAtDesc(String teamId);

    void deleteByTeamId(String teamId);
}
