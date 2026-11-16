package com.agentforge.web;

import com.agentforge.dto.ChatRequest;
import com.agentforge.service.ChatContext;
import com.agentforge.service.ChatService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.concurrent.Executor;

/** 浏览器 <-> Java：SSE 契约与前端既有实现保持一致。 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final long SSE_TIMEOUT_MS = 600_000L;

    private final ChatService chatService;
    private final Executor chatExecutor;

    public ChatController(ChatService chatService, @Qualifier("chatExecutor") Executor chatExecutor) {
        this.chatService = chatService;
        this.chatExecutor = chatExecutor;
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestBody ChatRequest request, HttpServletResponse response) {
        ChatContext context = chatService.prepare(request.conversationId(), request.content());

        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        chatExecutor.execute(() -> chatService.stream(context, emitter));
        return emitter;
    }
}
