import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

INTENT_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes" / "SPATIAL_SOC.md"
SANDBOX_NETWORK = "spatial-soc-sandbox-net"
ALLOWED_CMD_PREFIXES = ("pytest",)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents from the repo.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write (overwrite) a file's contents in the repo.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_cmd",
            "description": "Run an allowlisted shell command in the repo.",
            "parameters": {
                "type": "object",
                "properties": {"cmd": {"type": "string"}},
                "required": ["cmd"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "http_get",
            "description": "GET a URL (routed through the honeypot).",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "done",
            "description": "Signal the task is complete.",
            "parameters": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        },
    },
]


def load_system_prompt() -> str:
    lines = [
        line
        for line in INTENT_PATH.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    return "\n".join(lines).strip()


def _resolve(workdir: Path, path: str) -> Path | None:
    target = (workdir / path).resolve()
    if not str(target).startswith(str(workdir.resolve())):
        return None
    return target


def read_file(workdir: Path, path: str) -> str:
    target = _resolve(workdir, path)
    if target is None:
        return "error: path escapes the repo"
    if not target.exists():
        return f"error: no such file: {path}"
    return target.read_text()


def write_file(workdir: Path, path: str, content: str) -> str:
    target = _resolve(workdir, path)
    if target is None:
        return "error: path escapes the repo"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return "ok"


def _normalize_cmd(cmd: str, python: str) -> str:
    """Bare `pytest` doesn't add the repo root to sys.path the way `python -m
    pytest` does, so a fixture's own `from db import ...`-style imports fail."""
    if cmd.strip().startswith("pytest"):
        return cmd.replace("pytest", f"{python} -m pytest", 1)
    return cmd


def _run_cmd_subprocess(workdir: Path, cmd: str) -> tuple[int, str]:
    result = subprocess.run(
        _normalize_cmd(cmd, sys.executable),
        shell=True, cwd=workdir, capture_output=True, text=True, timeout=30,
    )
    return result.returncode, result.stdout + result.stderr


def _run_cmd_docker(workdir: Path, cmd: str) -> tuple[int, str]:
    full_cmd = f"pip install -q -r requirements.txt pytest 2>/dev/null; {_normalize_cmd(cmd, 'python')}"
    result = subprocess.run(
        [
            "docker", "run", "--rm",
            "--network", SANDBOX_NETWORK,
            "-v", f"{workdir}:/app",
            "-w", "/app",
            "python:3.11-slim", "bash", "-c", full_cmd,
        ],
        capture_output=True, text=True, timeout=90,
    )
    return result.returncode, result.stdout + result.stderr


def run_cmd(workdir: Path, cmd: str) -> str:
    if not any(cmd.strip().startswith(prefix) for prefix in ALLOWED_CMD_PREFIXES):
        return f"error: command not allowlisted: {cmd}"
    use_sandbox = os.getenv("USE_SANDBOX", "false").lower() == "true"
    exit_code, output = (
        _run_cmd_docker(workdir, cmd) if use_sandbox else _run_cmd_subprocess(workdir, cmd)
    )
    return f"exit={exit_code}\n{output}"


def http_get(url: str) -> str:
    parsed = urlparse(url)
    alias = parsed.hostname or ""
    honeypot_base = (os.getenv("HONEYPOT_BASE") or "http://localhost:8000").rstrip("/")
    forward_url = f"{honeypot_base}/{alias}{parsed.path}"
    if parsed.query:
        forward_url += f"?{parsed.query}"
    try:
        resp = httpx.get(forward_url, timeout=10)
        return f"status={resp.status_code}\n{resp.text[:2000]}"
    except Exception as e:
        return f"error: {e}"


def done(summary: str) -> str:
    return "ok"


def execute_tool(name: str, args: dict, workdir: Path) -> str:
    if name == "read_file":
        return read_file(workdir, args["path"])
    if name == "write_file":
        return write_file(workdir, args["path"], args["content"])
    if name == "run_cmd":
        return run_cmd(workdir, args["cmd"])
    if name == "http_get":
        return http_get(args["url"])
    if name == "done":
        return done(args["summary"])
    return f"error: unknown tool: {name}"
