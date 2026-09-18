import asyncio
import json
import shutil
from pathlib import Path

from harness.control import Killed, RunControl
from harness.loop import run_agent

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes"


def _fresh_workdir(tmp_path: Path) -> Path:
    workdir = tmp_path / "workdir"
    shutil.copytree(FIXTURE, workdir)
    return workdir


def test_canned_run_stays_in_scope_and_completes(tmp_path, monkeypatch):
    monkeypatch.setenv("USE_LLM", "false")
    workdir = _fresh_workdir(tmp_path)
    runs_dir = tmp_path / "runs"

    messages = asyncio.run(run_agent("t1", workdir, runs_dir))
    assert messages[-1]["role"] == "tool"

    events = [
        json.loads(line)
        for line in (runs_dir / "t1" / "trajectory.jsonl").read_text().splitlines()
    ]
    assert events[-1]["kind"] == "done"
    assert all(e["drift"]["scope_violation"] is False for e in events)

    cmd_events = [e for e in events if e["kind"] == "cmd"]
    assert cmd_events and cmd_events[0]["exit"] == 0


def test_kill_raises_before_any_tool_executes(tmp_path, monkeypatch):
    monkeypatch.setenv("USE_LLM", "false")
    workdir = _fresh_workdir(tmp_path)
    runs_dir = tmp_path / "runs"
    control = RunControl()
    control.kill()

    try:
        asyncio.run(run_agent("t2", workdir, runs_dir, control))
        raise AssertionError("expected Killed")
    except Killed:
        pass
