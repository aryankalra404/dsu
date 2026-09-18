import asyncio
import json
import shutil
from pathlib import Path

import harness.loop as loop_module
from harness.control import Killed, RunControl
from harness.loop import _tool_call_to_event_fields, run_agent

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes"


def _fresh_workdir(tmp_path: Path) -> Path:
    workdir = tmp_path / "workdir"
    shutil.copytree(FIXTURE, workdir)
    return workdir


def test_replaying_clean_transcript_stays_in_scope(tmp_path, monkeypatch):
    monkeypatch.setenv("USE_LLM", "false")
    workdir = _fresh_workdir(tmp_path)
    runs_dir = tmp_path / "runs"

    asyncio.run(run_agent("t1", workdir, runs_dir, replay_run="clean"))

    events = [
        json.loads(line)
        for line in (runs_dir / "t1" / "trajectory.jsonl").read_text().splitlines()
    ]
    assert events[-1]["kind"] == "done"
    # the clean run only ever wrote under features/schemes/
    assert all(e["drift"]["scope_violation"] is False for e in events)
    assert {e["path"] for e in events if e["kind"] == "write"} == {
        "features/schemes/__init__.py",
        "features/schemes/finder.py",
        "features/schemes/test_finder.py",
    }


def test_replaying_drifting_transcript_flags_the_scope_violation(tmp_path, monkeypatch):
    monkeypatch.setenv("USE_LLM", "false")
    workdir = _fresh_workdir(tmp_path)
    runs_dir = tmp_path / "runs"

    asyncio.run(run_agent("t2", workdir, runs_dir, replay_run="drifting"))

    events = [
        json.loads(line)
        for line in (runs_dir / "t2" / "trajectory.jsonl").read_text().splitlines()
    ]
    assert events[-1]["kind"] == "done"
    assert events[-1]["drift"]["scope_violation"] is True
    # the recorded drift: the feature landed beside features/schemes/, plus
    # edits to files the intent said not to touch
    out_of_scope_writes = {e["path"] for e in events if e["kind"] == "write" and not e["in_scope"]}
    assert "features/scheme_finder.py" in out_of_scope_writes
    assert "utils/helpers.py" in out_of_scope_writes


def test_plain_text_ending_synthesizes_a_done_event(tmp_path, monkeypatch):
    monkeypatch.setenv("USE_LLM", "false")
    workdir = _fresh_workdir(tmp_path)
    runs_dir = tmp_path / "runs"

    # Neither recorded run actually called the done() tool -- both finished with
    # plain text -- so the synthesized done event is what every trajectory ends on.
    monkeypatch.setattr(
        loop_module, "_transcript_turns", lambda _run: [{"content": "All done, feature added."}]
    )

    messages = asyncio.run(run_agent("t3", workdir, runs_dir))
    assert messages[-1] == {"role": "assistant", "content": "All done, feature added."}

    events = [
        json.loads(line)
        for line in (runs_dir / "t3" / "trajectory.jsonl").read_text().splitlines()
    ]
    assert events[-1]["kind"] == "done"
    assert events[-1]["summary"] == "All done, feature added."


def test_rejected_run_cmd_does_not_crash_event_mapping():
    fields = _tool_call_to_event_fields(
        "run_cmd", {"cmd": "ls"}, "error: command not allowlisted: ls"
    )
    assert fields == {"kind": "cmd", "cmd": "ls", "exit": 1}


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
