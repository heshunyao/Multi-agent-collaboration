package com.agentforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/** 项目构建事件总线：复用统一的事件缓存与 SSE 推送实现，按构建 ID 隔离。 */
@Component
public class ProjectEventBus extends SseEventBus {

    public ProjectEventBus(ObjectMapper mapper) {
        super(mapper);
    }
}
