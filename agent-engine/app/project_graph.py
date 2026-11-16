"""AI 软件项目构建流水线。

需求分析 → 架构设计 → 任务拆解 → 代码生成（后端 / 前端）→ 真实执行测试 →
测试失败自动修复（最多 3 轮）→ 项目交付文档。整个过程通过 SSE 事件实时推送。
"""

import json
import re
from typing import Awaitable, Callable, TypedDict

from langgraph.graph import END, StateGraph

from .control import RunCancelled, RunControl
from .exec_tools import run_tests
from .fs_tools import Workspace
from .providers import estimate_tokens, stream_chat

Emit = Callable[[str, dict], Awaitable[None]]

MAX_FIX_ROUNDS = 3
FILE_RE = re.compile(r"^===\s*FILE:\s*(.+?)\s*===\s*$", re.MULTILINE)
AREA_LABEL = {"frontend": "前端", "backend": "后端", "database": "数据库", "devops": "工程化", "general": "通用"}

STACKS = {
    "java-react": {
        "label": "Spring Boot 3 + React 18 + Vite",
        "backend": "Java 17 / Spring Boot 3.3 / H2",
        "frontend": "React 18 + TypeScript + Vite",
        "backend_hint": (
            "核心业务逻辑必须放在默认包的 core/TaskCore.java（纯 Java，不依赖框架）；"
            "测试放在默认包的 tests/SmokeTest.java，必须包含 public static void main，"
            "使用 if 判断断言，失败时 throw new AssertionError(\"...\")。"
            "同时提供 backend/src/main/java/com/example/ 下的 Spring Boot 控制器与服务、"
            "backend/pom.xml 与 database/schema.sql。"
        ),
        "frontend_hint": (
            "提供 frontend/package.json、frontend/vite.config.ts、frontend/index.html、"
            "frontend/src/main.tsx、frontend/src/App.tsx、frontend/src/api.ts，"
            "通过 fetch 调用后端 /api 接口，包含加载态与错误提示。"
        ),
        "test_command": "javac -encoding UTF-8 -d .build-test core/*.java tests/*.java，然后 java -cp .build-test SmokeTest",
        "run_hint": "后端：cd backend && mvn spring-boot:run；前端：cd frontend && npm install && npm run dev",
    },
    "python-fastapi": {
        "label": "FastAPI + React 18 + Vite",
        "backend": "Python 3.12 / FastAPI / SQLite",
        "frontend": "React 18 + TypeScript + Vite",
        "backend_hint": (
            "核心业务逻辑放在 backend/core.py，FastAPI 入口为 backend/app/main.py，"
            "必须提供 backend/__init__.py 与 tests/test_core.py（标准库 unittest，"
            "通过 from backend.core import ... 导入并断言）。同时提供 database/schema.sql。"
        ),
        "frontend_hint": (
            "提供 frontend/package.json、frontend/vite.config.ts、frontend/index.html、"
            "frontend/src/main.tsx、frontend/src/App.tsx、frontend/src/api.ts，"
            "通过 fetch 调用后端 /api 接口，包含加载态与错误提示。"
        ),
        "test_command": "python -m unittest discover -s tests -t . -v",
        "run_hint": "后端：pip install fastapi uvicorn && python -m uvicorn backend.app.main:app --reload；前端：cd frontend && npm install && npm run dev",
    },
    "node-react": {
        "label": "Express + React 18 + Vite",
        "backend": "Node.js 20 / Express",
        "frontend": "React 18 + TypeScript + Vite",
        "backend_hint": (
            "核心业务逻辑放在 core/logic.mjs（ESM 模块），测试放在 tests/core.test.mjs"
            "（node:test + node:assert/strict，通过 import { ... } from '../core/logic.mjs' 引入）。"
            "同时提供 server/index.js、package.json 与 database/schema.sql。"
        ),
        "frontend_hint": (
            "提供 frontend/package.json、frontend/vite.config.ts、frontend/index.html、"
            "frontend/src/main.tsx、frontend/src/App.tsx、frontend/src/api.ts，"
            "通过 fetch 调用后端 /api 接口，包含加载态与错误提示。"
        ),
        "test_command": "node --test（自动发现 *.test.mjs）",
        "run_hint": "后端：node server/index.js；前端：cd frontend && npm install && npm run dev",
    },
}


class BuildState(TypedDict, total=False):
    requirement_doc: str
    architecture_doc: str
    task_list: list[dict]
    test_round: int
    test_output: str
    test_steps: list[dict]
    tests_passed: bool
    summary: str


def _pick(team, *keywords: str, fallback: int = 0):
    for member in team:
        haystack = f"{member.role} {member.name}".lower()
        if any(keyword.lower() in haystack for keyword in keywords):
            return member
    return team[min(fallback, len(team) - 1)]


def _clean_file_body(content: str) -> str:
    lines = content.strip("\n").splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).rstrip() + "\n"


def parse_files(text: str) -> list[tuple[str, str]]:
    """解析 ===FILE: path=== 协议，返回 (相对路径, 内容)。"""
    if not text:
        return []
    matches = list(FILE_RE.finditer(text))
    files: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        path = match.group(1).strip().strip("`").strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = _clean_file_body(text[start:end])
        if not path or not body.strip():
            continue
        files.append((path.replace("\\", "/"), body))
    return files


def parse_tasks(text: str) -> list[dict]:
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    tasks: list[dict] = []
    for item in data[:12]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        area = str(item.get("area") or "general").strip().lower()
        if area not in AREA_LABEL:
            area = "backend"
        priority = str(item.get("priority") or "medium").strip().lower()
        if priority not in ("high", "medium", "low"):
            priority = "medium"
        tasks.append({
            "title": title,
            "description": str(item.get("description") or "").strip(),
            "area": area,
            "priority": priority,
        })
    return tasks


def fallback_tasks(requirement: str) -> list[dict]:
    excerpt = (requirement or "项目需求").strip()[:80]
    return [
        {"title": "数据库模型与建表脚本", "description": f"根据需求设计数据表：{excerpt}",
         "area": "database", "priority": "high"},
        {"title": "后端核心业务逻辑", "description": "实现核心领域逻辑与校验规则",
         "area": "backend", "priority": "high"},
        {"title": "后端 REST API", "description": "提供 CRUD 接口并处理错误与校验",
         "area": "backend", "priority": "medium"},
        {"title": "前端页面与数据交互", "description": "实现列表、表单与状态提示",
         "area": "frontend", "priority": "medium"},
        {"title": "自动化测试与交付文档", "description": "覆盖核心逻辑单元测试并输出交付说明",
         "area": "devops", "priority": "medium"},
    ]


def render_tasks(tasks: list[dict]) -> str:
    lines = ["# 任务拆解", ""]
    for index, task in enumerate(tasks, start=1):
        lines.append(f"## {index}. {task['title']}")
        lines.append(f"- 领域：{AREA_LABEL.get(task['area'], '通用')}")
        lines.append(f"- 优先级：{task['priority']}")
        if task.get("description"):
            lines.append(f"- 说明：{task['description']}")
        lines.append("")
    return "\n".join(lines)


class Pipeline:
    def __init__(self, request, emit: Emit, control: RunControl) -> None:
        self.request = request
        self.emit = emit
        self.control = control
        self.build_id = request.buildId
        self.stack_key = request.stack if request.stack in STACKS else "java-react"
        self.stack = STACKS[self.stack_key]
        self.workspace = Workspace(request.workspace)
        self.seq = 0
        self.files: list[str] = []

        team = request.team or []
        if not team:
            raise ValueError("没有可用的 Agent，无法执行项目构建")
        last = len(team) - 1
        self.analyst = _pick(team, "项目", "pm", "需求", fallback=0)
        self.architect = _pick(team, "架构", "arch", fallback=min(1, last))
        self.backend = _pick(team, "后端", "backend", fallback=min(2, last))
        self.frontend = _pick(team, "前端", "frontend", fallback=min(3, last))
        self.qa = _pick(team, "测试", "qa", "test", fallback=last)

    def next_stage(self) -> tuple[int, str]:
        self.seq += 1
        return self.seq, f"stage-{self.build_id}-{self.seq}"

    async def begin_stage(self, key: str, title: str, agent) -> tuple[int, str]:
        seq, stage_id = self.next_stage()
        await self.emit("stage", {
            "buildId": self.build_id,
            "stageId": stage_id,
            "seq": seq,
            "stageKey": key,
            "title": title,
            "agentId": agent.id,
            "agentName": agent.name,
            "status": "running",
        })
        return seq, stage_id

    async def end_stage(self, seq: int, stage_id: str, key: str, title: str, agent,
                        *, status: str = "done", content: str = "", reasoning: str = "",
                        error: str = "", prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        payload = {
            "buildId": self.build_id,
            "stageId": stage_id,
            "seq": seq,
            "stageKey": key,
            "title": title,
            "agentId": agent.id,
            "agentName": agent.name,
            "status": status,
            "content": content,
            "reasoning": reasoning,
            "promptTokens": prompt_tokens,
            "completionTokens": completion_tokens,
        }
        if error:
            payload["error"] = error
        await self.emit("stage_done", payload)

    async def call_model(self, agent, prompt: str, stage_id: str) -> dict:
        messages: list[dict] = []
        if agent.systemPrompt:
            messages.append({"role": "system", "content": agent.systemPrompt})
        messages.append({"role": "user", "content": prompt})

        chunks: list[str] = []
        final = ""
        reasoning = ""
        async for event in stream_chat(
            base_url=agent.model.baseUrl,
            api_key=agent.model.apiKey,
            model=agent.model.modelName or agent.model.id,
            messages=messages,
            temperature=agent.temperature or 0.3,
            tools=None,
        ):
            kind = event.get("type")
            if kind == "delta":
                piece = event.get("text") or ""
                chunks.append(piece)
                await self.emit("delta", {"stageId": stage_id, "text": piece})
                self.control.check_cancel()
            elif kind == "reasoning":
                await self.emit("reasoning", {"stageId": stage_id, "text": event.get("text") or ""})
            elif kind == "finish":
                final = event.get("content") or ""
                reasoning = event.get("reasoning") or ""
        text = final or "".join(chunks)
        prompt_tokens = sum(estimate_tokens(message.get("content") or "") for message in messages)
        return {
            "content": text,
            "reasoning": reasoning,
            "promptTokens": prompt_tokens,
            "completionTokens": estimate_tokens(text),
        }

    async def run_stage(self, key: str, title: str, agent, prompt: str) -> str:
        seq, stage_id = await self.begin_stage(key, title, agent)
        try:
            result = await self.call_model(agent, prompt, stage_id)
        except RunCancelled:
            await self.end_stage(seq, stage_id, key, title, agent,
                                 status="failed", error="已终止")
            raise
        await self.end_stage(seq, stage_id, key, title, agent,
                             content=result["content"], reasoning=result["reasoning"],
                             prompt_tokens=result["promptTokens"],
                             completion_tokens=result["completionTokens"])
        return result["content"]

    async def write_doc(self, path: str, content: str) -> int:
        size = self.workspace.write(path, content)
        if path not in self.files:
            self.files.append(path)
        await self.emit("file", {
            "path": path,
            "bytes": size,
            "action": "write",
            "fileCount": len(self.files),
        })
        return size

    async def write_output(self, text: str) -> list[str]:
        written: list[str] = []
        for path, body in parse_files(text):
            try:
                size = self.workspace.write(path, body)
            except ValueError as exc:
                await self.emit("file", {"path": path, "bytes": 0, "action": "rejected", "error": str(exc)})
                continue
            if path not in self.files:
                self.files.append(path)
            written.append(path)
            await self.emit("file", {
                "path": path,
                "bytes": size,
                "action": "write",
                "fileCount": len(self.files),
            })
        return written


def build_project_graph(request, emit: Emit, control: RunControl):
    pipeline = Pipeline(request, emit, control)
    stack = pipeline.stack
    requirement = request.requirement or ""

    async def requirement_node(state: BuildState) -> dict:
        await control.checkpoint()
        prompt = (
            "【阶段：需求分析】\n"
            f"项目名称：{request.projectName}\n"
            f"技术栈：{stack['label']}\n"
            f"用户需求：\n{requirement}\n\n"
            "请输出 Markdown 需求规格说明，包含：目标用户与核心场景、功能需求（按模块）、"
            "非功能需求、验收标准。不要写代码。"
        )
        text = await pipeline.run_stage("requirement", "需求分析", pipeline.analyst, prompt)
        text = text.strip() or "（模型未返回需求分析内容）"
        await pipeline.write_doc("docs/REQUIREMENTS.md", f"# 需求规格说明\n\n{text}\n")
        return {"requirement_doc": text}

    async def architecture_node(state: BuildState) -> dict:
        await control.checkpoint()
        prompt = (
            "【阶段：架构设计】\n"
            f"项目名称：{request.projectName}\n"
            f"技术栈：{stack['label']}（后端 {stack['backend']}，前端 {stack['frontend']}）\n"
            f"需求规格：\n{(state.get('requirement_doc') or '')[:2400]}\n\n"
            "请输出 Markdown 技术架构文档，包含：技术选型与理由、系统分层与模块、目录结构、"
            "数据模型（表结构）、REST API 契约、关键流程、测试与部署方式。不要输出代码。"
        )
        text = await pipeline.run_stage("architecture", "架构设计", pipeline.architect, prompt)
        text = text.strip() or "（模型未返回架构设计内容）"
        await pipeline.write_doc("docs/ARCHITECTURE.md", f"# 技术架构设计\n\n{text}\n")
        return {"architecture_doc": text}

    async def tasks_node(state: BuildState) -> dict:
        await control.checkpoint()
        prompt = (
            "【阶段：任务拆解】\n"
            f"需求规格：\n{(state.get('requirement_doc') or '')[:2000]}\n\n"
            f"架构设计：\n{(state.get('architecture_doc') or '')[:1600]}\n\n"
            "请把项目拆解为 6-10 个可执行任务，必须覆盖前端、后端、数据库。"
            "只输出 JSON 数组，不要输出任何其他文字：\n"
            '[{"title":"任务标题","description":"完成标准","area":"frontend|backend|database|devops",'
            '"priority":"high|medium|low"}]'
        )
        text = await pipeline.run_stage("tasks", "任务拆解", pipeline.analyst, prompt)
        tasks = parse_tasks(text) or fallback_tasks(requirement)
        for index, task in enumerate(tasks, start=1):
            await emit("task", {
                "id": f"task-{pipeline.build_id}-{index}",
                **task,
                "orderIndex": index - 1,
            })
        await pipeline.write_doc("docs/TASKS.md", render_tasks(tasks))
        return {"task_list": tasks}

    def task_text(tasks: list[dict]) -> str:
        return "\n".join(f"- [{AREA_LABEL.get(task['area'], '通用')}] {task['title']}" for task in tasks)

    async def code_backend_node(state: BuildState) -> dict:
        await control.checkpoint()
        base = (
            "【阶段：代码生成 · 后端】\n"
            f"项目名称：{request.projectName}\n"
            f"技术栈：{stack['label']}\n"
            f"需求规格：\n{(state.get('requirement_doc') or '')[:2200]}\n\n"
            f"架构设计：\n{(state.get('architecture_doc') or '')[:1800]}\n\n"
            f"任务清单：\n{task_text(state.get('task_list') or [])}\n\n"
            f"请实现后端、数据库与自动化测试。{stack['backend_hint']}\n\n"
            "输出格式（每个文件一段，严格使用该协议，不要输出任何解释文字）：\n"
            "===FILE: 相对路径===\n完整的文件内容\n"
            "===FILE: 另一个相对路径===\n完整的文件内容\n\n"
            "约束：\n"
            "1. 输出 4-8 个关键文件，核心逻辑必须完整、可编译 / 可导入。\n"
            "2. 路径必须相对项目根目录，禁止绝对路径与 ..。\n"
            f"3. 测试会真实执行：{stack['test_command']}。测试必须覆盖核心业务逻辑。"
        )
        for attempt in range(2):
            title = "代码生成 · 后端" if attempt == 0 else "代码生成 · 后端（重试）"
            prompt = base if attempt == 0 else (
                base + "\n\n注意：上一次输出没有包含任何 ===FILE: 协议片段，请严格按协议重新输出全部文件。"
            )
            text = await pipeline.run_stage("code_backend", title, pipeline.backend, prompt)
            written = await pipeline.write_output(text)
            if written:
                return {}
        raise RuntimeError("模型未按 ===FILE: 协议输出后端文件，无法继续构建")

    async def code_frontend_node(state: BuildState) -> dict:
        await control.checkpoint()
        prompt = (
            "【阶段：代码生成 · 前端】\n"
            f"项目名称：{request.projectName}\n"
            f"前端技术栈：{stack['frontend']}\n"
            f"需求规格：\n{(state.get('requirement_doc') or '')[:1800]}\n\n"
            f"架构设计：\n{(state.get('architecture_doc') or '')[:1400]}\n\n"
            f"任务清单：\n{task_text(state.get('task_list') or [])}\n\n"
            f"请实现前端界面。{stack['frontend_hint']}\n\n"
            "输出格式（严格使用该协议，不要输出任何解释文字）：\n"
            "===FILE: 相对路径===\n完整的文件内容\n\n"
            "路径必须相对项目根目录，输出 4-7 个文件。"
        )
        text = await pipeline.run_stage("code_frontend", "代码生成 · 前端", pipeline.frontend, prompt)
        await pipeline.write_output(text)
        return {}

    async def test_node(state: BuildState) -> dict:
        await control.checkpoint()
        round_no = int(state.get("test_round") or 0) + 1
        seq, stage_id = await pipeline.begin_stage(
            "test", f"自动测试 · 第 {round_no} 轮", pipeline.qa)
        ok, output, steps = await run_tests(pipeline.stack_key, pipeline.workspace.root)
        command = steps[-1]["command"] if steps else stack["test_command"]
        duration = steps[-1]["durationMs"] if steps else 0
        await emit("test", {
            "round": round_no,
            "ok": ok,
            "command": command,
            "output": output,
            "durationMs": duration,
            "steps": steps,
        })
        content = ("测试通过\n\n" if ok else "测试失败\n\n") + output
        await pipeline.end_stage(
            seq, stage_id, "test", f"自动测试 · 第 {round_no} 轮", pipeline.qa,
            status="done" if ok else "failed",
            content=content,
            error="" if ok else "测试未通过",
        )
        return {
            "test_round": round_no,
            "test_output": output,
            "test_steps": steps,
            "tests_passed": ok,
        }

    async def fix_node(state: BuildState) -> dict:
        await control.checkpoint()
        round_no = int(state.get("test_round") or 1)
        snapshot = pipeline.workspace.snapshot()
        prompt = (
            "【阶段：缺陷修复】\n"
            f"第 {round_no} 轮自动测试失败，测试输出：\n{(state.get('test_output') or '')[-6000:]}\n\n"
            f"当前工作区关键文件：\n{snapshot}\n\n"
            "请定位缺陷并修复。只输出需要修改的文件，严格使用协议（不要输出解释文字）：\n"
            "===FILE: 相对路径===\n修复后的完整文件内容\n\n"
            f"修复后测试会重新执行：{stack['test_command']}"
        )
        text = await pipeline.run_stage(
            "fix", f"缺陷修复 · 第 {round_no} 轮", pipeline.backend, prompt)
        await pipeline.write_output(text)
        return {}

    async def delivery_node(state: BuildState) -> dict:
        await control.checkpoint()
        files = sorted(set(pipeline.files))
        ok = bool(state.get("tests_passed"))
        rounds = int(state.get("test_round") or 0)
        prompt = (
            "【阶段：项目交付】\n"
            f"项目名称：{request.projectName}\n"
            f"技术栈：{stack['label']}\n"
            f"需求规格：\n{(state.get('requirement_doc') or '')[:1800]}\n\n"
            "已生成文件：\n" + "\n".join(f"- {path}" for path in files) + "\n\n"
            f"自动测试：{'通过' if ok else '未通过'}（共 {rounds} 轮）\n\n"
            "请输出两个文件：README.md（项目介绍、目录结构、运行方式、测试方式）与 "
            "docs/DELIVERY.md（交付清单、测试结论、后续建议）。"
            "严格使用协议输出，不要输出解释文字：\n"
            "===FILE: README.md===\n内容\n===FILE: docs/DELIVERY.md===\n内容"
        )
        text = await pipeline.run_stage("delivery", "项目交付", pipeline.analyst, prompt)
        written = await pipeline.write_output(text)
        if not any(path.lower() == "readme.md" for path in written):
            await pipeline.write_doc("README.md", _fallback_readme(request, stack, requirement, ok, rounds))
        if not any(path.lower() == "docs/delivery.md" for path in written):
            await pipeline.write_doc("docs/DELIVERY.md",
                                     _fallback_delivery(request, stack, files, ok, rounds, state))

        final_files = sorted(set(pipeline.files))
        summary = (
            f"需求分析、架构设计、任务拆解、代码生成（{len(final_files)} 个文件）、"
            f"自动测试（{rounds} 轮，{'通过' if ok else '未通过'}）与交付文档已完成。"
        )
        await emit("done", {
            "status": "done" if ok else "failed",
            "summary": summary,
            "fileCount": len(final_files),
            "files": final_files,
            "testRounds": rounds,
            "testsPassed": ok,
        })
        return {"summary": summary}

    def route_after_test(state: BuildState) -> str:
        if state.get("tests_passed"):
            return "delivery"
        if int(state.get("test_round") or 0) <= MAX_FIX_ROUNDS:
            return "fix"
        return "delivery"

    builder = StateGraph(BuildState)
    builder.add_node("requirements", requirement_node)
    builder.add_node("architecture", architecture_node)
    builder.add_node("tasks", tasks_node)
    builder.add_node("code_backend", code_backend_node)
    builder.add_node("code_frontend", code_frontend_node)
    builder.add_node("test", test_node)
    builder.add_node("fix", fix_node)
    builder.add_node("delivery", delivery_node)
    builder.set_entry_point("requirements")
    builder.add_edge("requirements", "architecture")
    builder.add_edge("architecture", "tasks")
    builder.add_edge("tasks", "code_backend")
    builder.add_edge("code_backend", "code_frontend")
    builder.add_edge("code_frontend", "test")
    builder.add_conditional_edges("test", route_after_test, {"fix": "fix", "delivery": "delivery"})
    builder.add_edge("fix", "test")
    builder.add_edge("delivery", END)
    return builder.compile()


def initial_state() -> BuildState:
    return {
        "requirement_doc": "",
        "architecture_doc": "",
        "task_list": [],
        "test_round": 0,
        "test_output": "",
        "test_steps": [],
        "tests_passed": False,
        "summary": "",
    }


def _fallback_readme(request, stack: dict, requirement: str, ok: bool, rounds: int) -> str:
    return (
        f"# {request.projectName}\n\n"
        f"> 由 AgentForge 多 Agent 协作生成 · {stack['label']}\n\n"
        "## 需求概述\n\n"
        f"{requirement[:1200]}\n\n"
        "## 运行方式\n\n"
        f"{stack['run_hint']}\n\n"
        "## 测试\n\n"
        f"{stack['test_command']}\n\n"
        f"最近一次自动测试：{'通过' if ok else '未通过'}（共 {rounds} 轮）。\n"
    )


def _fallback_delivery(request, stack: dict, files: list[str], ok: bool, rounds: int,
                       state: BuildState) -> str:
    steps = state.get("test_steps") or []
    lines = [
        "# 项目交付说明",
        "",
        f"- 项目：{request.projectName}",
        f"- 技术栈：{stack['label']}",
        f"- 文件数量：{len(files)}",
        f"- 自动测试：{'通过' if ok else '未通过'}（共 {rounds} 轮）",
        "",
        "## 交付文件",
        "",
    ]
    lines.extend(f"- `{path}`" for path in files)
    lines.extend(["", "## 测试记录", ""])
    if steps:
        for step in steps:
            lines.append(f"- {'✅' if step.get('ok') else '❌'} `{step.get('command')}`"
                         f"（{step.get('durationMs', 0)} ms）")
    else:
        lines.append("- 未执行测试")
    lines.extend([
        "",
        "## 后续建议",
        "",
        "1. 按真实环境替换数据库连接与密钥配置。",
        "2. 为关键路径补充集成测试与端到端测试。",
        "3. 接入 CI，将自动测试与构建纳入流水线。",
        "",
    ])
    return "\n".join(lines)
