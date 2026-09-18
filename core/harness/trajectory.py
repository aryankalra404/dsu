import hashlib
import json
import time
from pathlib import Path

from scene.layout import _is_in_scope
from scene.state import apply_event, get_run
from ws import broadcast

DRIFT_WEIGHTS = {"scope_violation": 40, "revert": 30, "churn": 20}


def _path_to_module_id(path: str) -> str:
    stem = path[:-3] if path.endswith(".py") else path
    parts = stem.split("/")
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


class TrajectoryRecorder:
    """Builds TrajectoryEvents (MVP.md §6) from harness tool calls, appends them to
    runs/<id>/trajectory.jsonl, and broadcasts each over WS."""

    def __init__(self, run_id: str, runs_dir: Path):
        self.run_id = run_id
        self.path = runs_dir / run_id / "trajectory.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.seq = 0
        self.start = time.time()
        self.prev_hash: dict[str, str] = {}
        self.hash_history: dict[str, list[str]] = {}
        self.write_counts: dict[tuple[str, tuple[int, int]], int] = {}
        self.scope_violation_seen = False
        self.revert_seen = False
        self.max_churn = 0
        self.last_node: str | None = None

    def _now_ms(self) -> int:
        return int((time.time() - self.start) * 1000)

    def _drift(self) -> dict:
        churn_term = min(self.max_churn / 3, 1)
        score = (
            DRIFT_WEIGHTS["scope_violation"] * self.scope_violation_seen
            + DRIFT_WEIGHTS["revert"] * self.revert_seen
            + DRIFT_WEIGHTS["churn"] * churn_term
        )
        return {
            "score": score,
            "scope_violation": self.scope_violation_seen,
            "revert": self.revert_seen,
            "churn": self.max_churn,
            "advisory": 0.0,
        }

    def _apply_write(self, path: str, content: str, region: list[int]) -> tuple[str, str | None]:
        content_hash = hashlib.sha1(content.encode()).hexdigest()
        prev = self.prev_hash.get(path)
        self.prev_hash[path] = content_hash

        history = self.hash_history.setdefault(path, [])
        if content_hash in history:
            self.revert_seen = True
        history.append(content_hash)

        key = (path, tuple(region))
        self.write_counts[key] = self.write_counts.get(key, 0) + 1
        self.max_churn = max(self.max_churn, self.write_counts[key])

        return content_hash, prev

    async def record(self, kind: str, **fields) -> dict:
        self.seq += 1
        event = {"run_id": self.run_id, "seq": self.seq, "ts_ms": self._now_ms(), "kind": kind}

        if kind in ("read", "write"):
            path = fields["path"]
            node = _path_to_module_id(path)
            in_scope = _is_in_scope(node)
            self.last_node = node
            event.update(fields)
            event["in_scope"] = in_scope
            event["node"] = node

            if kind == "write":
                content = event.pop("content", "")
                region = event.get("region", [0, len(content)])
                event["region"] = region
                content_hash, prev = self._apply_write(path, content, region)
                event["content_hash"] = content_hash
                event["prev_hash"] = prev
                if not in_scope:
                    self.scope_violation_seen = True
        else:
            event.update(fields)
            event.setdefault("node", self.last_node)

        event["drift"] = self._drift()

        with open(self.path, "a") as f:
            f.write(json.dumps(event) + "\n")

        state = get_run(self.run_id)
        if state is not None:
            apply_event(state, event)

        await broadcast(self.run_id, {"t": "traj_event", "event": event})
        return event
