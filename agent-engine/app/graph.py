"""LangGraph 编排：上下文组装 → 模型推理 → 工具调用循环 → 收敛输出。"""

from typing import Any, Awaitable, Callable, TypedDict

from langgraph.graph import END, StateGraph

from .providers import estimate_tokens, stream_chat
from .tools import TOOL_SPECS, run_tool

MAX_ROUNDS = 4
CONTEXT_CHAR_BUDGET = 24000

Emit = Callable[[str, dict], Awaitable[None]]


class EngineState(TypedDict, total=False):
    messages: list[dict]
    temperature: float
    model_name: str
    base_url: str
    api_key: str
    enable_tools: bool
    rounds: int
    content: str
    reasoning: str
    tool_calls: list[dict]
    tool_trace: list[dict]


def initial_state(request: Any) -> EngineState:
    messages: list[dict] = []
    system = (request.agent.systemPrompt or "").strip()
    if system:
        messages.append({"role": "system", "content": system})
    for turn in request.messages:
        if turn.role in ("user", "assistant", "system") and turn.content:
            messages.append({"role": turn.role, "content": turn.content})
    return {
        "messages": messages,
        "temperature": request.agent.temperature,
        "model_name": request.model.modelName or request.model.id,
        "base_url": request.model.baseUrl,
        "api_key": request.model.apiKey,
        "enable_tools": bool(request.agent.tools),
        "rounds": 0,
        "content": "",
        "reasoning": "",
        "tool_calls": [],
        "tool_trace": [],
    }


def _trim_history(messages: list[dict], budget: int) -> list[dict]:
    """上下文管理：按字符预算从最近消息往前保留，避免超长请求。"""
    kept: list[dict] = []
    total = 0
    for message in reversed(messages):
        size = len(message.get("content") or "")
        if kept and total + size > budget:
            break
        kept.append(message)
        total += size
    kept.reverse()
    # 保证历史以 user 开头，避免出现孤立的 tool 消息
    while kept and kept[0].get("role") not in ("user", "system"):
        kept.pop(0)
    return kept


def build_graph(emit: Emit):
    async def prepare(state: EngineState) -> dict:
        messages = list(state.get("messages") or [])
        system = messages[0] if messages and messages[0].get("role") == "system" else None
        rest = messages[1:] if system else messages
        rest = _trim_history(rest, CONTEXT_CHAR_BUDGET)
        prepared = ([system] if system else []) + rest
        if not any(message.get("role") == "user" for message in prepared):
            prepared.append({"role": "user", "content": "请开始执行任务。"})
        return {"messages": prepared, "rounds": 0}

    async def agent_node(state: EngineState) -> dict:
        messages = list(state.get("messages") or [])
        content = ""
        reasoning = ""
        calls: list[dict] = []

        async for event in stream_chat(
            base_url=state.get("base_url", ""),
            api_key=state.get("api_key", ""),
            model=state.get("model_name", ""),
            messages=messages,
            temperature=state.get("temperature", 0.3),
            tools=TOOL_SPECS if state.get("enable_tools") else None,
        ):
            kind = event.get("type")
            if kind == "delta":
                await emit("delta", {"text": event["text"]})
            elif kind == "reasoning":
                await emit("reasoning", {"text": event["text"]})
            elif kind == "finish":
                content = event.get("content") or ""
                reasoning = event.get("reasoning") or ""
                calls = event.get("toolCalls") or []

        assistant: dict = {"role": "assistant", "content": content}
        if calls:
            assistant["tool_calls"] = [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": call["arguments"]},
                }
                for call in calls
            ]
        messages.append(assistant)
        return {"messages": messages, "content": content, "reasoning": reasoning, "tool_calls": calls}

    async def tools_node(state: EngineState) -> dict:
        messages = list(state.get("messages") or [])
        trace = list(state.get("tool_trace") or [])
        for call in state.get("tool_calls") or []:
            await emit("tool", {"name": call["name"], "status": "start", "arguments": call["arguments"]})
            output = run_tool(call["name"], call["arguments"])
            preview = output if len(output) <= 400 else output[:400] + "…"
            await emit("tool", {"name": call["name"], "status": "done", "result": preview})
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "name": call["name"],
                    "content": output,
                }
            )
            trace.append({"name": call["name"], "result": preview})
        return {
            "messages": messages,
            "rounds": int(state.get("rounds") or 0) + 1,
            "tool_calls": [],
            "tool_trace": trace,
        }

    async def finalize(state: EngineState) -> dict:
        messages = state.get("messages") or []
        content = state.get("content") or ""
        reasoning = state.get("reasoning") or ""
        if not content:
            content = "已达到最大工具调用轮次，请补充更明确的信息后重试。"
        await emit(
            "done",
            {
                "content": content,
                "reasoning": reasoning,
                "usage": {
                    "promptTokens": sum(estimate_tokens(message.get("content") or "") for message in messages),
                    "completionTokens": estimate_tokens(content),
                },
                "toolTrace": state.get("tool_trace") or [],
            },
        )
        return {}

    def route(state: EngineState) -> str:
        if state.get("tool_calls") and int(state.get("rounds") or 0) < MAX_ROUNDS:
            return "tools"
        return "finalize"

    builder = StateGraph(EngineState)
    builder.add_node("prepare", prepare)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tools_node)
    builder.add_node("finalize", finalize)

    builder.set_entry_point("prepare")
    builder.add_edge("prepare", "agent")
    builder.add_conditional_edges("agent", route, {"tools": "tools", "finalize": "finalize"})
    builder.add_edge("tools", "agent")
    builder.add_edge("finalize", END)
    return builder.compile()
