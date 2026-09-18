"""Authoritative run state (MVP.md §6). The server owns layout, trail, scrub, gate and phase; clients render
`snapshot()` and then apply WS messages. Every run is also persisted to runs/<id>/run.json so history and
evidence survive a core restart."""

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from scene.layout import City

EMPTY_DRIFT = {"score": 0, "scope_violation": False, "revert": False, "churn": 0, "advisory": 0.0}


@dataclass
class Run:
    id: str
    repo: str
    intent: str
    workdir: Path
    dir: Path
    city: City
    replay: str | None = None
    probe_entry: str | None = None
    happy_input: str | None = None
    github_pr: str | None = None
    pending_fix: dict | None = None
    created_at: float = field(default_factory=time.time)
    scope: list = field(default_factory=list)
    claims: list = field(default_factory=list)
    agent: dict = field(default_factory=lambda: {"node": None, "state": "idle", "drift": 0})
    drift: dict = field(default_factory=lambda: dict(EMPTY_DRIFT))
    trail: list = field(default_factory=list)
    events: list = field(default_factory=list)
    gate: dict = field(default_factory=lambda: {"which": None, "resume_url": None, "reason": None})
    # extracting | intent | running | paused | checking | fixing | approve | final | error
    phase: str = "extracting"
    iteration: int = 0
    verdicts: list = field(default_factory=list)
    verdict_history: list = field(default_factory=list)
    traces: list = field(default_factory=list)
    patches: list = field(default_factory=list)
    decisions: list = field(default_factory=list)
    pauses: list = field(default_factory=list)
    cursors: list = field(default_factory=list)
    scrub: int | None = None
    summary: str | None = None
    final: str | None = None
    error: str | None = None
    notes: list = field(default_factory=list)  # honest, user-visible notes about degraded modes

    def note(self, text: str) -> None:
        if text not in self.notes:
            self.notes.append(text)

    def snapshot(self) -> dict:
        return {
            "run_id": self.id,
            "repo": self.repo,
            "intent": self.intent,
            "replay": self.replay,
            "probe_entry": self.probe_entry,
            "happy_input": self.happy_input,
            "github_pr": self.github_pr,
            "phase": self.phase,
            "graph": self.city.graph(),
            "scope": self.scope,
            "scope_nodes": self.city.scope_nodes(),
            "agent": self.agent,
            "drift": self.drift,
            "trail": self.trail,
            "claims": self.claims_with_verdicts(),
            "gate": self.gate,
            "iteration": self.iteration,
            "cursors": self.cursors,
            "scrub": self.scrub,
            "final": self.final,
            "error": self.error,
            "notes": self.notes,
        }

    def claims_with_verdicts(self) -> list[dict]:
        by_claim = {v["claim_id"]: v for v in self.verdicts}
        return [{**c, "verdict": by_claim[c["id"]]} if c["id"] in by_claim else c for c in self.claims]

    def detail(self) -> dict:
        """Everything the evidence / patch / history views need, for a client joining late."""
        return {
            **self.snapshot(),
            "events": self.events,
            "traces": self.traces,
            "verdicts": self.verdicts,
            "verdict_history": self.verdict_history,
            "patches": self.patches,
            "decisions": self.decisions,
            "pauses": self.pauses,
            "summary": self.summary,
            "created_at": self.created_at,
        }

    def apply_event(self, event: dict) -> None:
        self.events.append(event)
        if event.get("node"):
            self.agent["node"] = event["node"]
        if event.get("drift"):
            self.drift = event["drift"]
            self.agent["drift"] = event["drift"]["score"]
        if event["kind"] in ("read", "write", "cmd", "http", "exec"):
            self.trail.append({
                "seq": event["seq"],
                "node": event.get("node"),
                "kind": event["kind"],
                "in_scope": event.get("in_scope", True),
                "revert": bool(event.get("revert")),
            })

    def persist(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "run.json").write_text(json.dumps(self.detail(), default=str), encoding="utf-8")


RUNS: dict[str, Run] = {}


def get_run(run_id: str) -> Run | None:
    return RUNS.get(run_id)


def put_run(run: Run) -> None:
    RUNS[run.id] = run
