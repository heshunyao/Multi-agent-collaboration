"""多 Agent 协作运行时的 SSE 事件流。"""

import asyncio
from typing import AsyncIterator

from .control import RunCancelled, RunControl
from .providers import ProviderError
from .schemas import TeamRunRequest
from .team_graph import build_team_graph, initial_state

_SENTINEL = object()


async def stream_team_run(request: TeamRunRequest) -> AsyncIterator[tuple[str, dict]]:
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: str, data: dict) -> None:
        await queue.put((event, data))

    control = RunControl(request.controlUrl)
    graph = build_team_graph(request, emit, control)
    state = initial_state(request)

    async def runner() -> None:
        try:
            await control.start()
            await graph.ainvoke(state)
        except RunCancelled:
            await emit("status", {"status": "cancelled"})
            await emit("done", {"status": "cancelled", "summary": "已终止"})
        except ProviderError as exc:
            await emit("error", {"message": str(exc)})
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 - 兜底，保证前端能收到错误
            await emit("error", {"message": f"协作运行失败：{exc}"})
        finally:
            await control.stop()
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
