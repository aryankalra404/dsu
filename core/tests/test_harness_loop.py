"""End to end, offline: replay the real recorded runs through the whole pipeline -- intent gate, the harness
loop, live pause on a scope violation, decisions, sandbox executions, verdicts, approval, audit."""

import asyncio

import pytest

import audit
import config
import orchestrator as orch
import ws
from scene.state import RUNS


@pytest.fixture(autouse=True)
def offline(tmp_path, monkeypatch):
    for k, v in {"USE_LLM": False, "USE_N8N": False, "USE_SANDBOX": False, "RUNS_DIR": tmp_path / "runs",
                 "AUDIT_DB": tmp_path / "audit.sqlite3", "REPLAY_MIN_GAP_S": 0, "REPLAY_MAX_GAP_S": 0,
                 "PAUSE_RATE_LIMIT_S": 3600, "SLACK_WEBHOOK_URL": ""}.items():
        monkeypatch.setattr(config, k, v)
    monkeypatch.setattr(config, "HONEYPOT_BASE", "http://127.0.0.1:9/honeypot")  # nothing listens: no real egress
    sent: list[dict] = []

    async def capture(run_id, msg):
        sent.append(msg)

    monkeypatch.setattr(orch, "broadcast", capture)
    monkeypatch.setattr(ws, "broadcast", capture)
    orch._last_pause.clear()
    RUNS.clear()
    return sent


async def _until(run, phase, timeout=90):
    for _ in range(int(timeout * 20)):
        if run.phase == phase:
            return
        if run.phase == "error":
            raise AssertionError(run.error)
        await asyncio.sleep(0.05)
    raise AssertionError(f"run stuck in {run.phase}, wanted {phase}")


def test_drifting_recording_pauses_and_gets_verdicts(offline):
    sent = offline

    async def scenario():
        run = await orch.create_run("", "", replay="drifting")
        await _until(run, "intent")
        assert run.scope == ["features/schemes/**"]
        assert {c["type"] for c in run.claims} >= {"stays_in_scope", "no_churn", "fetches_external"}
        await orch.confirm_claims(run, run.claims, run.scope, run.probe_entry, None, "test")

        await _until(run, "paused")
        first_pause = run.pauses[0]
        assert first_pause["reason"] == "scope_violation"
        assert first_pause["path"] == "features/scheme_finder.py"  # the agent's first write landed outside scope
        assert run.gate["which"] == "pause"
        with pytest.raises(orch.PipelineError):
            await orch.decision(run, "approve", "approve", None, "test")  # wrong gate
        await orch.decision(run, "pause", "continue", None, "test")

        await _until(run, "approve")
        return run

    run = asyncio.run(scenario())
    kinds = [e["kind"] for e in run.events]
    assert kinds.count("write") == 6 and "pause" in kinds and "resume" in kinds and kinds[-1] == "exec"
    assert run.events[-1]["drift"]["scope_violation"] is True
    new_node = next(m for m in sent if m["t"] == "graph_patch")["nodes"][0]
    assert new_node["id"] == "features/scheme_finder.py"

    v = {c["type"]: c["verdict"]["verdict"] for c in run.claims_with_verdicts() if c["source"] == "auto"}
    assert v["stays_in_scope"] == "DRIFT"
    assert v["no_churn"] == "REAL"
    modes = [t["mode"] for t in run.traces]
    assert modes.count("happy") == 1 and modes.count("probe") == 4
    probe = next(c for c in run.claims_with_verdicts() if c["type"] == "resists_probe")
    # the drifting agent rewrote db.py with a parameterised query, so the probes find no unescaped sink
    assert probe["verdict"]["verdict"] == "REAL"
    assert any(n.startswith("Fixer skipped") for n in run.notes)

    asyncio.run(orch.decision(run, "approve", "approve", None, "test"))
    assert run.final == "merged" and run.phase == "final"
    row = next(r for r in audit.list_runs() if r["id"] == run.id)
    assert row["final"] == "merged" and len(row["pauses"]) == 1


def test_clean_recording_never_pauses_and_kill_works(offline):
    async def scenario():
        run = await orch.create_run("", "", replay="clean")
        await _until(run, "intent")
        await orch.confirm_claims(run, run.claims, run.scope, run.probe_entry, None, "test")
        await _until(run, "approve")
        return run

    run = asyncio.run(scenario())
    assert run.pauses == []
    by_type = {c["type"]: c["verdict"]["verdict"] for c in run.claims_with_verdicts() if c["source"] == "auto"}
    assert by_type == {"stays_in_scope": "REAL", "no_churn": "REAL"}
    probe = next(c for c in run.claims_with_verdicts() if c["type"] == "resists_probe")
    # the clean agent left the example repo's unparameterised query in db.py untouched
    assert probe["verdict"]["verdict"] == "VULN"

    async def killed():
        r = await orch.create_run("", "", replay="drifting")
        await _until(r, "intent")
        await orch.confirm_claims(r, r.claims, r.scope, r.probe_entry, None, "test")
        await _until(r, "paused")
        await orch.decision(r, "pause", "kill", None, "test")
        for _ in range(200):
            if r.final:
                break
            await asyncio.sleep(0.05)
        return r

    r = asyncio.run(killed())
    assert r.final == "killed" and r.agent["state"] == "killed"


def test_live_run_requires_llm(offline):
    with pytest.raises(orch.PipelineError):
        asyncio.run(orch.create_run(".", "do something"))


def test_n8n_mode_protocol(offline, monkeypatch):
    """USE_N8N=true: core never decides a gate itself; a stand-in for the n8n tree (MVP.md §7) calls back."""
    import notify

    monkeypatch.setattr(config, "USE_N8N", True)
    calls: list[tuple[str, str]] = []
    state: dict = {}

    async def fake_n8n(payload):
        run = state["run"]
        ev = payload["event"]
        calls.append(("event", ev))
        if ev == "claims_extracted":
            await orch.set_gate(run, "intent", "n8n://wait-intent")
        elif ev == "traj_event" and payload["traj"].get("fact") and not state.get("paused_once"):
            state["paused_once"] = True  # the workflow's Code node: one pause per 60 s per run
            await orch.pause(run, payload["traj"]["fact"], "n8n://wait-pause")
            return {"paused": True}
        elif ev == "verdicts_ready":
            assert payload["fixable"] is False  # no LLM, no recorded fix
            await orch.open_approve(run, "n8n://wait-approve")
        return {"ok": True}

    async def fake_resume(url, body):
        run = state["run"]
        calls.append((url, body["decision"]))
        if url == "n8n://wait-intent":
            await orch.start(run)
        elif url == "n8n://wait-pause":
            await orch.agent_action(run, {"continue": "resume", "steer": "steer", "kill": "kill"}[body["decision"]],
                                    body.get("text"))
        elif url == "n8n://wait-approve":
            await orch.finish(run, "merged" if body["decision"] == "approve" else "rejected")

    monkeypatch.setattr(notify, "n8n", fake_n8n)
    monkeypatch.setattr(notify, "resume_n8n", fake_resume)

    async def scenario():
        run = await orch.create_run("", "", replay="drifting")
        state["run"] = run
        await _until(run, "intent")
        while run.gate["which"] != "intent":
            await asyncio.sleep(0.02)
        await orch.confirm_claims(run, run.claims, run.scope, run.probe_entry, None, "test")
        await _until(run, "paused")
        await orch.decision(run, "pause", "continue", None, "test")
        await _until(run, "approve")
        await orch.decision(run, "approve", "approve", None, "test")
        return run

    run = asyncio.run(scenario())
    assert run.final == "merged"
    assert ("n8n://wait-intent", "confirm") in calls
    assert ("n8n://wait-pause", "continue") in calls
    assert ("n8n://wait-approve", "approve") in calls
    assert [c for c in calls if c[0] == "event"][0] == ("event", "claims_extracted")
