"""Spatial SOC core API (MVP.md §4, §6). Run: `cd core && uv run uvicorn main:app --port 8000`
(or `uv run python main.py`). Decisions come in over HTTP; the WebSocket carries run events out and presence in."""

import json
import logging

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import audit
import config
import orchestrator as orch
import recordings
from honeypot import router as honeypot_router
from scene.state import get_run
from ws import ws_endpoint

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Spatial SOC core")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(honeypot_router)


def _run(run_id: str):
    run = get_run(run_id)
    if run is None:
        raise HTTPException(404, f"no live run {run_id}")
    return run


async def _call(coro):
    try:
        return await coro
    except orch.PipelineError as e:
        raise HTTPException(409, str(e)) from e


# ------------------------------------------------------------------ meta

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/flags")
def flags():
    return config.flags()


@app.get("/recordings")
def list_recordings():
    return recordings.list_recordings()


# ------------------------------------------------------------------ runs

class CreateRun(BaseModel):
    repo: str = ""
    intent: str = ""
    replay: str | None = None
    probe_entry: str | None = None
    happy_input: str | None = None
    github_pr: str | None = None


@app.post("/runs")
async def create_run(body: CreateRun):
    try:
        run = await orch.create_run(body.repo, body.intent, body.replay, body.probe_entry, body.happy_input,
                                    body.github_pr)
    except orch.PipelineError as e:
        raise HTTPException(400, str(e)) from e
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    return {"run_id": run.id}


@app.get("/runs")
def list_runs():
    return audit.list_runs()


@app.get("/runs/{run_id}/scene")
def scene(run_id: str):
    return _run(run_id).snapshot()


@app.get("/runs/{run_id}")
def run_detail(run_id: str):
    run = get_run(run_id)
    if run is not None:
        return run.detail()
    saved = config.RUNS_DIR / run_id / "run.json"
    if saved.is_file():  # finished before the last core restart: read-only
        return {**json.loads(saved.read_text(encoding="utf-8")), "archived": True}
    raise HTTPException(404, f"no run {run_id}")


@app.get("/runs/{run_id}/diff")
def run_diff(run_id: str):
    return {"diff": orch.agent_diff(_run(run_id))}


class Confirm(BaseModel):
    claims: list[dict]
    scope: list[str]
    probe_entry: str | None = None
    happy_input: str | None = None
    by: str = "web"


@app.post("/runs/{run_id}/claims/confirm")
async def confirm(run_id: str, body: Confirm):
    run = _run(run_id)
    await _call(orch.confirm_claims(run, body.claims, body.scope, body.probe_entry, body.happy_input, body.by))
    return {"ok": True}


class DecisionBody(BaseModel):
    which: str
    decision: str
    text: str | None = None
    by: str = "web"


@app.post("/runs/{run_id}/decision")
async def decision(run_id: str, body: DecisionBody):
    await _call(orch.decision(_run(run_id), body.which, body.decision, body.text, body.by))
    return {"ok": True}


class SaveRecording(BaseModel):
    name: str
    title: str | None = None


@app.post("/runs/{run_id}/save-recording")
def save_recording(run_id: str, body: SaveRecording):
    try:
        path = recordings.save(_run(run_id), body.name, body.title)
    except (FileExistsError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    return {"saved": str(path)}


# ------------------------------------------------------------------ n8n -> core (MVP.md §6 n8n payloads)

class GateBody(BaseModel):
    which: str
    resume_url: str | None = None
    reason: str | None = None


@app.post("/runs/{run_id}/gate")
async def gate(run_id: str, body: GateBody):
    run = _run(run_id)
    if body.which == "pause":
        await orch.pause(run, body.reason or "scope_violation", body.resume_url)
    elif body.which == "approve":
        await orch.open_approve(run, body.resume_url)
    elif body.which == "intent":
        await orch.set_gate(run, "intent", body.resume_url)
    else:
        raise HTTPException(400, f"unknown gate {body.which}")
    return {"ok": True}


@app.post("/runs/{run_id}/start")
async def start(run_id: str):
    await _call(orch.start(_run(run_id)))
    return {"ok": True}


class AgentAction(BaseModel):
    action: str
    text: str | None = None


@app.post("/runs/{run_id}/agent")
async def agent(run_id: str, body: AgentAction):
    await _call(orch.agent_action(_run(run_id), body.action, body.text))
    return {"ok": True}


class FixRequest(BaseModel):
    run_id: str
    verdicts: list[dict] | None = None


@app.post("/agents/fix")
async def fix(body: FixRequest):
    run = _run(body.run_id)
    try:
        result = await orch.propose_fix(run)
    except orch.llm.LLMUnavailable as e:
        raise HTTPException(503, f"Fixer unavailable: {e}") from e
    run.pending_fix = result
    await orch.send(run, {"t": "phase", "phase": "fixing"})
    return {"diff": result["diff"], "rationale": result.get("rationale", "")}


class ApplyBody(BaseModel):
    diff: str
    rationale: str | None = None


@app.post("/runs/{run_id}/apply")
async def apply(run_id: str, body: ApplyBody):
    run = _run(run_id)
    pending = run.pending_fix or {}
    await orch.apply_patch(run, body.diff, body.rationale or pending.get("rationale", ""),
                           pending.get("source", "n8n"))
    return {"ok": True, "iteration": run.iteration}


class FinalBody(BaseModel):
    state: str
    github_pr: str | None = None


@app.post("/runs/{run_id}/final")
async def final(run_id: str, body: FinalBody):
    if body.state not in ("merged", "rejected", "killed", "max_iterations"):
        raise HTTPException(400, f"unknown final state {body.state}")
    await orch.finish(_run(run_id), body.state, body.github_pr)
    return {"ok": True}


# ------------------------------------------------------------------ websocket

@app.websocket("/ws/runs/{run_id}")
async def ws_route(websocket: WebSocket, run_id: str):
    await ws_endpoint(websocket, run_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.env("CORE_HOST", "0.0.0.0"), port=int(config.env("CORE_PORT", "8000")))
