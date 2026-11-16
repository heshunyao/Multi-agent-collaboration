package com.agentforge.service;

import com.agentforge.common.Ids;
import com.agentforge.domain.AuditLog;
import com.agentforge.repo.AuditLogRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/** 审计：所有写操作与模型调用在此留痕。 */
@Service
public class AuditService {

    /** 单用户开发态下的固定操作者。 */
    public static final String DEV_ACTOR = "dev";

    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    public void record(String action, String targetType, String targetId, String detail, boolean success) {
        AuditLog log = new AuditLog();
        log.id = Ids.shortId("audit");
        log.actor = DEV_ACTOR;
        log.action = action;
        log.targetType = targetType;
        log.targetId = targetId;
        log.detail = detail;
        log.success = success;
        log.createdAt = System.currentTimeMillis();
        repository.save(log);
    }

    public List<AuditLog> recent() {
        return repository.findTop200ByOrderByCreatedAtDesc();
    }
}
