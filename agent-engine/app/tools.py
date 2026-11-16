"""工具注册表：Agent Loop 中由模型自主选择调用。

这些工具用于演示真实的多轮工具调用闭环（调用 → 结果回填 → 再推理），
后续接入代码检索、Shell、Git 等研发工具时沿用同一结构。
"""

import ast
import json
import operator
from datetime import datetime
from zoneinfo import ZoneInfo


TOOL_SPECS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "获取当前时间（默认 Asia/Shanghai 时区）。当用户询问与时间、日期相关的问题时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "IANA 时区名，例如 Asia/Shanghai",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calc",
            "description": "计算一个数学表达式，支持 + - * / % ** 与括号。用于精确计算，避免口算错误。",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "例如 (1280 * 3 + 96) / 4"}
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_task_plan",
            "description": "把研发目标拆解为阶段化任务清单，返回 JSON。适合在回答复杂需求前先做任务规划。",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {"type": "string", "description": "要实现的目标"},
                    "phases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "期望的阶段名称列表",
                    },
                },
                "required": ["goal"],
            },
        },
    },
]


_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}


def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        return _BIN_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _safe_eval(node.operand)
        return value if isinstance(node.op, ast.UAdd) else -value
    raise ValueError("表达式包含不支持的语法")


def _calc(expression: str) -> str:
    try:
        value = _safe_eval(ast.parse(expression, mode="eval"))
    except Exception as exc:  # noqa: BLE001 - 工具需要把错误交还模型
        return f"计算失败：{exc}"
    return f"{expression} = {value}"


def _current_time(timezone: str) -> str:
    tz = timezone or "Asia/Shanghai"
    try:
        now = datetime.now(ZoneInfo(tz))
    except Exception:
        now = datetime.now().astimezone()
        tz = str(now.tzinfo)
    return now.strftime(f"%Y-%m-%d %H:%M:%S {tz} (%A)")


def _task_plan(goal: str, phases: list[str] | None) -> str:
    stages = phases or ["需求澄清", "方案设计", "编码实现", "测试验收", "上线复盘"]
    plan = {
        "goal": goal,
        "stages": [
            {
                "stage": stage,
                "tasks": [f"{stage}：明确输入与产出", f"{stage}：完成后同步给下游"],
            }
            for stage in stages
        ],
    }
    return json.dumps(plan, ensure_ascii=False, indent=2)


def run_tool(name: str, arguments: str) -> str:
    """执行工具，返回给模型观察到的字符串结果。异常一律转成可读文本。"""
    try:
        args = json.loads(arguments) if arguments and arguments.strip() else {}
    except json.JSONDecodeError:
        return f"参数解析失败，请传入合法 JSON：{arguments}"

    try:
        if name == "get_current_time":
            return _current_time(str(args.get("timezone", "")))
        if name == "calc":
            return _calc(str(args.get("expression", "")))
        if name == "make_task_plan":
            phases = args.get("phases")
            if not isinstance(phases, list):
                phases = None
            return _task_plan(str(args.get("goal", "")), phases)
    except Exception as exc:  # noqa: BLE001
        return f"工具执行失败：{exc}"
    return f"未知工具：{name}"
