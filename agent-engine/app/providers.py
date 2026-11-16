"""OpenAI 兼容协议的流式客户端（/chat/completions）。"""

import json
from typing import AsyncIterator
from urllib.parse import urlparse

import httpx


class ProviderError(RuntimeError):
    """模型侧错误，消息可直接展示给用户。"""


class _ToolsUnsupported(Exception):
    """模型不支持 tools 参数，需要降级重试。"""


def provider_error(status: int, text: str) -> str:
    detail = ""
    try:
        parsed = json.loads(text)
        error = parsed.get("error") or {}
        detail = error.get("message") or parsed.get("message") or ""
    except Exception:  # noqa: BLE001 - 上游可能返回非 JSON
        detail = ""
    if not detail:
        detail = (text or "").strip()[:240]
    if status in (401, 403):
        hint = "API Key 无效或无权限"
    elif status == 404:
        hint = "模型或接口路径不存在，请检查 Base URL 与模型标识"
    elif status == 429:
        hint = "请求过于频繁或额度不足"
    elif status >= 500:
        hint = "模型服务端错误"
    else:
        hint = "请求失败"
    return f"{hint}（HTTP {status}）" + (f"：{detail}" if detail else "")


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = sum(1 for ch in text if ord(ch) >= 0x2E80)
    other = len(text) - cjk
    return cjk + (other + 3) // 4


async def stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    temperature: float,
    tools: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """流式调用模型。产出 delta / reasoning，最后产出 finish。"""
    if not base_url:
        raise ProviderError("缺少 Base URL")
    if not api_key:
        raise ProviderError("缺少 API Key")

    try:
        async for event in _stream_once(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            temperature=temperature,
            tools=tools,
        ):
            yield event
    except _ToolsUnsupported:
        async for event in _stream_once(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            temperature=temperature,
            tools=None,
        ):
            yield event


async def _stream_once(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    temperature: float,
    tools: list[dict] | None,
) -> AsyncIterator[dict]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    content: list[str] = []
    reasoning: list[str] = []
    tool_calls: dict[int, dict] = {}

    # 本机/内网模型不经过系统代理，公网模型沿用系统代理配置
    host = (urlparse(base_url).hostname or "").lower()
    local_host = host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith(".local")

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0),
            trust_env=not local_host,
        ) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code >= 400:
                    raw = await response.aread()
                    text = raw.decode("utf-8", "ignore")
                    if tools and response.status_code in (400, 422) and "tool" in text.lower():
                        raise _ToolsUnsupported()
                    raise ProviderError(provider_error(response.status_code, text))

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    piece = delta.get("reasoning_content") or delta.get("reasoning")
                    if piece:
                        reasoning.append(piece)
                        yield {"type": "reasoning", "text": piece}
                    text = delta.get("content")
                    if text:
                        content.append(text)
                        yield {"type": "delta", "text": text}
                    for call in delta.get("tool_calls") or []:
                        index = call.get("index", 0)
                        slot = tool_calls.setdefault(index, {"id": "", "name": "", "arguments": ""})
                        if call.get("id"):
                            slot["id"] = call["id"]
                        function = call.get("function") or {}
                        if function.get("name"):
                            slot["name"] += function["name"]
                        if function.get("arguments"):
                            slot["arguments"] += function["arguments"]
    except httpx.TimeoutException as exc:
        raise ProviderError(f"模型响应超时：{exc}") from exc
    except httpx.HTTPError as exc:
        raise ProviderError(f"请求模型失败：{exc}") from exc

    calls = [
        {
            "id": slot["id"] or f"call_{index}",
            "name": slot["name"],
            "arguments": slot["arguments"] or "{}",
        }
        for index, slot in sorted(tool_calls.items())
        if slot["name"]
    ]
    yield {
        "type": "finish",
        "content": "".join(content),
        "reasoning": "".join(reasoning),
        "toolCalls": calls,
    }
