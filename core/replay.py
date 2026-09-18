import argparse
import asyncio
import json
from pathlib import Path

import uvicorn

from main import app
from scene.state import get_run
from ws import broadcast

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "runs"
DEMO_RUN_ID = "demo"


def _load_events(run_name: str) -> list[dict]:
    path = FIXTURES / run_name / "trajectory.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


LOOP_PAUSE_S = 3


async def _stream_once(events: list[dict], state, speed: float) -> None:
    prev_ts_ms = 0
    for event in events:
        delay_s = max(event["ts_ms"] - prev_ts_ms, 0) / 1000 / speed
        prev_ts_ms = event["ts_ms"]
        await asyncio.sleep(delay_s)

        if event["kind"] in ("read", "write", "cmd", "http", "exec"):
            state.trail.append({"seq": event["seq"], "node": event["node"], "kind": event["kind"]})
        state.agent["node"] = event["node"]
        if "drift" in event:
            state.agent["drift"] = event["drift"]["score"]

        await broadcast(DEMO_RUN_ID, {"t": "traj_event", "event": event})

        if event["kind"] == "done":
            state.agent["state"] = "done"
            await broadcast(DEMO_RUN_ID, {"t": "agent_state", "state": "done", "reason": None})
            await broadcast(DEMO_RUN_ID, {"t": "final", "state": "merged"})


async def _stream(run_name: str, speed: float) -> None:
    """Loops forever so any client connecting at any time sees the demo within one cycle."""
    events = _load_events(run_name)
    state = get_run(DEMO_RUN_ID)

    while True:
        state.trail.clear()
        state.agent["node"] = None
        state.agent["state"] = "running"
        state.agent["drift"] = 0
        await _stream_once(events, state, speed)
        await asyncio.sleep(LOOP_PAUSE_S)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="drifting", choices=["drifting", "clean"])
    parser.add_argument("--speed", type=float, default=4.0)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    @app.on_event("startup")
    async def _start_replay() -> None:
        asyncio.create_task(_stream(args.run, args.speed))

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
