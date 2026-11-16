package com.agentforge.seed;

import com.agentforge.common.Ids;
import com.agentforge.common.JsonLists;
import com.agentforge.domain.Agent;
import com.agentforge.domain.AgentTeam;
import com.agentforge.domain.ModelConfig;
import com.agentforge.domain.Project;
import com.agentforge.domain.Role;
import com.agentforge.domain.TaskItem;
import com.agentforge.domain.User;
import com.agentforge.repo.AgentRepository;
import com.agentforge.repo.AgentTeamRepository;
import com.agentforge.repo.ModelRepository;
import com.agentforge.repo.ProjectRepository;
import com.agentforge.repo.RoleRepository;
import com.agentforge.repo.TaskRepository;
import com.agentforge.repo.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 首次启动写入默认模型、Agent、开发用户与演示项目。 */
@Component
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final ModelRepository modelRepository;
    private final AgentRepository agentRepository;
    private final AgentTeamRepository teamRepository;
    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final TaskRepository taskRepository;

    public DataSeeder(ModelRepository modelRepository,
                      AgentRepository agentRepository,
                      AgentTeamRepository teamRepository,
                      RoleRepository roleRepository,
                      UserRepository userRepository,
                      ProjectRepository projectRepository,
                      TaskRepository taskRepository) {
        this.modelRepository = modelRepository;
        this.agentRepository = agentRepository;
        this.teamRepository = teamRepository;
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.taskRepository = taskRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedModels();
        seedAgents();
        seedDevUser();
        seedDemoProject();
        seedDefaultTeam();
        log.info("初始化检查完成：models={} agents={} teams={} users={}",
                modelRepository.count(), agentRepository.count(), teamRepository.count(), userRepository.count());
    }

    private void seedModels() {
        if (modelRepository.count() > 0) {
            return;
        }
        long base = System.currentTimeMillis() - 600_000;
        List<ModelConfig> models = List.of(
                model("gpt-4.1", "GPT", "OpenAI", "gpt-4.1", "https://api.openai.com/v1", "", "#10b981",
                        "1M tokens", "$2.0 / 1M in", "0.9s", List.of("通用推理", "代码", "工具调用"), true, base),
                model("deepseek-r1", "DeepSeek", "DeepSeek", "deepseek-reasoner", "https://api.deepseek.com/v1", "",
                        "#4d6bfe", "128K tokens", "¥1.0 / 1M in", "1.4s", List.of("深度推理", "架构设计", "审查"), true, base + 1),
                model("qwen3-coder", "Qwen", "Alibaba", "qwen3-coder-plus",
                        "https://dashscope.aliyuncs.com/compatible-mode/v1", "", "#8b5cf6", "256K tokens",
                        "¥0.8 / 1M in", "0.7s", List.of("代码生成", "长上下文", "前端"), true, base + 2),
                model("claude-4.5", "Claude", "Anthropic", "claude-sonnet-4-5", "", "", "#d97757", "200K tokens",
                        "$3.0 / 1M in", "1.1s", List.of("长文写作", "重构", "文档"), false, base + 3),
                model("gemini-2.5", "Gemini", "Google", "gemini-2.5-pro", "", "", "#06b6d4", "1M tokens",
                        "$1.2 / 1M in", "0.8s", List.of("多模态", "超长上下文"), false, base + 4),
                model("llama-4", "Llama", "本地部署", "llama4:70b", "http://localhost:11434/v1", "ollama", "#f59e0b",
                        "128K tokens", "自托管", "2.3s", List.of("私有化", "数据不出域"), false, base + 5)
        );
        modelRepository.saveAll(models);
    }

    private static ModelConfig model(String id, String label, String vendor, String modelName, String baseUrl,
                                     String apiKey, String color, String context, String price, String latency,
                                     List<String> tags, boolean connected, long createdAt) {
        ModelConfig model = new ModelConfig();
        model.id = id;
        model.label = label;
        model.vendor = vendor;
        model.modelName = modelName;
        model.baseUrl = baseUrl;
        model.apiKey = apiKey;
        model.color = color;
        model.context = context;
        model.price = price;
        model.latency = latency;
        model.tagsJson = JsonLists.write(tags);
        model.connected = connected;
        model.createdAt = createdAt;
        model.updatedAt = createdAt;
        return model;
    }

    private void seedAgents() {
        if (agentRepository.count() > 0) {
            return;
        }
        long base = System.currentTimeMillis() - 300_000;
        List<Agent> agents = List.of(
                agent("pm", "项目经理 Agent", "需求拆解 · 任务分配 · 进度管理", "gpt-4.1", "pm",
                        List.of("将自然语言需求拆成可执行任务 DAG", "按能力分配任务、协调 Agent 间冲突", "跟踪里程碑，向用户汇报进度"),
                        List.of("需求解析", "任务编排", "里程碑"),
                        "你是 AI 研发团队的项目经理。先澄清目标，再把需求拆成可验证的任务，标注依赖关系并分配给最合适的 Agent。存在阻塞时主动向用户确认，而不是自行假设。",
                        0.4, base),
                agent("arch", "架构师 Agent", "技术选型 · 架构设计 · 接口规范", "deepseek-r1", "arch",
                        List.of("评估技术栈并给出架构决策记录", "输出领域模型与数据表设计", "定义服务间接口契约与事件"),
                        List.of("架构决策", "ER 建模", "OpenAPI"),
                        "你是系统架构师。基于需求给出可落地的技术方案，说明取舍理由，输出数据库设计、接口契约与关键时序。避免过度设计。",
                        0.3, base + 1),
                agent("backend", "后端开发 Agent", "Java / Spring Boot · 领域服务", "gpt-4.1", "backend",
                        List.of("实现领域服务与数据访问层", "处理事务、缓存与并发边界", "提供符合契约的 REST 接口"),
                        List.of("代码生成", "Maven", "MySQL", "Redis"),
                        "你是后端工程师，使用 Java 与 Spring Boot 实现服务。遵循分层架构与接口契约，涉及金钱与库存的逻辑必须保证幂等与并发安全。",
                        0.2, base + 2),
                agent("frontend", "前端开发 Agent", "Vue / React · 交互界面", "qwen3-coder", "frontend",
                        List.of("搭建页面结构与状态管理", "封装请求层与错误提示", "保证响应式布局与首屏性能"),
                        List.of("组件生成", "Vite", "Playwright"),
                        "你是前端工程师，使用 Vue 3 与 Vite 实现界面。组件保持单一职责，请求层统一封装，注意加载态、空态与错误态。",
                        0.3, base + 3),
                agent("qa", "测试 Agent", "单元测试 · 集成测试", "qwen3-coder", "qa",
                        List.of("为关键逻辑编写单元测试", "覆盖端到端主链路场景", "提缺陷单并跟踪回归"),
                        List.of("JUnit", "Playwright", "CI/CD"),
                        "你是测试工程师。优先覆盖并发、边界与失败重试场景，每个缺陷都要给出复现步骤与预期结果，修复后必须回归。",
                        0.2, base + 4),
                agent("reviewer", "代码审查 Agent", "质量 · 安全 · 规范", "deepseek-r1", "reviewer",
                        List.of("审查安全风险与敏感数据", "检查复杂度、重复率与可维护性", "给出可执行的修改意见"),
                        List.of("静态扫描", "SAST", "日志分析"),
                        "你是代码审查者。只报告可复现的问题，按严重程度排序，给出具体行号与修复建议。审查通过前不得合并。",
                        0.1, base + 5)
        );
        agentRepository.saveAll(agents);
    }

    private static Agent agent(String id, String name, String role, String model, String icon,
                               List<String> responsibilities, List<String> tools, String systemPrompt,
                               double temperature, long createdAt) {
        Agent agent = new Agent();
        agent.id = id;
        agent.name = name;
        agent.role = role;
        agent.model = model;
        agent.icon = icon;
        agent.responsibilitiesJson = JsonLists.write(responsibilities);
        agent.toolsJson = JsonLists.write(tools);
        agent.systemPrompt = systemPrompt;
        agent.temperature = temperature;
        agent.enabled = true;
        agent.createdAt = createdAt;
        agent.updatedAt = createdAt;
        return agent;
    }

    private void seedDevUser() {
        Role role = roleRepository.findByCode("OWNER").orElseGet(() -> {
            Role created = new Role();
            created.id = Ids.shortId("role");
            created.code = "OWNER";
            created.name = "平台所有者";
            created.description = "单用户开发态下的默认角色，拥有全部权限";
            created.permissions.addAll(List.of(
                    "user:read", "user:write",
                    "agent:read", "agent:write",
                    "model:read", "model:write", "model:test",
                    "project:read", "project:write",
                    "git:read", "git:write",
                    "cost:read", "audit:read"));
            created.createdAt = System.currentTimeMillis();
            return roleRepository.save(created);
        });

        if (userRepository.findByUsername("dev").isEmpty()) {
            User user = new User();
            user.id = Ids.shortId("user");
            user.username = "dev";
            user.displayName = "开发者";
            user.email = "dev@agentforge.local";
            user.roleId = role.id;
            user.enabled = true;
            user.createdAt = System.currentTimeMillis();
            userRepository.save(user);
        }
    }

    private void seedDemoProject() {
        if (projectRepository.count() > 0) {
            return;
        }
        long now = System.currentTimeMillis();
        Project project = new Project();
        project.id = Ids.shortId("proj");
        project.name = "在线商城系统";
        project.description = "包含用户管理、商品管理、订单管理与支付管理的示例项目，用于演示多 Agent 协作。";
        project.status = "planning";
        project.ownerId = "dev";
        project.createdAt = now;
        project.updatedAt = now;
        projectRepository.save(project);

        List<String[]> tasks = List.of(
                new String[]{"需求拆解与里程碑规划", "pm", "high"},
                new String[]{"领域模型与接口契约设计", "arch", "high"},
                new String[]{"订单与支付服务实现", "backend", "medium"});
        int index = 0;
        for (String[] row : tasks) {
            TaskItem task = new TaskItem();
            task.id = Ids.shortId("task");
            task.projectId = project.id;
            task.title = row[0];
            task.description = "";
            task.status = "todo";
            task.priority = row[2];
            task.assigneeAgentId = row[1];
            task.orderIndex = index++;
            task.createdAt = now;
            task.updatedAt = now;
            taskRepository.save(task);
        }
    }

    /** 默认团队：6 个种子 Agent 按研发流程顺序协作。 */
    private void seedDefaultTeam() {
        if (teamRepository.count() > 0) {
            return;
        }
        List<String> agentIds = agentRepository.findAll().stream()
                .sorted((a, b) -> Long.compare(a.createdAt, b.createdAt))
                .map(agent -> agent.id)
                .toList();
        if (agentIds.size() < 2) {
            return;
        }
        long now = System.currentTimeMillis();
        AgentTeam team = new AgentTeam();
        team.id = Ids.shortId("team");
        team.name = "AI 研发团队";
        team.description = "项目经理统筹需求与任务分配，架构、后端、前端、测试、审查依次交付";
        team.mode = "sequential";
        team.agentIdsJson = JsonLists.write(agentIds);
        team.createdAt = now;
        team.updatedAt = now;
        teamRepository.save(team);
    }
}
