package com.agentforge.service;

import com.agentforge.domain.ModelConfig;
import com.agentforge.dto.ModelListRequest;
import com.agentforge.dto.ModelListResult;
import com.agentforge.dto.ModelOption;
import com.agentforge.dto.ModelTestRequest;
import com.agentforge.dto.ModelTestResult;
import com.agentforge.repo.ModelRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** 模型连通性测试：先探测 /models，失败再试一次极小 token 的 /chat/completions。 */
@Service
public class ModelTestService {

    private final ModelRepository modelRepository;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    public ModelTestService(ModelRepository modelRepository, ObjectMapper mapper) {
        this.modelRepository = modelRepository;
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public ModelTestResult test(ModelTestRequest request) {
        ModelConfig stored = request.id() == null ? null : modelRepository.findById(request.id()).orElse(null);

        String base = ModelService.trimBase(
                request.baseUrl() != null && !request.baseUrl().isBlank()
                        ? request.baseUrl()
                        : stored != null ? stored.baseUrl : "");
        String key = request.apiKey() != null && !request.apiKey().isBlank()
                ? request.apiKey().trim()
                : stored != null ? stored.apiKey : "";
        String modelName = request.modelName() != null && !request.modelName().isBlank()
                ? request.modelName().trim()
                : stored != null ? stored.modelName : "";

        if (base.isEmpty()) {
            return ModelTestResult.fail("缺少 Base URL");
        }
        if (key == null || key.isEmpty()) {
            return ModelTestResult.fail("缺少 API Key");
        }

        long started = System.currentTimeMillis();
        boolean hasModel = !modelName.isEmpty();
        if (!hasModel) {
            try {
                HttpResponse<String> listResponse = httpClient.send(
                        HttpRequest.newBuilder(URI.create(base + "/models"))
                                .timeout(Duration.ofSeconds(15))
                                .header("Authorization", "Bearer " + key)
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());

                if (listResponse.statusCode() >= 200 && listResponse.statusCode() < 300) {
                    long latency = System.currentTimeMillis() - started;
                    Integer count = countModels(listResponse.body());
                    return ModelTestResult.ok(latency, count == null ? "连接成功" : "连接成功 · 可用模型 " + count + " 个");
                }
            } catch (Exception ignored) {
                // /models 不可用，退化为对话接口探测
            }
        }

        try {
            String body = mapper.writeValueAsString(java.util.Map.of(
                    "model", modelName.isEmpty() ? "default" : modelName,
                    "messages", java.util.List.of(java.util.Map.of("role", "user", "content", "ping")),
                    "max_tokens", 1,
                    "stream", false));

            HttpResponse<String> chatResponse = httpClient.send(
                    HttpRequest.newBuilder(URI.create(base + "/chat/completions"))
                            .timeout(Duration.ofSeconds(15))
                            .header("Authorization", "Bearer " + key)
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());

            long latency = System.currentTimeMillis() - started;
            if (chatResponse.statusCode() >= 200 && chatResponse.statusCode() < 300) {
                return ModelTestResult.ok(latency, "连接成功 · 模型 " + modelName + " 可用");
            }
            return ModelTestResult.fail(latency, providerError(chatResponse.statusCode(), chatResponse.body()));
        } catch (HttpTimeoutException e) {
            return ModelTestResult.fail("连接超时，请检查 Base URL 与网络");
        } catch (ConnectException e) {
            return ModelTestResult.fail("连接失败：无法访问 " + base);
        } catch (IllegalArgumentException e) {
            return ModelTestResult.fail("Base URL 格式不正确");
        } catch (Exception e) {
            return ModelTestResult.fail("连接失败：" + e.getMessage());
        }
    }

    /** 拉取供应商 /models 返回的可用模型，供选择模型标识。 */
    public ModelListResult listModels(ModelListRequest request) {
        ModelConfig stored = request.id() == null ? null : modelRepository.findById(request.id()).orElse(null);

        String base = ModelService.trimBase(
                request.baseUrl() != null && !request.baseUrl().isBlank()
                        ? request.baseUrl()
                        : stored != null ? stored.baseUrl : "");
        String key = request.apiKey() != null && !request.apiKey().isBlank()
                ? request.apiKey().trim()
                : stored != null ? stored.apiKey : "";

        if (base.isEmpty()) {
            return ModelListResult.fail("缺少 Base URL");
        }
        if (key == null || key.isEmpty()) {
            return ModelListResult.fail("缺少 API Key，请先填写或保存 Key");
        }

        try {
            HttpResponse<String> response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(base + "/models"))
                            .timeout(Duration.ofSeconds(20))
                            .header("Authorization", "Bearer " + key)
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return ModelListResult.fail(providerError(response.statusCode(), response.body()));
            }

            JsonNode data = mapper.readTree(response.body()).path("data");
            if (!data.isArray()) {
                return ModelListResult.fail("接口返回格式不是 OpenAI 兼容的 /models 结构");
            }
            List<ModelOption> options = new ArrayList<>();
            for (JsonNode node : data) {
                String id = node.path("id").asText("");
                if (!id.isEmpty()) {
                    options.add(new ModelOption(id, node.path("owned_by").asText("")));
                }
            }
            options.sort(java.util.Comparator.comparing(ModelOption::id));
            return ModelListResult.ok(options);
        } catch (HttpTimeoutException e) {
            return ModelListResult.fail("连接超时，请检查 Base URL 与网络");
        } catch (ConnectException e) {
            return ModelListResult.fail("连接失败：无法访问 " + base);
        } catch (IllegalArgumentException e) {
            return ModelListResult.fail("Base URL 格式不正确");
        } catch (Exception e) {
            return ModelListResult.fail("获取模型列表失败：" + e.getMessage());
        }
    }

    private Integer countModels(String body) {
        try {
            JsonNode root = mapper.readTree(body);
            JsonNode data = root.path("data");
            return data.isArray() ? data.size() : null;
        } catch (Exception e) {
            return null;
        }
    }

    public String providerError(int status, String text) {
        String detail = "";
        try {
            JsonNode root = mapper.readTree(text);
            if (root != null) {
                detail = root.path("error").path("message").asText("");
                if (detail.isEmpty()) {
                    detail = root.path("message").asText("");
                }
            }
        } catch (Exception ignored) {
            detail = "";
        }
        if (detail.isEmpty() && text != null) {
            detail = text.trim();
            if (detail.length() > 240) {
                detail = detail.substring(0, 240);
            }
        }
        String hint = switch (status) {
            case 401, 403 -> "API Key 无效或无权限";
            case 404 -> "模型或接口路径不存在，请检查 Base URL 与模型标识";
            case 429 -> "请求过于频繁或额度不足";
            default -> status >= 500 ? "模型服务端错误" : "请求失败";
        };
        return hint + "（HTTP " + status + "）" + (detail.isEmpty() ? "" : "：" + detail);
    }
}
