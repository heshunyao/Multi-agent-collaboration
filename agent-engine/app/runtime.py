"""Agent Runtime：把 LangGraph 的事件转成 SSE 事件流。"""

import asyncio
from typing import AsyncIterator

from .graph import build_graph, initial_state
from .providers import ProviderError
from .schemas import AgentRunRequest

_SENTINEL = object()


async def stream_agent_run(request: AgentRunRequest) -> AsyncIterator[tuple[str, dict]]:
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: str, data: dict) -> None:
        await queue.put((event, data))

    graph = build_graph(emit)
    state = initial_state(request)

    async def runner() -> None:
        try:
            await graph.ainvoke(state)
        except ProviderError as exc:
            await queue.put(("error", {"message": str(exc)}))
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 - 兜底，保证前端能收到错误
            await queue.put(("error", {"message": f"Agent 运行失败：{exc}"}))
        finally:
            await queue.put(_SENTINEL)

    task = asyncio.create_task(runner())
    try:
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item
    finally:
        if not task.done():
            task.cancel()
