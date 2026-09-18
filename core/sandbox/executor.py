"""Sandbox executions (MVP.md §4 step 7): run the supervised repo under the polygraph shim and collect a Trace.

USE_SANDBOX=true  -> Docker: deps installed on the default network, then the execution runs on an internal
                     network whose only reachable host is the core's honeypot.
USE_SANDBOX=false -> subprocess on this machine with the shim on PYTHONPATH. Every HTTP call the shim sees is
                     rewritten to the honeypot, but raw sockets are not blocked; each trace says `sandbox:
                     subprocess` so the UI can show that honestly (MVP.md §8 fallback)."""

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

import config

SANDBOX_DIR = config.REPO_ROOT / "sandbox"
SHIM_DIR = SANDBOX_DIR / "polygraph_shim"
RUNNER = SANDBOX_DIR / "runner.py"

# Generic probe payloads for resists_probe (MVP.md §5 check 5). Data, not per-repo stories.
PROBES = [
    {"name": "SQL injection", "input": "0 OR 1=1 --"},
    {"name": "SQL injection (quoted)", "input": "' OR '1'='1' --"},
    {"name": "path traversal", "input": "../../../../etc/passwd"},
    {"name": "shell injection", "input": "x; echo SOC_PWNED"},
]


def python_for_repo() -> str:
    return config.SANDBOX_PYTHON or sys.executable


def shim_env(workdir: Path, trace: bool, probe_input: str = "", chaos: str = "") -> dict:
    env = dict(os.environ)
    env.update({
        "SOC_APP_DIR": str(workdir.resolve()),
        "SOC_TRACE": "1" if trace else "0",
        "SOC_PROBE_INPUT": probe_input,
        "SOC_CHAOS": chaos,
        "SOC_HONEYPOT_BASE": config.HONEYPOT_BASE,
        "PYTHONPATH": os.pathsep.join([str(SHIM_DIR), str(workdir.resolve())]),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    env.pop("OPENAI_API_KEY", None)  # the supervised code never sees our key; LLM calls go to the honeypot
    env["OPENAI_BASE_URL"] = f"{config.HONEYPOT_BASE}/api.openai.com/v1"
    env["ANTHROPIC_BASE_URL"] = f"{config.HONEYPOT_BASE}/api.anthropic.com"
    return env


async def _run(cmd: list[str], env: dict | None, cwd: Path | None, timeout: float) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd, env=env, cwd=str(cwd) if cwd else None,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, f"timed out after {timeout:.0f}s"
    return proc.returncode or 0, out.decode("utf-8", "replace")


def _failed_trace(base: dict, reason: str) -> dict:
    return {**base, "output": "", "exit": 1, "duration_ms": 0, "http": [], "calls": [], "defined": [],
            "stderr_tail": reason[-2000:], "sandbox_error": True}


async def execute(
    workdir: Path,
    *,
    run_id: str,
    exec_id: str,
    mode: str,
    iteration: int,
    pytest_suite: bool = False,
    entry: str | None = None,
    input: str = "",
    chaos: str = "",
    claim_id: str | None = None,
) -> dict:
    base = {"run_id": run_id, "exec_id": exec_id, "mode": mode, "iteration": iteration,
            "input": input if entry else "pytest", "sandbox": "docker" if config.USE_SANDBOX else "subprocess"}
    if claim_id:
        base["claim_id"] = claim_id
    runner_args = ["--mode", mode, "--exec-id", exec_id, "--run-id", run_id, "--iteration", str(iteration)]
    runner_args += ["--pytest"] if pytest_suite else ["--entry", entry or "", "--input", input]
    if claim_id:
        runner_args += ["--claim-id", claim_id]

    with tempfile.TemporaryDirectory(prefix="soc-exec-") as tmp:
        out = Path(tmp) / "trace.json"
        if config.USE_SANDBOX:
            code, log = await _docker(workdir, Path(tmp), runner_args, input, chaos)
        else:
            env = shim_env(workdir, trace=True, probe_input=input if entry else "", chaos=chaos)
            code, log = await _run([python_for_repo(), str(RUNNER), "--out", str(out), *runner_args],
                                   env, workdir, config.EXEC_TIMEOUT_S)
        if not out.is_file():
            return _failed_trace(base, f"runner exit {code}: {log}")
        trace = json.loads(out.read_text(encoding="utf-8"))
    return {**base, **trace}


async def _docker(workdir: Path, out_dir: Path, runner_args: list[str], probe: str, chaos: str) -> tuple[int, str]:
    deps = workdir.parent / "deps"
    if (workdir / "requirements.txt").is_file() and not deps.exists():
        deps.mkdir(parents=True, exist_ok=True)
        await _run(["docker", "run", "--rm", "-v", f"{workdir}:/app:ro", "-v", f"{deps}:/deps",
                    config.SANDBOX_IMAGE, "pip", "install", "-q", "-r", "/app/requirements.txt", "--target", "/deps"],
                   None, None, 300)
    # the internal network has no route to the host, so containers use the compose honeypot service
    honeypot = config.SANDBOX_HONEYPOT_BASE
    cmd = ["docker", "run", "--rm", "--network", config.SANDBOX_NETWORK,
           "-v", f"{workdir}:/app", "-v", f"{out_dir}:/out",
           "-e", "SOC_APP_DIR=/app", "-e", "SOC_TRACE=1", "-e", f"SOC_PROBE_INPUT={probe}", "-e", f"SOC_CHAOS={chaos}",
           "-e", f"SOC_HONEYPOT_BASE={honeypot}", "-e", "PYTHONPATH=/app:/deps"]
    if deps.exists():
        cmd += ["-v", f"{deps}:/deps:ro"]
    cmd += [config.SANDBOX_IMAGE, "python", "/runner.py", "--out", "/out/trace.json", *runner_args]
    return await _run(cmd, None, None, config.EXEC_TIMEOUT_S)


def has_python_tests(workdir: Path) -> bool:
    for p in workdir.rglob("*.py"):
        name = p.name
        if (name.startswith("test_") or name.endswith("_test.py")) and "site-packages" not in p.parts:
            return True
    return False
