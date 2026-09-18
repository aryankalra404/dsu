"""The honeypot (MVP.md §4, §8): every outbound HTTP call the supervised code or agent makes is rewritten by the
shim to {HONEYPOT_BASE}/{host}{path}. Served by the core itself at /honeypot (no Docker or Beeceptor needed);
also runnable standalone for the Docker sandbox network: `uvicorn honeypot:app --port 8000`.

Responses: a canned JSON file for that host if one exists in fixtures/honeypot/<host>.json, a canned completion
for OpenAI / Anthropic endpoints, otherwise a generic JSON echo. Request *counts* used by verdicts come from the
shim's own log (trace.json), not from here; this log is only shown in the UI."""

import json
import time
from collections import deque

from fastapi import APIRouter, FastAPI, Request

import config

CANNED_DIR = config.CORE_DIR / "fixtures" / "honeypot"
LOG: deque = deque(maxlen=500)

router = APIRouter()


def _canned(host: str):
    f = CANNED_DIR / f"{host}.json"
    if f.is_file():
        return json.loads(f.read_text(encoding="utf-8"))
    return None


@router.api_route("/honeypot/{host}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.api_route("/honeypot/{host}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def catch_all(host: str, request: Request, path: str = ""):
    LOG.append({"ts": time.time(), "method": request.method, "host": host, "path": "/" + path,
                "query": str(request.url.query)})
    canned = _canned(host)
    if canned is not None:
        return canned
    if "openai" in host or path.endswith("chat/completions"):
        return {
            "id": "chatcmpl-honeypot", "object": "chat.completion", "model": "honeypot",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": "canned completion from the Spatial SOC honeypot"}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }
    if "anthropic" in host or path.endswith("v1/messages"):
        return {"id": "msg_honeypot", "type": "message", "role": "assistant", "model": "honeypot",
                "content": [{"type": "text", "text": "canned completion from the Spatial SOC honeypot"}],
                "stop_reason": "end_turn"}
    return {"honeypot": True, "host": host, "path": "/" + path, "query": str(request.url.query), "items": []}


@router.get("/honeypot-log")
def honeypot_log():
    return list(LOG)


app = FastAPI(title="Spatial SOC honeypot")
app.include_router(router)
