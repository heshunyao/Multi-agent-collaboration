"""项目构建运行时的 SSE 事件流。"""

import asyncio
from typing import AsyncIterator

from .control import RunCancelled, RunControl
from .project_graph import build_project_graph, initial_state
from .providers import ProviderError
from .schemas import ProjectBuildRequest

_SENTINEL = object()


async def stream_project_run(request: ProjectBuildRequest) -> AsyncIterator[tuple[str, dict]]:
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: str, data: dict) -> None:
        await queue.put((event, data))

    control = RunControl(request.controlUrl)

    async def runner() -> None:
        try:
            await control.start()
            graph = build_project_graph(request, emit, control)
            await graph.ainvoke(initial_state())
        except RunCancelled:
            await emit("status", {"status": "cancelled"})
            await emit("done", {"status": "cancelled", "summary": "已终止"})
        except ProviderError as exc:
            await emit("error", {"message": str(exc)})
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 - 兜底，保证前端能收到错误
            await emit("error", {"message": f"项目构建失败：{exc}"})
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
