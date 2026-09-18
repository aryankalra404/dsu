import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scene.layout import compute_scene_graph
from scene.state import RunState, get_run, put_run

load_dotenv()

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
