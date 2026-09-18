"""The run pipeline (MVP.md §4 data flow) and the local gate tree (MVP.md §7 with USE_N8N=false).

  create -> extract claims -> [HITL #1 intent gate] -> agent runs in the harness; every tool call is a
  TrajectoryEvent; a fact (scope violation / revert) pauses it -> [live HITL: continue / steer / kill] ->
  done -> agent + AST claims -> sandbox executions -> verdicts -> Fixer loop (<= MAX_FIX_ITERATIONS) ->
  [HITL #2 approve / reject] -> final + audit + Slack/GitHub.

With USE_N8N=true every gate decision is n8n's: core forwards events and n8n calls back /gate, /start, /agent,
/agents/fix, /apply, /final. With USE_N8N=false this module runs the same tree itself."""

import asyncio
import logging
import shutil
import time
import uuid

import audit
import config
import notify
import recordings
from agents import extract as extractor
from agents import fixer, llm
from agents import summary as summarizer
from checks import compute_verdicts
from diffs import PatchError, apply_diff, make_diff
from harness import agent as tools
from harness.control import Killed, RunControl
from harness.loop import tool_loop
from harness.trajectory import TrajectoryRecorder
from repo import RepoError, acquire, normalize_rel
from sandbox import executor
from scene.layout import City
from scene.state import Run, put_run
from ws import broadcast

log = logging.getLogger("soc.orchestrator")

FIXABLE = {"FAKE", "DEAD", "VULN"}  # DRIFT is a fact about the trajectory; a patch cannot un-happen it
CONTROLS: dict[str, RunControl] = {}
RECORDERS: dict[str, TrajectoryRecorder] = {}
_patches: dict[str, list[dict]] = {}
_last_pause: dict[str, float] = {}
_tasks: set[asyncio.Task] = set()


class PipelineError(Exception):
    """A request that doesn't fit the run's current phase (HTTP 409) or is invalid (HTTP 400)."""


# ------------------------------------------------------------------ plumbing

def spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def send(run: Run, msg: dict) -> None:
    await broadcast(run.id, msg)


def save(run: Run) -> None:
    try:
        run.persist()
        audit.upsert(run)
    except OSError as e:  # persistence must never kill a live run
        log.warning("persist failed for %s: %s", run.id, e)


async def set_phase(run: Run, phase: str) -> None:
    run.phase = phase
    save(run)
    await send(run, {"t": "phase", "phase": phase})


async def note(run: Run, text: str) -> None:
    run.note(text)
    await send(run, {"t": "note", "text": text})


async def set_agent_state(run: Run, state: str, reason: str | None = None) -> None:
    run.agent["state"] = state
    await send(run, {"t": "agent_state", "state": state, "reason": reason})


async def set_gate(run: Run, which: str | None, resume_url: str | None = None, reason: str | None = None) -> None:
    run.gate = {"which": which, "resume_url": resume_url, "reason": reason}
    await send(run, {"t": "gate", "which": which, "resume_url": resume_url, "reason": reason})


async def fail(run: Run, message: str) -> None:
    log.error("run %s failed: %s", run.id, message)
    run.error = message
    await set_phase(run, "error")
    await send(run, {"t": "error", "message": message})


def _guard(coro_fn):
    """Background steps report failures on the run instead of dying silently."""
    async def wrapper(run: Run, *a, **k):
        try:
            return await coro_fn(run, *a, **k)
        except Exception as e:  # noqa: BLE001
            log.exception("pipeline step %s failed", coro_fn.__name__)
            await fail(run, f"{coro_fn.__name__}: {e}")
    wrapper.__name__ = coro_fn.__name__
    return wrapper


# ------------------------------------------------------------------ 1-2. create + extract

async def create_run(repo: str, intent: str, replay: str | None = None, probe_entry: str | None = None,
                     happy_input: str | None = None, github_pr: str | None = None, run_id: str | None = None) -> Run:
    meta = None
    if replay:
        meta = recordings.load_meta(replay)
        repo = str(meta["repo_path"])
        intent = (intent or "").strip() or meta.get("intent", "")
    elif not config.USE_LLM:
        raise PipelineError("USE_LLM=false: a live agent needs the LLM. Pick a recording to replay, or set USE_LLM=true.")
    if not (intent or "").strip():
        raise PipelineError("intent is required")

    run_id = run_id or uuid.uuid4().hex[:8]
    run_dir = config.RUNS_DIR / run_id
    if run_dir.exists():
        shutil.rmtree(run_dir)
    try:
        await asyncio.to_thread(acquire, repo, run_dir / "original")
    except RepoError as e:
        raise PipelineError(str(e)) from e
    workdir = run_dir / "workdir"
    await asyncio.to_thread(shutil.copytree, run_dir / "original", workdir)
    city = await asyncio.to_thread(City, workdir, [], config.MAX_REPO_FILES)

    run = Run(id=run_id, repo=repo, intent=intent.strip(), workdir=workdir, dir=run_dir, city=city, replay=replay,
              probe_entry=(probe_entry or (meta or {}).get("probe_entry") or None),
              happy_input=happy_input or None, github_pr=github_pr or None)
    if city.truncated:
        run.note(f"Large repo: the city shows the first {config.MAX_REPO_FILES} files (MAX_REPO_FILES).")
    if replay:
        run.note(f"Replay of recording '{replay}' (USE_LLM=false): the agent's moves come from the recorded "
                 "transcript; every tool call, check and gate runs for real.")
    put_run(run)
    save(run)
    await send(run, {"t": "run_created", "run": {"run_id": run.id, "repo": repo, "intent": run.intent}})
    spawn(_extract(run, meta))
    return run


@_guard
async def _extract(run: Run, meta: dict | None) -> None:
    if meta and meta.get("claims"):
        claims, scope, method = extractor.number(meta["claims"]), list(meta.get("scope", [])), "recording"
    else:
        claims, scope, probe, method = await extractor.extract(run.intent, run.city.files)
        run.probe_entry = run.probe_entry or probe
        if meta and meta.get("scope"):
            scope = list(meta["scope"])
    if method == "keywords":
        run.note("Claims and scope were proposed by keyword rules, not an LLM (USE_LLM=false). Review and edit "
                 "them before confirming.")
    run.claims, run.scope = claims, scope
    run.city.set_scope(scope)
    await send(run, {"t": "scene", "scene": run.snapshot()})
    await set_phase(run, "intent")
    if config.USE_N8N:
        await notify.n8n({"event": "claims_extracted", "run_id": run.id, "claims": run.claims, "scope": run.scope})
    else:
        await set_gate(run, "intent")


# ------------------------------------------------------------------ 3-4. HITL #1

async def confirm_claims(run: Run, claims: list[dict], scope: list[str], probe_entry: str | None,
                         happy_input: str | None, by: str) -> None:
    if run.phase != "intent":
        raise PipelineError(f"claims can only be confirmed at the intent gate (phase is {run.phase})")
    clean_scope = [s.strip() for s in scope if isinstance(s, str) and s.strip()]
    if not clean_scope:
        raise PipelineError("scope needs at least one glob, e.g. src/feature/**")
    confirmed = []
    for c in claims:
        if c.get("type") not in extractor.CLAIM_TYPES or not str(c.get("text", "")).strip():
            raise PipelineError(f"invalid claim: {c}")
        confirmed.append({"id": c.get("id") or summarizer.next_id(confirmed), "type": c["type"],
                          "text": str(c["text"]).strip(), "target": (c.get("target") or None),
                          "axis": (c.get("axis") or None), "source": c.get("source") or "human", "confirmed": True})
    ids = [c["id"] for c in confirmed]
    if len(ids) != len(set(ids)):
        raise PipelineError("claim ids must be unique")
    run.claims, run.scope = confirmed, clean_scope
    run.probe_entry = (probe_entry or "").strip() or None
    run.happy_input = (happy_input or "").strip() or None
    run.city.set_scope(clean_scope)
    run.decisions.append({"which": "intent", "decision": "confirm", "by": by, "at": time.time()})
    await send(run, {"t": "scene", "scene": run.snapshot()})
    await send(run, {"t": "decision", "which": "intent", "decision": "confirm", "by": by})
    resume_url = run.gate.get("resume_url")
    await set_gate(run, None)
    if config.USE_N8N and resume_url:
        await notify.resume_n8n(resume_url, {"decision": "confirm", "by": by})  # n8n then POSTs /start
    else:
        await start(run)


async def start(run: Run) -> None:
    if run.phase != "intent":
        raise PipelineError(f"run can only start from the intent gate (phase is {run.phase})")
    await set_phase(run, "running")
    await set_agent_state(run, "running")
    spawn(_agent(run))


# ------------------------------------------------------------------ 5. the agent under watch

def _prepare(run: Run, event: dict) -> None:
    """Runs inside the recorder before an event is written: grow the city for new files, keep the dot on a
    building that exists."""
    kind, path = event["kind"], event.get("path")
    if kind == "write" and path:
        node, edges = run.city.touch(path)
        if node is not None:
            _patches.setdefault(run.id, []).append({"node": node, "edges": edges})
    elif kind == "read" and path:
        node = run.city.ensure_node(path)
        if node is not None:
            _patches.setdefault(run.id, []).append({"node": node, "edges": run.city.edges.get(path)})
    if event.get("node") and event["node"] not in run.city.nodes:
        event["node"] = run.agent.get("node")


async def _on_event(run: Run, event: dict) -> None:
    patches = _patches.pop(run.id, [])
    if patches:
        await send(run, {"t": "graph_patch", "nodes": [p["node"] for p in patches],
                         "edges": {p["node"]["id"]: p["edges"] for p in patches if p["edges"] is not None}})
    run.apply_event(event)
    await send(run, {"t": "traj_event", "event": event})
    fact = event.get("fact")
    if not fact:
        return
    if config.USE_N8N:
        # n8n's Respond node answers only after it has POSTed /gate, so the pause lands before the next call
        await notify.n8n({"event": "traj_event", "run_id": run.id, "traj": event, "drift": event["drift"]})
        return
    now = time.monotonic()
    if now - _last_pause.get(run.id, -1e9) < config.PAUSE_RATE_LIMIT_S:
        return  # MVP.md §7: one pause per PAUSE_RATE_LIMIT_S per run, so a burst is one gate, not ten
    _last_pause[run.id] = now
    await pause(run, fact, None)


def _replay_gap(pace: list[int], i: int) -> float:
    if i <= 0 or i >= len(pace):
        return config.REPLAY_MIN_GAP_S
    gap = (pace[i] - pace[i - 1]) / 1000 / max(config.REPLAY_SPEED, 0.1)
    return min(max(gap, config.REPLAY_MIN_GAP_S), config.REPLAY_MAX_GAP_S)


@_guard
async def _agent(run: Run) -> None:
    control = CONTROLS[run.id] = RunControl()

    async def on_event(e: dict) -> None:
        await _on_event(run, e)

    recorder = RECORDERS[run.id] = TrajectoryRecorder(run.id, run.dir / "trajectory.jsonl", run.scope, on_event,
                                                      lambda e: _prepare(run, e))
    messages = [{"role": "system", "content": tools.system_prompt(run.intent)},
                {"role": "user", "content": tools.first_user_message(run.city.files, run.city.truncated)}]

    if run.replay:
        turns = iter(recordings.turns(run.replay))
        pace = recordings.pacing(run.replay)

        async def next_turn(_m):
            return next(turns, None)
    else:
        pace = []

        async def next_turn(m):
            return await llm.chat_turn(m, tools.AGENT_TOOLS)

    calls = 0
    done_recorded = False

    async def execute(tc: dict) -> tuple[str, bool]:
        nonlocal calls, done_recorded
        if run.replay:
            await asyncio.sleep(_replay_gap(pace, calls))
        calls += 1
        name, a = tc["name"], tc["arguments"]
        wd = run.workdir
        if name == "read_file":
            path = normalize_rel(a.get("path", ""))
            result = await asyncio.to_thread(tools.read_file, wd, path)
            await recorder.record("read", path=path)
            return result, False
        if name == "write_file":
            path, content = normalize_rel(a.get("path", "")), a.get("content", "")
            before = tools.file_hash_before(wd, path)
            result = await asyncio.to_thread(tools.write_file, wd, path, content)
            if result == "ok":
                await recorder.record("write", path=path, content=content, before_hash=before)
            return result, False
        if name == "run_cmd":
            cmd = a.get("cmd", "")
            code, out = await asyncio.to_thread(tools.run_cmd, wd, cmd)
            await recorder.record("cmd", cmd=cmd, exit=code)
            return f"exit={code}\n{out}", False
        if name == "http_get":
            status, host, body = await asyncio.to_thread(tools.http_get, a.get("url", ""))
            await recorder.record("http", host=host, status=status, url=a.get("url", ""))
            return f"status={status}\n{body}", False
        if name == "done":
            done_recorded = True
            await recorder.record("done", summary=a.get("summary", ""))
            return "ok", True
        return f"error: unknown tool {name}", False

    def on_turn(msgs: list[dict]) -> None:
        import json

        (run.dir / "transcript.json").write_text(json.dumps(msgs, indent=1), encoding="utf-8")

    try:
        final_text = await tool_loop(messages=messages, next_turn=next_turn, execute=execute,
                                     checkpoint=control.checkpoint, max_turns=config.MAX_AGENT_TURNS, on_turn=on_turn)
    except Killed:
        await finish(run, "killed")
        return
    if final_text is None:
        await note(run, f"The agent stopped without finishing (turn cap {config.MAX_AGENT_TURNS} or end of recording).")
        final_text = ""
    if not done_recorded:
        await recorder.record("done", summary=final_text)
    run.summary = final_text
    await set_agent_state(run, "done")
    await _after_agent(run)


async def pause(run: Run, reason: str, resume_url: str | None) -> None:
    control = CONTROLS.get(run.id)
    if control is None or run.final:
        return
    control.pause()
    last = run.events[-1] if run.events else {}
    run.pauses.append({"seq": last.get("seq"), "reason": reason, "path": last.get("path"), "at": time.time()})
    await set_phase(run, "paused")
    await set_agent_state(run, "paused", reason)
    await set_gate(run, "pause", resume_url, reason)
    rec = RECORDERS.get(run.id)
    if rec:
        await rec.record("pause", reason=reason)
    if not config.USE_N8N:
        sent = await notify.slack(f"{run.id} PAUSED: agent wrote {last.get('path')} ({reason.replace('_', ' ')})")
        if not sent and config.SLACK_WEBHOOK_URL == "":
            run.note("Slack alerts skipped: SLACK_WEBHOOK_URL is not set.")


async def agent_action(run: Run, action: str, text: str | None) -> None:
    control = CONTROLS.get(run.id)
    if control is None:
        raise PipelineError("the agent is not running")
    rec = RECORDERS.get(run.id)
    if action == "kill":
        control.kill()
        return
    if action not in ("resume", "steer"):
        raise PipelineError(f"unknown action {action}")
    if action == "steer":
        if not (text or "").strip():
            raise PipelineError("steer needs text")
        if rec:
            await rec.record("steer", text=text)
        if run.replay:
            await note(run, "Steer text was injected into the agent's conversation, but this is a replay: the "
                            "recorded agent's next moves were fixed when it was recorded.")
        control.steer(text or "")
    else:
        if rec:
            await rec.record("resume")
        control.resume()
    await set_gate(run, None)
    await set_phase(run, "running")
    await set_agent_state(run, "running", "steered" if action == "steer" else None)


async def decision(run: Run, which: str, decision_: str, text: str | None, by: str) -> None:
    gate = run.gate.get("which")
    if gate != which:
        raise PipelineError(f"no open {which} gate (open gate: {gate})")
    allowed = {"pause": {"continue", "steer", "kill"}, "approve": {"approve", "reject"}}.get(which, set())
    if decision_ not in allowed:
        raise PipelineError(f"decision {decision_!r} is not valid at the {which} gate")
    run.decisions.append({"which": which, "decision": decision_, "text": text, "by": by, "at": time.time()})
    await send(run, {"t": "decision", "which": which, "decision": decision_, "text": text, "by": by})
    save(run)
    resume_url = run.gate.get("resume_url")
    if config.USE_N8N and resume_url:
        await set_gate(run, None)
        await notify.resume_n8n(resume_url, {"decision": decision_, "text": text, "by": by})
        return
    if which == "pause":
        await agent_action(run, {"continue": "resume", "steer": "steer", "kill": "kill"}[decision_], text)
    else:
        await finish(run, "merged" if decision_ == "approve" else "rejected")


# ------------------------------------------------------------------ 6-9. claims of work, executions, verdicts, fixes

@_guard
async def _after_agent(run: Run) -> None:
    await set_phase(run, "checking")
    said, method = await summarizer.agent_claims(run.summary or "")
    if method == "keywords" and said:
        run.note("'What the agent said' claims were split from its summary by keyword rules (USE_LLM=false).")
    run.claims = summarizer.merge(run.claims, said + summarizer.ast_claims(run.workdir, run.events))
    await send(run, {"t": "claims", "claims": run.claims_with_verdicts()})
    if config.USE_N8N:
        await notify.n8n({"event": "agent_done", "run_id": run.id, "summary": run.summary})
    await check(run)


async def _run_execs(run: Run) -> list[dict]:
    plans: list[dict] = []
    if executor.has_python_tests(run.workdir):
        plans.append({"mode": "happy", "pytest_suite": True})
        targets = [c["target"] for c in run.claims if c["type"] == "fetches_external" and c.get("target")]
        if targets:
            plans.append({"mode": "chaos", "pytest_suite": True, "chaos": f"{targets[0]}:500"})
    if run.probe_entry:
        if run.happy_input:
            plans.append({"mode": "happy", "entry": run.probe_entry, "input": run.happy_input})
        for p in executor.PROBES:
            plans.append({"mode": "probe", "entry": run.probe_entry, "input": p["input"]})
    if not plans:
        await note(run, "No sandbox executions: the repo has no Python tests and no probe entrypoint is set, so "
                        "execution-based claims are INCONCLUSIVE.")
    out = []
    rec = RECORDERS.get(run.id)
    for plan in plans:
        exec_id = f"e{len(run.traces) + len(out) + 1}"
        await send(run, {"t": "exec_start", "exec_id": exec_id, "mode": plan["mode"],
                         "input": plan.get("input", "pytest")})
        if rec:
            await rec.record("exec", exec_id=exec_id, mode=plan["mode"])
        trace = await executor.execute(run.workdir, run_id=run.id, exec_id=exec_id, iteration=run.iteration, **plan)
        out.append(trace)
        for h in trace.get("http", [])[:50]:
            await send(run, {"t": "trace_event", "exec_id": exec_id, "kind": "http", "item": h})
        for c in [c for c in trace.get("calls", []) if c.get("sink")][:50]:
            await send(run, {"t": "trace_event", "exec_id": exec_id, "kind": "call", "item": c})
        await send(run, {"t": "exec_end", "exec_id": exec_id, "output": (trace.get("output") or "")[-2000:],
                         "exit": trace.get("exit"), "mode": trace.get("mode"), "sandbox": trace.get("sandbox"),
                         "http_count": len(trace.get("http", [])), "calls_count": len(trace.get("calls", [])),
                         "error": trace.get("stderr_tail") if trace.get("sandbox_error") else None})
        if trace.get("sandbox") == "subprocess":
            run.note("Sandbox: subprocess mode (USE_SANDBOX=false). HTTP is rewritten to the honeypot by the shim; "
                     "raw sockets are not blocked.")
    return out


@_guard
async def check(run: Run) -> None:
    await set_phase(run, "checking")
    traces = await _run_execs(run)
    run.traces.extend(traces)
    current = [t for t in run.traces if t.get("iteration") == run.iteration]
    verdicts = compute_verdicts(run.claims, run.events, current, run.scope, run.iteration, run.workdir)
    run.verdicts = verdicts
    run.verdict_history.append({"iteration": run.iteration, "verdicts": verdicts})
    save(run)
    await send(run, {"t": "verdicts", "verdicts": verdicts, "iteration": run.iteration})
    if config.USE_N8N:
        fixable = any(v["verdict"] in FIXABLE for v in verdicts) and _fix_available(run)
        if any(v["verdict"] in FIXABLE for v in verdicts) and not fixable:
            await note(run, "Fixer unavailable (needs USE_LLM=true or a recorded fix); n8n goes to the approval gate.")
        await notify.n8n({"event": "verdicts_ready", "run_id": run.id, "verdicts": verdicts,
                          "iteration": run.iteration, "fixable": fixable})
        return
    if any(v["verdict"] in FIXABLE for v in verdicts) and run.iteration < config.MAX_FIX_ITERATIONS:
        await _fix_iteration(run)
    else:
        await open_approve(run)


def _fix_available(run: Run) -> bool:
    if config.USE_LLM:
        return True
    rec_dir = recordings.load_meta(run.replay)["dir"] if run.replay else None
    return fixer.cached_fix(rec_dir, run.iteration + 1) is not None


async def propose_fix(run: Run) -> dict:
    """Fixer output for the next iteration: recorded with the replay if available, else live LLM."""
    rec_dir = recordings.load_meta(run.replay)["dir"] if run.replay else None
    cached = fixer.cached_fix(rec_dir, run.iteration + 1)
    if cached:
        return {**cached, "source": "recording"}
    result = await fixer.propose_fix(run.workdir, run.dir / "fix-scratch", run.intent, run.scope, run.claims,
                                     run.verdicts, run.city.files)
    return {**result, "source": "llm"}


async def _fix_iteration(run: Run) -> None:
    await set_phase(run, "fixing")
    try:
        fix = await propose_fix(run)
    except llm.LLMUnavailable as e:
        await note(run, f"Fixer skipped: it needs the LLM ({e}) and no recorded fix exists for iteration "
                        f"{run.iteration + 1}. Going to the approval gate.")
        await open_approve(run)
        return
    if not fix["diff"].strip():
        await note(run, "The Fixer proposed no changes. Going to the approval gate.")
        await open_approve(run)
        return
    await apply_patch(run, fix["diff"], fix.get("rationale", ""), fix.get("source", "llm"))


async def apply_patch(run: Run, diff: str, rationale: str, source: str) -> None:
    try:
        changed = await asyncio.to_thread(apply_diff, run.workdir, diff)
    except PatchError as e:
        await note(run, f"Patch did not apply ({e}). Going to the approval gate.")
        await open_approve(run)
        return
    run.iteration += 1
    run.patches.append({"iteration": run.iteration, "diff": diff, "rationale": rationale, "source": source,
                        "files": changed})
    run.pending_fix = None
    await send(run, {"t": "patch_proposed", "iteration": run.iteration, "diff": diff, "rationale": rationale,
                     "source": source, "files": changed})
    nodes, edges = [], {}
    for f in changed:
        node, e = run.city.touch(f)
        if node:
            nodes.append(node)
            if e is not None:
                edges[f] = e
    if nodes:
        await send(run, {"t": "graph_patch", "nodes": nodes, "edges": edges})
    spawn(check(run))


async def open_approve(run: Run, resume_url: str | None = None) -> None:
    await set_phase(run, "approve")
    await set_gate(run, "approve", resume_url)
    real = sum(1 for v in run.verdicts if v["verdict"] == "REAL")
    if not config.USE_N8N:
        await notify.slack(f"{run.id} ready for review: {real}/{len(run.verdicts)} REAL after "
                           f"{run.iteration} fix iteration(s)")


# ------------------------------------------------------------------ 10. final

async def finish(run: Run, state: str, github_pr: str | None = None) -> None:
    if run.final:
        return
    run.final = state
    control = CONTROLS.get(run.id)
    if control and state == "killed":
        control.kill()
    await set_gate(run, None)
    await set_agent_state(run, "killed" if state == "killed" else run.agent.get("state", "done"))
    await set_phase(run, "final")
    await send(run, {"t": "final", "state": state})
    if not config.USE_N8N:
        await notify.slack(f"{run.id} {state}")
        pr = github_pr or run.github_pr
        if pr:
            try:
                result = await notify.github(pr, state, run.claims, run.verdicts)
            except Exception as e:  # noqa: BLE001
                result = f"failed: {e}"
            await note(run, f"GitHub: {result}")
    save(run)


def agent_diff(run: Run) -> str:
    return make_diff(run.dir / "original", run.workdir)
