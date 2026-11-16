"""AgentForge Python Agent Engine.

只对外暴露内部接口（供 Java 业务服务调用），不直接服务浏览器。
"""

import json
import time

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from .project_runtime import stream_project_run
from .runtime import stream_agent_run
from .schemas import AgentRunRequest, ProjectBuildRequest, TeamRunRequest
from .team_runtime import stream_team_run

app = FastAPI(title="AgentForge Agent Engine", version="1.0.0")


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "service": "agent-engine",
        "time": int(time.time() * 1000),
        "framework": "langgraph",
    }


@app.post("/internal/agent/stream")
async def agent_stream(request: AgentRunRequest) -> StreamingResponse:
    async def events():
        async for event, data in stream_agent_run(request):
            payload = json.dumps(data, ensure_ascii=False)
            yield f"event: {event}\ndata: {payload}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/internal/team/stream")
async def team_stream(request: TeamRunRequest) -> StreamingResponse:
    async def events():
        async for event, data in stream_team_run(request):
            payload = json.dumps(data, ensure_ascii=False)
            yield f"event: {event}\ndata: {payload}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/internal/project/stream")
async def project_stream(request: ProjectBuildRequest) -> StreamingResponse:
    async def events():
        async for event, data in stream_project_run(request):
            payload = json.dumps(data, ensure_ascii=False)
            yield f"event: {event}\ndata: {payload}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
