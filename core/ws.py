"""WebSocket hub /ws/runs/{run_id} (MVP.md §6). Server -> clients: every run message. Clients -> server: presence
only (cursor | select | scrub). Decisions never travel over WS. Unknown `t` is ignored, never fatal. The server
owns the shared scrub position and the cursor list, so a late joiner gets them in the snapshot."""

import time
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect

from scene.state import get_run

CONNECTIONS: dict[str, set[WebSocket]] = defaultdict(set)
_cursors: dict[str, dict[str, dict]] = defaultdict(dict)
_last_cursor_sent: dict[str, float] = defaultdict(float)
CURSOR_MIN_INTERVAL_S = 1 / 20
CURSOR_TTL_S = 5


async def broadcast(run_id: str, msg: dict) -> None:
    dead = []
    for ws in list(CONNECTIONS[run_id]):
        try:
            await ws.send_json(msg)
        except Exception:  # noqa: BLE001 -- a broken socket must never break the run
            dead.append(ws)
    for ws in dead:
        CONNECTIONS[run_id].discard(ws)


async def _cursor(run_id: str, msg: dict) -> None:
    client = msg.get("client")
    if not client:
        return
    now = time.monotonic()
    _cursors[run_id][client] = {**{k: v for k, v in msg.items() if k != "t"}, "_at": now}
    items = [{k: v for k, v in c.items() if k != "_at"} for c in _cursors[run_id].values() if now - c["_at"] < CURSOR_TTL_S]
    run = get_run(run_id)
    if run:
        run.cursors = items
    if now - _last_cursor_sent[run_id] >= CURSOR_MIN_INTERVAL_S:
        _last_cursor_sent[run_id] = now
        await broadcast(run_id, {"t": "cursors", "items": items})


async def handle_upstream(run_id: str, msg: dict) -> None:
    t = msg.get("t")
    run = get_run(run_id)
    if t == "cursor":
        await _cursor(run_id, msg)
    elif t == "select":
        await broadcast(run_id, {"t": "select", "node": msg.get("node"), "by": msg.get("by", "?")})
    elif t == "scrub":
        seq = msg.get("seq")
        if run:
            run.scrub = seq if isinstance(seq, int) else None
        await broadcast(run_id, {"t": "scrub", "seq": seq, "by": msg.get("by", "?")})


async def ws_endpoint(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    CONNECTIONS[run_id].add(websocket)
    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except ValueError:
                continue  # malformed frame: ignore
            if isinstance(msg, dict):
                await handle_upstream(run_id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        CONNECTIONS[run_id].discard(websocket)
