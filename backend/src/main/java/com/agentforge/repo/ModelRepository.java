package com.agentforge.repo;

import com.agentforge.domain.ModelConfig;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ModelRepository extends JpaRepository<ModelConfig, String> {
}
