"""SQLite audit log (MVP.md §7 audit row, §9 /history): one row per run, upserted on every phase change."""

import json
import sqlite3
import time

import config

SCHEMA = """CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, created_at REAL, updated_at REAL, repo TEXT, intent TEXT, replay TEXT,
  phase TEXT, final TEXT, iteration INTEGER, claims TEXT, verdicts TEXT, pauses TEXT, decisions TEXT
)"""


def _conn() -> sqlite3.Connection:
    config.AUDIT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.AUDIT_DB)
    conn.execute(SCHEMA)
    return conn


def upsert(run) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (run.id, run.created_at, time.time(), run.repo, run.intent, run.replay, run.phase, run.final,
             run.iteration, json.dumps(run.claims), json.dumps(run.verdicts), json.dumps(run.pauses),
             json.dumps(run.decisions)),
        )


def list_runs(limit: int = 100) -> list[dict]:
    with _conn() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        for k in ("claims", "verdicts", "pauses", "decisions"):
            d[k] = json.loads(d[k] or "[]")
        out.append(d)
    return out
