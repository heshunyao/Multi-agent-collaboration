package com.agentforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/** 多 Agent 协作运行事件总线。 */
@Component
public class RunEventBus extends SseEventBus {

    public RunEventBus(ObjectMapper mapper) {
        super(mapper);
    }
}
