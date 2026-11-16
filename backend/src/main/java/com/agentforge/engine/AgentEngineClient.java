package com.agentforge.engine;

import com.agentforge.common.ClientAbortException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Python Agent Engine 客户端：通过内部 SSE 接口转发推理请求。
 * LangGraph 调度、Agent Loop、上下文管理、工具调用都在引擎侧完成。
 */
@Component
public class AgentEngineClient {

    private static final Logger log = LoggerFactory.getLogger(AgentEngineClient.class);

    public interface EventHandler {
        void onEvent(String event, JsonNode data);
    }

    private final ObjectMapper mapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final long timeoutMs;

    public AgentEngineClient(ObjectMapper mapper,
                             @Value("${agentforge.engine.base-url}") String baseUrl,
                             @Value("${agentforge.engine.timeout-ms:300000}") long timeoutMs) {
        this.mapper = mapper;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.timeoutMs = timeoutMs;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }

    public boolean isHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/health"))
                    .timeout(Duration.ofSeconds(2))
                    .GET()
                    .build();
            return httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    public void stream(Object payload, EventHandler handler) {
        stream("/internal/agent/stream", payload, handler);
    }

    /** 调用引擎的任意 SSE 接口（单 Agent 对话 / 多 Agent 协作）。 */
    public void stream(String path, Object payload, EventHandler handler) {
        String body;
        try {
            body = mapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new EngineException("请求序列化失败：" + e.getMessage(), e);
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (ConnectException e) {
            throw new EngineException("Agent 引擎未启动（" + baseUrl + "），请先运行 Python Agent Engine。", e);
        } catch (IOException e) {
            throw new EngineException("调用 Agent 引擎失败：" + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EngineException("调用 Agent 引擎被中断", e);
        }

        try (InputStream stream = response.body()) {
            if (response.statusCode() >= 400) {
                String text = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
                throw new EngineException("Agent 引擎返回错误（HTTP " + response.statusCode() + "）：" + text);
            }
            readEvents(stream, handler);
        } catch (ClientAbortException | EngineException e) {
            throw e;
        } catch (IOException e) {
            throw new EngineException("读取 Agent 引擎流失败：" + e.getMessage(), e);
        }
    }

    private void readEvents(InputStream stream, EventHandler handler) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        String event = "message";
        StringBuilder data = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isEmpty()) {
                if (!data.isEmpty()) {
                    dispatch(event, data.toString(), handler);
                    event = "message";
                    data.setLength(0);
                }
                continue;
            }
            if (line.startsWith("event:")) {
                event = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
                data.append(line.substring(5).trim());
            }
        }
        if (!data.isEmpty()) {
            dispatch(event, data.toString(), handler);
        }
    }

    private void dispatch(String event, String raw, EventHandler handler) {
        try {
            handler.onEvent(event, mapper.readTree(raw));
        } catch (ClientAbortException e) {
            throw e;
        } catch (EngineException e) {
            // 模型/业务错误必须向上抛出，保留上游真实原因，不能吞掉
            throw e;
        } catch (Exception e) {
            log.warn("解析引擎事件失败 event={} raw={}", event, raw, e);
        }
    }
}
