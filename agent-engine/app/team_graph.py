"""LangGraph 多 Agent 协作编排：规划 → 按序/讨论执行 → 汇总交付。"""

import uuid
from typing import Awaitable, Callable, TypedDict

from langgraph.graph import END, StateGraph

from .control import RunCancelled, RunControl
from .providers import estimate_tokens, stream_chat
from .tools import TOOL_SPECS, run_tool

MAX_TOOL_ROUNDS = 2
OUTPUT_BUDGET = 3000

Emit = Callable[[str, dict], Awaitable[None]]


class TeamState(TypedDict, total=False):
    queue: list[dict]
    outputs: list[dict]
    plan: str
    seq: int
    summary: str


def _mid() -> str:
    return "amsg-" + uuid.uuid4().hex[:8]


def _render_outputs(outputs: list[dict], budget: int = OUTPUT_BUDGET) -> str:
    parts: list[str] = []
    total = 0
    for item in outputs:
        piece = f"### {item['agentName']}｜{item['title']}\n{item['content']}"
        if total + len(piece) > budget:
            piece = piece[: max(0, budget - total)]
        parts.append(piece)
        total += len(piece)
        if total >= budget:
            break
    return "\n\n".join(parts) if parts else "（暂无）"


async def _run_model(spec, messages: list[dict], step_id: str, emit: Emit, control: RunControl) -> dict:
    """单次阶段推理，支持工具调用循环。"""
    tools = TOOL_SPECS if spec.tools else None
    working = list(messages)
    content = ""
    reasoning = ""
    prompt_tokens = 0
    rounds = 0

    while True:
        text = ""
        think = ""
        calls: list[dict] = []
        async for event in stream_chat(
            base_url=spec.model.baseUrl,
            api_key=spec.model.apiKey,
            model=spec.model.modelName or spec.model.id,
            messages=working,
            temperature=spec.temperature,
            tools=tools,
        ):
            kind = event.get("type")
            if kind == "delta":
                await emit("delta", {"stepId": step_id, "text": event["text"]})
                control.check_cancel()
            elif kind == "reasoning":
                await emit("reasoning", {"stepId": step_id, "text": event["text"]})
            elif kind == "finish":
                text = event.get("content") or ""
                think = event.get("reasoning") or ""
                calls = event.get("toolCalls") or []

        prompt_tokens += sum(estimate_tokens(message.get("content") or "") for message in working)
        content += text
        reasoning += think

        if calls and rounds < MAX_TOOL_ROUNDS:
            rounds += 1
            working.append(
                {
                    "role": "assistant",
                    "content": text,
                    "tool_calls": [
                        {
                            "id": call["id"],
                            "type": "function",
                            "function": {"name": call["name"], "arguments": call["arguments"]},
                        }
                        for call in calls
                    ],
                }
            )
            for call in calls:
                await emit("tool", {"stepId": step_id, "name": call["name"], "status": "start",
                                    "arguments": call["arguments"]})
                output = run_tool(call["name"], call["arguments"])
                preview = output if len(output) <= 300 else output[:300] + "…"
                await emit("tool", {"stepId": step_id, "name": call["name"], "status": "done", "result": preview})
                working.append(
                    {"role": "tool", "tool_call_id": call["id"], "name": call["name"], "content": output}
                )
            continue
        break

    return {
        "content": content,
        "reasoning": reasoning,
        "promptTokens": prompt_tokens,
        "completionTokens": estimate_tokens(content),
    }


async def _execute_step(spec, brief: str, seq: int, title: str, run_id: str,
                        emit: Emit, control: RunControl) -> tuple[dict, str]:
    step_id = f"step-{run_id}-{seq}"
    await emit("step", {
        "stepId": step_id,
        "seq": seq,
        "agentId": spec.id,
        "agentName": spec.name,
        "title": title,
        "status": "running",
    })
    messages: list[dict] = []
    if spec.systemPrompt:
        messages.append({"role": "system", "content": spec.systemPrompt})
    messages.append({"role": "user", "content": brief})

    try:
        result = await _run_model(spec, messages, step_id, emit, control)
    except RunCancelled:
        await emit("step_done", {
            "stepId": step_id,
            "seq": seq,
            "agentId": spec.id,
            "agentName": spec.name,
            "title": title,
            "status": "failed",
            "error": "已终止",
            "content": "",
            "promptTokens": 0,
            "completionTokens": 0,
        })
        raise

    await emit("step_done", {
        "stepId": step_id,
        "seq": seq,
        "agentId": spec.id,
        "agentName": spec.name,
        "title": title,
        "status": "done",
        "content": result["content"],
        "reasoning": result["reasoning"],
        "promptTokens": result["promptTokens"],
        "completionTokens": result["completionTokens"],
    })
    return result, step_id


def initial_state(request) -> TeamState:
    team = request.team
    if request.mode == "group":
        rounds = 2 if len(team) <= 3 else 1
        queue = [{"round": r, "index": i} for r in range(1, rounds + 1) for i in range(len(team))]
    else:
        queue = [{"round": 1, "index": i} for i in range(1, len(team))] or [{"round": 1, "index": 0}]
    return {"queue": queue, "outputs": [], "plan": "", "seq": 1, "summary": ""}


def build_team_graph(request, emit: Emit, control: RunControl):
    team = request.team
    run_id = request.runId
    prompt = request.prompt
    is_group = request.mode == "group"
    seats = "\n".join(f"- {member.name}：{member.role}" for member in team)

    async def plan_node(state: TeamState) -> dict:
        await control.checkpoint()
        seq = int(state.get("seq") or 1)
        planner = team[0]
        brief = (
            f"团队目标：\n{prompt}\n\n"
            f"团队成员与职责：\n{seats}\n\n"
            "你是本次协作的项目经理。请输出：\n"
            "1. 目标拆解（3-6 个可验证任务）\n"
            "2. 每个任务应由哪个角色负责、依赖顺序如何\n"
            "3. 验收标准\n"
            "只做规划，不要替其他成员完成具体工作。"
        )
        result, step_id = await _execute_step(planner, brief, seq, "需求理解与任务规划", run_id, emit, control)
        await emit("message", {
            "id": _mid(),
            "stepId": step_id,
            "fromAgentId": planner.id,
            "fromName": planner.name,
            "toAgentId": "",
            "toName": "全体成员",
            "kind": "assignment",
            "content": result["content"],
        })
        return {"plan": result["content"], "seq": seq + 1}

    async def agent_node(state: TeamState) -> dict:
        await control.checkpoint()
        queue = list(state.get("queue") or [])
        item = queue.pop(0)
        member = team[item["index"]]
        round_no = int(item.get("round") or 1)
        seq = int(state.get("seq") or 2)
        outputs = list(state.get("outputs") or [])
        plan = (state.get("plan") or "")[:1500]

        if is_group:
            title = f"第 {round_no} 轮讨论 · {member.name}"
            brief = (
                f"团队目标：\n{prompt}\n\n项目经理的规划：\n{plan}\n\n"
                f"当前是第 {round_no} 轮团队讨论，已有发言：\n{_render_outputs(outputs, 4000)}\n\n"
                f"你是 {member.name}（{member.role}）。请从你的职责出发发言：补充方案、指出风险，"
                "或修正他人的观点。控制在 200 字以内，不要重复别人已经说过的内容。"
            )
        else:
            title = f"执行阶段 · {member.name}"
            brief = (
                f"团队目标：\n{prompt}\n\n项目经理的任务规划：\n{plan}\n\n"
                f"前序同事的产出：\n{_render_outputs(outputs)}\n\n"
                f"你是 {member.name}（{member.role}）。请只完成你职责范围内的部分，"
                "输出可交付的具体内容，简洁分点，不要重复前序工作。"
            )

        result, step_id = await _execute_step(member, brief, seq, title, run_id, emit, control)
        await emit("message", {
            "id": _mid(),
            "stepId": step_id,
            "fromAgentId": member.id,
            "fromName": member.name,
            "toAgentId": "",
            "toName": "全体成员",
            "kind": "discussion" if is_group else "result",
            "content": result["content"],
        })
        outputs.append({
            "agentId": member.id,
            "agentName": member.name,
            "title": title,
            "content": result["content"],
        })
        return {"queue": queue, "outputs": outputs, "seq": seq + 1}

    async def finalize_node(state: TeamState) -> dict:
        await control.checkpoint()
        seq = int(state.get("seq") or 2)
        planner = team[0]
        outputs = list(state.get("outputs") or [])
        brief = (
            f"团队目标：\n{prompt}\n\n项目经理的规划：\n{(state.get('plan') or '')[:1200]}\n\n"
            f"团队{'讨论' if is_group else '工作'}记录：\n{_render_outputs(outputs, 5000)}\n\n"
            "你是项目经理。请汇总团队成果：\n"
            "1. 最终方案 / 交付清单\n2. 关键决策与风险\n3. 下一步建议\n"
            "不要逐条复述成员原话。"
        )
        result, step_id = await _execute_step(planner, brief, seq, "汇总与交付", run_id, emit, control)
        await emit("message", {
            "id": _mid(),
            "stepId": step_id,
            "fromAgentId": planner.id,
            "fromName": planner.name,
            "toAgentId": "",
            "toName": "全体成员",
            "kind": "summary",
            "content": result["content"],
        })
        await emit("done", {"status": "done", "summary": result["content"]})
        return {"summary": result["content"]}

    def route(state: TeamState) -> str:
        return "agent" if state.get("queue") else "finalize"

    builder = StateGraph(TeamState)
    builder.add_node("kickoff", plan_node)
    builder.add_node("agent", agent_node)
    builder.add_node("finalize", finalize_node)
    builder.set_entry_point("kickoff")
    builder.add_conditional_edges("kickoff", route, {"agent": "agent", "finalize": "finalize"})
    builder.add_conditional_edges("agent", route, {"agent": "agent", "finalize": "finalize"})
    builder.add_edge("finalize", END)
    return builder.compile()
