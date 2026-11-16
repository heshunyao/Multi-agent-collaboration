package com.agentforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * SSE 事件总线基类：把执行事件实时推给浏览器，并缓存最近事件以支持中途接入。
 * 协作运行与项目构建各自持有独立实例，按 ID 隔离。
 */
public abstract class SseEventBus {

    private static final Logger log = LoggerFactory.getLogger(SseEventBus.class);
    private static final int MAX_EVENTS = 4000;
    private static final long TIMEOUT_MS = 1_800_000L;

    private record Buffered(String name, String json) {
    }

    private final ObjectMapper mapper;
    private final Map<String, List<Buffered>> history = new ConcurrentHashMap<>();
    private final Map<String, List<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    protected SseEventBus(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    private Object lock(String id) {
        return locks.computeIfAbsent(id, key -> new Object());
    }

    public void publish(String id, String event, Object data) {
        String json;
        try {
            json = mapper.writeValueAsString(data);
        } catch (Exception e) {
            log.warn("序列化事件失败 event={}", event, e);
            return;
        }
        synchronized (lock(id)) {
            List<Buffered> events = history.computeIfAbsent(id, key -> new ArrayList<>());
            events.add(new Buffered(event, json));
            if (events.size() > MAX_EVENTS) {
                events.remove(0);
            }
            List<SseEmitter> emitters = subscribers.get(id);
            if (emitters == null) {
                return;
            }
            for (SseEmitter emitter : emitters) {
                if (!write(emitter, event, json)) {
                    emitters.remove(emitter);
                }
            }
        }
    }

    public SseEmitter subscribe(String id) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        synchronized (lock(id)) {
            for (Buffered buffered : history.getOrDefault(id, List.of())) {
                write(emitter, buffered.name(), buffered.json());
            }
            subscribers.computeIfAbsent(id, key -> new CopyOnWriteArrayList<>()).add(emitter);
        }
        emitter.onCompletion(() -> remove(id, emitter));
        emitter.onTimeout(() -> remove(id, emitter));
        emitter.onError(error -> remove(id, emitter));
        return emitter;
    }

    private void remove(String id, SseEmitter emitter) {
        List<SseEmitter> emitters = subscribers.get(id);
        if (emitters != null) {
            emitters.remove(emitter);
        }
    }

    /** 结束后关闭所有订阅连接，避免浏览器与 curl 长期挂起。 */
    public void complete(String id) {
        List<SseEmitter> emitters = subscribers.remove(id);
        if (emitters == null) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // 已关闭
            }
        }
    }

    private boolean write(SseEmitter emitter, String event, String json) {
        try {
            emitter.send(SseEmitter.event().name(event).data(json, MediaType.TEXT_PLAIN));
            return true;
        } catch (IOException | IllegalStateException e) {
            return false;
        }
    }
}
