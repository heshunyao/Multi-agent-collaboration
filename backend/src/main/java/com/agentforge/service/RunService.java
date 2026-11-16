package com.agentforge.service;

import com.agentforge.common.ApiException;
import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.AgentMessage;
import com.agentforge.domain.AgentTeam;
import com.agentforge.domain.ModelConfig;
import com.agentforge.domain.RunStep;
import com.agentforge.domain.TeamRun;
import com.agentforge.dto.RunDetailDto;
import com.agentforge.dto.RunMessageDto;
import com.agentforge.dto.RunStepDto;
import com.agentforge.dto.RunSummaryDto;
import com.agentforge.engine.AgentEngineClient;
import com.agentforge.engine.EngineException;
import com.agentforge.repo.AgentMessageRepository;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.AgentTeamRepository;
import com.agentforge.repo.ModelRepository;
import com.agentforge.repo.RunStepRepository;
import com.agentforge.repo.TeamRunRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

/** 多 Agent 协作运行：调度 Python 引擎、持久化过程、转发事件、处理人工干预。 */
@Service
public class RunService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RunService.class);

    private final TeamRunRepository runRepository;
    private final RunStepRepository stepRepository;
    private final AgentMessageRepository messageRepository;
    private final AgentTeamRepository teamRepository;
    private final AgentRepository agentRepository;
    private final ModelRepository modelRepository;
    private final AgentEngineClient engineClient;
    private final RunEventBus eventBus;
    private final CostService costService;
    private final AuditService auditService;
    private final Executor executor;
    private final String callbackBaseUrl;

    /** 每个步骤的增量文本缓冲，步骤结束时落库。 */
    private final Map<String, StringBuilder> contentBuffers = new ConcurrentHashMap<>();
    private final Map<String, StringBuilder> reasoningBuffers = new ConcurrentHashMap<>();

    public RunService(TeamRunRepository runRepository,
                      RunStepRepository stepRepository,
                      AgentMessageRepository messageRepository,
                      AgentTeamRepository teamRepository,
                      AgentRepository agentRepository,
                      ModelRepository modelRepository,
                      AgentEngineClient engineClient,
                      RunEventBus eventBus,
                      CostService costService,
                      AuditService auditService,
                      @Qualifier("chatExecutor") Executor executor,
                      @Value("${agentforge.engine.callback-base-url:http://127.0.0.1:8080}") String callbackBaseUrl) {
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
        this.messageRepository = messageRepository;
        this.teamRepository = teamRepository;
        this.agentRepository = agentRepository;
        this.modelRepository = modelRepository;
        this.engineClient = engineClient;
        this.eventBus = eventBus;
        this.costService = costService;
        this.auditService = auditService;
        this.executor = executor;
        this.callbackBaseUrl = callbackBaseUrl.replaceAll("/+$", "");
    }

    /** 服务重启后，未完成的运行标记为中断，避免状态卡在 running。 */
    @Override
    public void run(ApplicationArguments args) {
        for (TeamRun run : runRepository.findAll()) {
            if ("running".equals(run.status) || "pending".equals(run.status) || "paused".equals(run.status)) {
                run.status = "failed";
                run.summary = "服务重启导致运行中断";
                run.finishedAt = System.currentTimeMillis();
                run.updatedAt = run.finishedAt;
                runRepository.save(run);
            }
        }
    }

    public List<RunSummaryDto> list(String teamId, int limit) {
        List<TeamRun> runs = (teamId == null || teamId.isBlank())
                ? runRepository.findAllByOrderByCreatedAtDesc()
                : runRepository.findByTeamIdOrderByCreatedAtDesc(teamId);
        return runs.stream().limit(Math.max(1, limit)).map(run -> {
            List<RunStep> steps = stepRepository.findByRunIdOrderBySeqAsc(run.id);
            int done = (int) steps.stream().filter(step -> "done".equals(step.status)).count();
            return new RunSummaryDto(run.id, run.teamId, run.teamName, run.title, run.prompt, run.mode, run.status,
                    steps.size(), done, run.createdAt, run.startedAt, run.finishedAt);
        }).toList();
    }

    public TeamRun require(String id) {
        return runRepository.findById(id).orElseThrow(() -> ApiException.notFound("运行不存在"));
    }

    public RunDetailDto detail(String id) {
        TeamRun run = require(id);
        List<RunStepDto> steps = stepRepository.findByRunIdOrderBySeqAsc(id).stream()
                .map(RunService::toStepDto).toList();
        List<RunMessageDto> messages = messageRepository.findByRunIdOrderBySeqAsc(id).stream()
                .map(RunService::toMessageDto).toList();
        return new RunDetailDto(run.id, run.teamId, run.teamName, run.title, run.prompt, run.mode, run.status,
                run.summary, run.createdAt, run.startedAt, run.finishedAt, run.updatedAt, steps, messages);
    }

    public RunDetailDto create(String teamId, String prompt) {
        String text = prompt == null ? "" : prompt.trim();
        if (text.isEmpty()) {
            throw ApiException.badRequest("请先描述要协作完成的目标");
        }
        AgentTeam team = teamRepository.findById(teamId)
                .orElseThrow(() -> ApiException.badRequest("团队不存在，请先创建团队"));
        List<Agent> members = new ArrayList<>();
        for (String agentId : JsonLists.read(team.agentIdsJson)) {
            agentRepository.findById(agentId).ifPresent(members::add);
        }
        if (members.size() < 2) {
            throw ApiException.badRequest("团队至少需要 2 个 Agent 才能协作");
        }

        long now = System.currentTimeMillis();
        TeamRun run = new TeamRun();
        run.id = Ids.shortId("run");
        run.teamId = team.id;
        run.teamName = team.name;
        run.title = text.length() > 24 ? text.substring(0, 24) : text;
        run.prompt = text;
        run.mode = team.mode;
        run.status = "pending";
        run.createdAt = now;
        run.updatedAt = now;
        runRepository.save(run);

        auditService.record("run.create", "run", run.id, "发起协作：" + team.name, true);
        executor.execute(() -> execute(run.id));
        return detail(run.id);
    }

    public String control(String runId) {
        return runRepository.findById(runId).map(run -> run.status).orElse("cancelled");
    }

    public void pause(String id) {
        TeamRun run = require(id);
        if (!"running".equals(run.status)) {
            throw ApiException.badRequest("当前状态无法暂停：" + run.status);
        }
        updateStatus(run, "paused", "已暂停");
    }

    public void resume(String id) {
        TeamRun run = require(id);
        if (!"paused".equals(run.status)) {
            throw ApiException.badRequest("当前状态无法继续：" + run.status);
        }
        updateStatus(run, "running", "已继续");
    }

    public void cancel(String id) {
        TeamRun run = require(id);
        if ("done".equals(run.status) || "cancelled".equals(run.status) || "failed".equals(run.status)) {
            throw ApiException.badRequest("运行已结束");
        }
        updateStatus(run, "cancelled", "已终止");
        auditService.record("run.cancel", "run", id, "人工终止运行", true);
    }

    public void delete(String id) {
        require(id);
        messageRepository.deleteByRunId(id);
        stepRepository.deleteByRunId(id);
        runRepository.deleteById(id);
        eventBus.publish(id, "deleted", Map.of("runId", id));
    }

    public void deleteByTeam(String teamId) {
        for (TeamRun run : runRepository.findByTeamIdOrderByCreatedAtDesc(teamId)) {
            messageRepository.deleteByRunId(run.id);
            stepRepository.deleteByRunId(run.id);
            runRepository.delete(run);
        }
    }

    private void updateStatus(TeamRun run, String status, String summary) {
        run.status = status;
        run.updatedAt = System.currentTimeMillis();
        if ("cancelled".equals(status)) {
            run.summary = summary;
            run.finishedAt = run.updatedAt;
        }
        runRepository.save(run);
        eventBus.publish(run.id, "status", Map.of("runId", run.id, "status", status));
    }

    private void execute(String runId) {
        TeamRun run;
        try {
            run = require(runId);
        } catch (ApiException e) {
            return;
        }
        try {
            List<Agent> members = new ArrayList<>();
            for (String agentId : JsonLists.read(teamRepository.findById(run.teamId)
                    .map(team -> team.agentIdsJson).orElse("[]"))) {
                agentRepository.findById(agentId).ifPresent(members::add);
            }
            Map<String, ModelConfig> models = new LinkedHashMap<>();
            for (Agent agent : members) {
                ModelConfig model = modelRepository.findById(agent.model).orElse(null);
                if (model == null) {
                    failRun(run, "Agent「" + agent.name + "」绑定的模型不存在，请前往模型中心配置。");
                    return;
                }
                if (model.apiKey == null || model.apiKey.isBlank()) {
                    failRun(run, "模型「" + model.label + "」尚未配置 API Key，请前往模型中心完成配置。");
                    return;
                }
                if (model.baseUrl == null || model.baseUrl.isBlank()) {
                    failRun(run, "模型「" + model.label + "」尚未配置 Base URL。");
                    return;
                }
                models.put(agent.id, model);
            }

            run.status = "running";
            run.startedAt = System.currentTimeMillis();
            run.updatedAt = run.startedAt;
            runRepository.save(run);
            eventBus.publish(run.id, "status", Map.of("runId", run.id, "status", "running"));

            Map<String, Object> payload = buildPayload(run, members, models);
            engineClient.stream("/internal/team/stream", payload, (event, data) -> handleEvent(run, models, event, data));
            handleStreamEnded(run);
        } catch (EngineException e) {
            log.warn("协作运行失败 runId={}：{}", runId, e.getMessage());
            failRun(run, e.getMessage());
        } catch (Exception e) {
            log.error("协作运行异常 runId={}", runId, e);
            failRun(run, "协作运行异常：" + e.getMessage());
        } finally {
            contentBuffers.clear();
            reasoningBuffers.clear();
        }
    }

    private Map<String, Object> buildPayload(TeamRun run, List<Agent> members, Map<String, ModelConfig> models) {
        List<Map<String, Object>> team = new ArrayList<>();
        for (Agent agent : members) {
            ModelConfig model = models.get(agent.id);
            Map<String, Object> spec = new LinkedHashMap<>();
            spec.put("id", agent.id);
            spec.put("name", agent.name);
            spec.put("role", agent.role);
            spec.put("systemPrompt", agent.systemPrompt == null ? "" : agent.systemPrompt);
            spec.put("temperature", agent.temperature);
            spec.put("tools", JsonLists.read(agent.toolsJson));

            Map<String, Object> modelSpec = new LinkedHashMap<>();
            modelSpec.put("id", model.id);
            modelSpec.put("label", model.label);
            modelSpec.put("modelName", model.modelName == null || model.modelName.isBlank() ? model.id : model.modelName);
            modelSpec.put("baseUrl", model.baseUrl);
            modelSpec.put("apiKey", model.apiKey);
            spec.put("model", modelSpec);
            team.add(spec);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("runId", run.id);
        payload.put("mode", run.mode);
        payload.put("prompt", run.prompt);
        payload.put("team", team);
        payload.put("controlUrl", callbackBaseUrl + "/internal/runs/" + run.id + "/control");
        return payload;
    }

    private void handleEvent(TeamRun run, Map<String, ModelConfig> models, String event, JsonNode data) {
        switch (event) {
            case "step" -> {
                persistStep(run.id, data, false);
                eventBus.publish(run.id, "step", data);
            }
            case "delta" -> {
                String stepId = data.path("stepId").asText("");
                contentBuffers.computeIfAbsent(stepId, key -> new StringBuilder()).append(data.path("text").asText(""));
                eventBus.publish(run.id, "delta", data);
            }
            case "reasoning" -> {
                String stepId = data.path("stepId").asText("");
                reasoningBuffers.computeIfAbsent(stepId, key -> new StringBuilder())
                        .append(data.path("text").asText(""));
                eventBus.publish(run.id, "reasoning", data);
            }
            case "tool" -> eventBus.publish(run.id, "tool", data);
            case "step_done" -> {
                RunStep step = persistStep(run.id, data, true);
                eventBus.publish(run.id, "step_done", data);
                if (step != null) {
                    int promptTokens = data.path("promptTokens").asInt(0);
                    int completionTokens = data.path("completionTokens").asInt(0);
                    ModelConfig model = models.get(step.agentId);
                    if (model != null && (promptTokens > 0 || completionTokens > 0)) {
                        costService.recordChat(run.id, step.agentId, model, promptTokens, completionTokens);
                    }
                }
            }
            case "message" -> {
                AgentMessage message = persistMessage(run.id, data);
                eventBus.publish(run.id, "message", data);
                if (message == null) {
                    log.warn("消息落库失败 runId={}", run.id);
                }
            }
            case "status" -> {
                String status = data.path("status").asText("running");
                TeamRun current = runRepository.findById(run.id).orElse(run);
                if ("cancelled".equals(current.status) && !"cancelled".equals(status)) {
                    // 人工终止后忽略引擎后续状态
                    return;
                }
                current.status = status;
                current.updatedAt = System.currentTimeMillis();
                runRepository.save(current);
                eventBus.publish(run.id, "status", data);
            }
            case "done" -> {
                String status = data.path("status").asText("done");
                TeamRun current = runRepository.findById(run.id).orElse(run);
                boolean cancelled = "cancelled".equals(current.status);
                current.status = cancelled ? "cancelled" : status;
                if (!cancelled) {
                    current.summary = data.path("summary").asText("");
                } else if (current.summary == null || current.summary.isBlank()) {
                    current.summary = "已终止";
                }
                current.finishedAt = System.currentTimeMillis();
                current.updatedAt = current.finishedAt;
                runRepository.save(current);
                eventBus.publish(run.id, "done", Map.of(
                        "runId", run.id,
                        "status", current.status,
                        "summary", current.summary == null ? "" : current.summary));
                eventBus.complete(run.id);
                auditService.record("run.done", "run", run.id, "协作结束：" + current.status, true);
            }
            case "error" -> {
                String message = data.path("message").asText("协作运行失败");
                failRun(run, message);
            }
            default -> log.debug("忽略运行事件 {}", event);
        }
    }

    private RunStep persistStep(String runId, JsonNode data, boolean finished) {
        String stepId = data.path("stepId").asText("");
        if (stepId.isEmpty()) {
            return null;
        }
        RunStep step = stepRepository.findById(stepId).orElseGet(() -> {
            RunStep created = new RunStep();
            created.id = stepId;
            created.runId = runId;
            created.startedAt = System.currentTimeMillis();
            return created;
        });
        step.seq = data.path("seq").asInt(step.seq);
        step.agentId = data.path("agentId").asText(step.agentId);
        step.agentName = data.path("agentName").asText(step.agentName);
        step.title = data.path("title").asText(step.title);
        step.status = data.path("status").asText(finished ? "done" : "running");

        if (finished) {
            String content = data.path("content").asText("");
            StringBuilder buffer = contentBuffers.remove(stepId);
            if (content.isEmpty() && buffer != null) {
                content = buffer.toString();
            }
            step.content = content;
            String reasoning = data.path("reasoning").asText("");
            StringBuilder reasoningBuffer = reasoningBuffers.remove(stepId);
            if (reasoning.isEmpty() && reasoningBuffer != null) {
                reasoning = reasoningBuffer.toString();
            }
            step.reasoning = reasoning;
            String error = data.path("error").asText("");
            step.error = error.isEmpty() ? null : error;
            step.promptTokens = data.path("promptTokens").asInt(0);
            step.completionTokens = data.path("completionTokens").asInt(0);
            step.finishedAt = System.currentTimeMillis();
        }
        stepRepository.save(step);
        return step;
    }

    private AgentMessage persistMessage(String runId, JsonNode data) {
        String id = data.path("id").asText("");
        AgentMessage message = id.isEmpty() ? null : messageRepository.findById(id).orElse(null);
        if (message == null) {
            message = new AgentMessage();
            message.id = id.isEmpty() ? Ids.shortId("amsg") : id;
            message.runId = runId;
            message.seq = messageRepository.maxSeq(runId) + 1;
            message.createdAt = System.currentTimeMillis();
        }
        message.stepId = data.path("stepId").asText(null);
        message.fromAgentId = data.path("fromAgentId").asText(null);
        message.fromName = data.path("fromName").asText("");
        message.toAgentId = data.path("toAgentId").asText(null);
        message.toName = data.path("toName").asText("");
        message.kind = data.path("kind").asText("discussion");
        message.content = data.path("content").asText("");
        return messageRepository.save(message);
    }

    private void handleStreamEnded(TeamRun run) {
        TeamRun current = runRepository.findById(run.id).orElse(run);
        if ("running".equals(current.status) || "pending".equals(current.status) || "paused".equals(current.status)) {
            failRun(current, "Agent 引擎连接中断，运行已结束");
            return;
        }
        flushBuffers(run.id, "failed", "已终止");
    }

    private void flushBuffers(String runId, String status, String error) {
        for (RunStep step : stepRepository.findByRunIdOrderBySeqAsc(runId)) {
            if (!"running".equals(step.status)) {
                continue;
            }
            StringBuilder buffer = contentBuffers.remove(step.id);
            step.content = buffer == null ? step.content : buffer.toString();
            step.status = status;
            step.error = error;
            step.finishedAt = System.currentTimeMillis();
            stepRepository.save(step);
        }
    }

    private void failRun(TeamRun run, String message) {
        TeamRun current = runRepository.findById(run.id).orElse(run);
        current.status = "failed";
        current.summary = message;
        current.finishedAt = System.currentTimeMillis();
        current.updatedAt = current.finishedAt;
        runRepository.save(current);
        flushBuffers(run.id, "failed", message);
        eventBus.publish(run.id, "error", Map.of("runId", run.id, "message", message));
        eventBus.publish(run.id, "done", Map.of("runId", run.id, "status", "failed", "summary", message));
        eventBus.complete(run.id);
        auditService.record("run.failed", "run", run.id, message, false);
    }

    private static RunStepDto toStepDto(RunStep step) {
        return new RunStepDto(step.id, step.seq, step.agentId, step.agentName, step.title, step.status,
                step.content, step.reasoning, step.error, step.promptTokens, step.completionTokens,
                step.startedAt, step.finishedAt);
    }

    private static RunMessageDto toMessageDto(AgentMessage message) {
        return new RunMessageDto(message.id, message.stepId, message.seq, message.fromAgentId, message.fromName,
                message.toAgentId, message.toName, message.kind, message.content, message.createdAt);
    }
}
