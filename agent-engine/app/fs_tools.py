"""项目工作区文件工具：所有读写都限制在构建工作区内，阻止路径穿越。"""

import os
from pathlib import Path

SKIP_DIRS = {
    ".git",
    "node_modules",
    "target",
    "dist",
    ".venv",
    "__pycache__",
    ".build-test",
    ".testclasses",
    "out",
    ".idea",
    ".gradle",
}

TEXT_SUFFIXES = {
    ".java", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md",
    ".txt", ".sql", ".yml", ".yaml", ".html", ".css", ".properties", ".xml", ".sh",
    ".gitignore", ".env", ".toml", ".cfg", ".ini",
}

MAX_SNAPSHOT_FILES = 18
MAX_FILE_CHARS = 2200
MAX_SNAPSHOT_CHARS = 24000


class Workspace:
    """受限的项目工作区。"""

    def __init__(self, root: str) -> None:
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, relative: str) -> Path:
        rel = str(relative or "").replace("\\", "/").strip()
        while rel.startswith("./"):
            rel = rel[2:]
        rel = rel.lstrip("/")
        if not rel:
            raise ValueError("文件路径为空")
        if any(part == ".." for part in rel.split("/")):
            raise ValueError(f"非法文件路径：{relative}")
        path = (self.root / rel).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError(f"文件路径越界：{relative}")
        return path

    def write(self, relative: str, content: str) -> int:
        path = self.resolve(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = (content or "").encode("utf-8")
        path.write_bytes(data)
        return len(data)

    def read(self, relative: str, limit: int = 60000) -> str:
        path = self.resolve(relative)
        if not path.exists() or not path.is_file():
            return ""
        text = path.read_text("utf-8", errors="ignore")
        return text[:limit]

    def relative_paths(self, limit: int = 400) -> list[str]:
        result: list[str] = []
        for path in self.root.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(self.root)
            if any(part in SKIP_DIRS for part in relative.parts):
                continue
            result.append(relative.as_posix())
            if len(result) >= limit:
                break
        return sorted(result)

    def snapshot(self) -> str:
        """把关键源码拼成文本，供缺陷修复阶段参考。"""
        parts: list[str] = []
        total = 0
        files = [
            path for path in self.root.rglob("*")
            if path.is_file()
            and not any(part in SKIP_DIRS for part in path.relative_to(self.root).parts)
            and (path.suffix in TEXT_SUFFIXES or path.name in TEXT_SUFFIXES)
        ]
        files.sort(key=lambda item: len(item.relative_to(self.root).parts))
        for path in files[:MAX_SNAPSHOT_FILES]:
            relative = path.relative_to(self.root).as_posix()
            try:
                text = path.read_text("utf-8", errors="ignore")[:MAX_FILE_CHARS]
            except OSError:
                continue
            piece = f"### {relative}\n{text}\n"
            if total + len(piece) > MAX_SNAPSHOT_CHARS:
                break
            parts.append(piece)
            total += len(piece)
        return "\n".join(parts) if parts else "（工作区暂无文件）"


def is_skipped(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def normalize_relative(path: str) -> str:
    return os.path.normpath(path).replace("\\", "/")
