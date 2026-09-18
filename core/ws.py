import time
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect

CONNECTIONS: dict[str, set[WebSocket]] = defaultdict(set)
LAST_CURSORS: dict[str, dict[str, dict]] = defaultdict(dict)
_last_cursor_sent: dict[str, float] = defaultdict(float)
CURSOR_MIN_INTERVAL_S = 1 / 20


async def broadcast(run_id: str, msg: dict) -> None:
    dead = []
    for ws in CONNECTIONS[run_id]:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CONNECTIONS[run_id].discard(ws)


async def _handle_cursor(run_id: str, msg: dict) -> None:
    client = msg.get("client")
    if not client:
        return
    LAST_CURSORS[run_id][client] = {k: v for k, v in msg.items() if k != "t"}
    now = time.monotonic()
    if now - _last_cursor_sent[run_id] < CURSOR_MIN_INTERVAL_S:
        return
    _last_cursor_sent[run_id] = now
    await broadcast(run_id, {"t": "cursors", "items": list(LAST_CURSORS[run_id].values())})


async def _handle_upstream(run_id: str, msg: dict) -> None:
    t = msg.get("t")
    if t == "cursor":
        await _handle_cursor(run_id, msg)
    elif t in ("select", "scrub"):
        await broadcast(run_id, msg)
    # unknown t: ignored, never fatal (MVP.md §6)


async def ws_endpoint(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    CONNECTIONS[run_id].add(websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_upstream(run_id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        CONNECTIONS[run_id].discard(websocket)
