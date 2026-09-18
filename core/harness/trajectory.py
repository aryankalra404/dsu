"""TrajectoryEvent recorder (MVP.md §6) and the live drift score (MVP.md §5). No LLM imports here --
tests/test_no_llm_in_engine.py enforces it. Every pause must be recomputable from trajectory.jsonl alone."""

import hashlib
import json
import time
from collections.abc import Awaitable, Callable
from pathlib import Path

from checks.churn import CHURN_THRESHOLD, ChurnTracker
from checks.scope import path_in_scope

W_SCOPE, W_REVERT, W_CHURN, W_ADVISORY = 40, 30, 20, 10


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class TrajectoryRecorder:
    def __init__(
        self,
        run_id: str,
        out_path: Path,
        scope: list[str],
        on_event: Callable[[dict], Awaitable[None]] | None = None,
        prepare: Callable[[dict], None] | None = None,
    ):
        self.run_id = run_id
        self.out_path = out_path
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.scope = scope
        self.on_event = on_event
        self.prepare = prepare
        self.seq = 0
        self.start = time.monotonic()
        self.churn = ChurnTracker()
        self.scope_violation_seen = False
        self.revert_seen = False
        self.reads = 0
        self.reads_outside = 0
        self.last_node: str | None = None

    def drift(self) -> dict:
        advisory = round(self.reads_outside / self.reads, 1) if self.reads else 0.0
        churn = self.churn.max_rewrites
        score = (
            W_SCOPE * self.scope_violation_seen
            + W_REVERT * self.revert_seen
            + W_CHURN * min(churn / CHURN_THRESHOLD, 1)
            + W_ADVISORY * advisory
        )
        return {
            "score": round(score, 1),
            "scope_violation": self.scope_violation_seen,
            "revert": self.revert_seen,
            "churn": churn,
            "advisory": advisory,
        }

    async def record(self, kind: str, **fields) -> dict:
        self.seq += 1
        event: dict = {"run_id": self.run_id, "seq": self.seq, "ts_ms": int((time.monotonic() - self.start) * 1000),
                       "kind": kind}
        before_hash = fields.pop("before_hash", None)
        content = fields.pop("content", None)
        event.update({k: v for k, v in fields.items() if v is not None})

        if kind in ("read", "write"):
            path = event["path"]
            in_scope = path_in_scope(path, self.scope)
            event["in_scope"] = in_scope
            event["node"] = path
            if kind == "read":
                self.reads += 1
                self.reads_outside += 0 if in_scope else 1
            else:
                text = content or ""
                event["content_hash"] = sha1(text)
                event["prev_hash"] = before_hash
                event["region"] = [1, max(1, text.count("\n") + 1)]
                self.churn.seed(path, before_hash)
                is_revert, _ = self.churn.write(path, event["content_hash"])
                event["revert"] = is_revert
                if is_revert:
                    self.revert_seen = True
                if not in_scope:
                    self.scope_violation_seen = True
                event["fact"] = "scope_violation" if not in_scope else ("revert" if is_revert else None)
        elif self.last_node:
            event.setdefault("node", self.last_node)

        if self.prepare:
            self.prepare(event)
        if event.get("node"):
            self.last_node = event["node"]
        event["drift"] = self.drift()

        with open(self.out_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
        if self.on_event:
            await self.on_event(event)
        return event
