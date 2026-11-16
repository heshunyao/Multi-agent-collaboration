"""运行控制：轮询 Java 业务服务，实现暂停 / 继续 / 终止。"""

import asyncio

import httpx


class RunCancelled(Exception):
    """人工终止运行。"""


class RunControl:
    def __init__(self, url: str, interval: float = 0.5) -> None:
        self.url = url
        self.interval = interval
        self.status = "running"
        self._task: asyncio.Task | None = None
        self._stopped = False

    async def start(self) -> None:
        if not self.url:
            return
        self._task = asyncio.create_task(self._poll())

    async def stop(self) -> None:
        self._stopped = True
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def _poll(self) -> None:
        # 与 Java 同机通信，绕过系统代理
        async with httpx.AsyncClient(timeout=3.0, trust_env=False) as client:
            while not self._stopped:
                await asyncio.sleep(self.interval)
                try:
                    response = await client.get(self.url)
                    data = response.json()
                    self.status = data.get("status", self.status) or self.status
                except Exception:  # noqa: BLE001 - 控制通道失败不中断运行
                    continue

    def cancelled(self) -> bool:
        return self.status == "cancelled"

    async def refresh(self) -> None:
        """立即同步一次状态，避免步骤边界上多执行一步。"""
        if not self.url:
            return
        try:
            async with httpx.AsyncClient(timeout=2.0, trust_env=False) as client:
                response = await client.get(self.url)
                self.status = response.json().get("status", self.status) or self.status
        except Exception:  # noqa: BLE001
            return

    async def checkpoint(self) -> None:
        """步骤边界检查：暂停则等待，终止则抛出。"""
        await self.refresh()
        while self.status == "paused":
            await asyncio.sleep(0.3)
            await self.refresh()
        if self.cancelled():
            raise RunCancelled()

    def check_cancel(self) -> None:
        if self.cancelled():
            raise RunCancelled()
