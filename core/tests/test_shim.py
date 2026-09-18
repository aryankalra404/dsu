"""The polygraph shim + runner, for real, in subprocess mode on the bundled example repo (no Docker needed)."""

import asyncio
import shutil
from pathlib import Path

import config
from sandbox import executor

SAMPLE = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes"


def _copy(tmp_path: Path) -> Path:
    wd = tmp_path / "workdir"
    shutil.copytree(SAMPLE, wd)
    return wd


def test_probe_reaches_unparameterised_sql(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USE_SANDBOX", False)
    wd = _copy(tmp_path)
    t = asyncio.run(executor.execute(wd, run_id="r", exec_id="e1", mode="probe", iteration=0,
                                     entry="app:run", input="0 OR 1=1 --"))
    sinks = [c for c in t["calls"] if c.get("sink")]
    assert any(c["fn"].endswith("execute") and c["arg_has_payload"] for c in sinks), t
    assert "db.py:search_schemes" in {c["fn"] for c in t["calls"]}
    assert "app.py:run" in t["defined"]


def test_parameterised_sql_is_not_flagged(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USE_SANDBOX", False)
    monkeypatch.setenv("FIXTURE_UNSAFE_QUERY", "false")
    wd = _copy(tmp_path)
    t = asyncio.run(executor.execute(wd, run_id="r", exec_id="e1", mode="probe", iteration=0,
                                     entry="app:run", input="0 OR 1=1 --"))
    sinks = [c for c in t["calls"] if c.get("sink") and c["fn"].endswith("execute")]
    assert sinks and not any(c["arg_has_payload"] for c in sinks)


def test_pytest_execution_records_calls(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USE_SANDBOX", False)
    wd = _copy(tmp_path)
    t = asyncio.run(executor.execute(wd, run_id="r", exec_id="e1", mode="happy", iteration=0, pytest_suite=True))
    assert t["exit"] == 0, t["output"]
    fns = {c["fn"] for c in t["calls"]}
    assert "db.py:search_schemes" in fns
    assert "tests/test_app.py:test_search_schemes_returns_free_schemes_for_zero_income" in fns
