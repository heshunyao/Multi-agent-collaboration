package com.agentforge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * AgentForge 业务服务入口。
 *
 * <p>职责：用户与权限、Agent 配置、模型配置、项目与任务、Git 项目、费用与审计。
 * Agent 推理与工具执行由 Python Agent Engine 承担，本服务通过内部 SSE 接口代理。</p>
 */
@SpringBootApplication
public class AgentForgeApplication {

    public static void main(String[] args) {
        SpringApplication.run(AgentForgeApplication.class, args);
    }
}
