"""真实执行测试命令：不同技术栈使用不同的测试入口，输出截断后回传模型。"""

import asyncio
import sys
import time
from pathlib import Path

from .fs_tools import SKIP_DIRS

MAX_OUTPUT_CHARS = 9000
TIMEOUT_SECONDS = 180.0

TEST_LABEL = {
    "java-react": "javac + java（编译并运行 SmokeTest）",
    "node-react": "node --test（Node 内置测试运行器）",
    "python-fastapi": "unittest discover（标准库测试框架）",
}


async def _run(command: list[str], cwd: Path) -> tuple[int, str, int]:
    started = time.time()
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError as exc:
        return 127, f"命令不可用：{exc}", 0
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout=TIMEOUT_SECONDS)
        code = process.returncode or 0
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return 124, f"测试执行超时（超过 {int(TIMEOUT_SECONDS)} 秒）", int(TIMEOUT_SECONDS * 1000)
    duration = int((time.time() - started) * 1000)
    text = output.decode("utf-8", "ignore") if output else ""
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[-MAX_OUTPUT_CHARS:]
    return code, text, duration


def _java_files(cwd: Path) -> list[str]:
    files: list[str] = []
    for folder in ("core", "tests"):
        base = cwd / folder
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.java")):
            relative = path.relative_to(cwd)
            if any(part in SKIP_DIRS for part in relative.parts):
                continue
            files.append(relative.as_posix())
    return files


async def run_tests(stack: str, cwd: Path) -> tuple[bool, str, list[dict]]:
    """执行测试，返回 (是否通过, 最后一段输出, 每步记录)。"""
    commands: list[list[str]] = []

    if stack == "python-fastapi":
        commands = [[sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-v"]]
    elif stack == "node-react":
        commands = [["node", "--test"]]
    elif stack == "java-react":
        java_files = _java_files(cwd)
        if not java_files:
            return False, "未找到 core / tests 目录下的 Java 源文件，无法编译测试", []
        commands = [
            ["javac", "-encoding", "UTF-8", "-d", ".build-test", *java_files],
            ["java", "-cp", ".build-test", "SmokeTest"],
        ]
    else:
        return False, f"不支持的技术栈：{stack}", []

    steps: list[dict] = []
    for command in commands:
        code, output, duration = await _run(command, cwd)
        steps.append({
            "command": " ".join(command),
            "ok": code == 0,
            "output": output,
            "durationMs": duration,
        })
        if code != 0:
            return False, output or f"命令退出码 {code}", steps
    return True, steps[-1]["output"] if steps else "", steps
