import asyncio
import os
import shutil
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from harness.control import Killed, RunControl
from harness.loop import run_agent
from scene.layout import compute_scene_graph
from scene.state import RunState, get_run, put_run
from ws import broadcast, ws_endpoint

load_dotenv()

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "repo_schemes"
RUNS_DIR = Path(__file__).resolve().parent / "fixtures" / "runs"
RUN_CONTROLS: dict[str, RunControl] = {}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _seed_demo_run() -> None:
    graph, scope_nodes = compute_scene_graph()
    put_run("demo", RunState(graph=graph, scope_nodes=scope_nodes))


_seed_demo_run()


def _flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() == "true"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/flags")
def flags():
    return {
        "USE_LLM": _flag("USE_LLM"),
        "USE_N8N": _flag("USE_N8N"),
        "USE_SANDBOX": _flag("USE_SANDBOX"),
        "USE_BEECEPTOR": _flag("USE_BEECEPTOR"),
    }


@app.get("/runs/{run_id}/scene")
def scene(run_id: str):
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"no such run: {run_id}")
    return run.to_dict()


@app.websocket("/ws/runs/{run_id}")
async def ws_route(websocket: WebSocket, run_id: str):
    await ws_endpoint(websocket, run_id)


@app.post("/runs")
async def create_run():
    run_id = uuid.uuid4().hex[:8]
    workdir = RUNS_DIR / run_id / "workdir"
    workdir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(FIXTURE_DIR, workdir, dirs_exist_ok=True)

    graph, scope_nodes = compute_scene_graph()
    put_run(run_id, RunState(graph=graph, scope_nodes=scope_nodes))

    control = RunControl()
    RUN_CONTROLS[run_id] = control
    asyncio.create_task(_execute_run(run_id, workdir, control))

    await broadcast(run_id, {"t": "run_created", "run": {"run_id": run_id}})
    return {"run_id": run_id}


async def _execute_run(run_id: str, workdir: Path, control: RunControl) -> None:
    state = get_run(run_id)
    try:
        await run_agent(run_id, workdir, RUNS_DIR, control)
        state.agent["state"] = "done"
        await broadcast(run_id, {"t": "final", "state": "merged"})
    except Killed:
        state.agent["state"] = "killed"
        await broadcast(run_id, {"t": "final", "state": "killed"})
