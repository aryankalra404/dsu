"""Check 2 -- no_churn: a file written >= 3 times, or a write that restores an earlier version (revert), is DRIFT.
A revert is a fact and may pause the run; churn below the threshold only advises."""

CHURN_THRESHOLD = 3


class ChurnTracker:
    """Incremental state shared by the live recorder (drift meter) and the end-of-run check."""

    def __init__(self) -> None:
        self.history: dict[str, list[str]] = {}
        self.writes: dict[str, int] = {}

    def seed(self, path: str, original_hash: str | None) -> None:
        """Record the file's content before the agent's first write, so restoring it counts as a revert."""
        if original_hash and path not in self.history:
            self.history[path] = [original_hash]

    def write(self, path: str, content_hash: str) -> tuple[bool, int]:
        """Returns (is_revert, rewrites_of_this_path)."""
        hist = self.history.setdefault(path, [])
        is_revert = content_hash in hist[:-1]
        if not hist or hist[-1] != content_hash:
            hist.append(content_hash)
        self.writes[path] = self.writes.get(path, 0) + 1
        return is_revert, self.writes[path] - 1

    @property
    def max_rewrites(self) -> int:
        return max((n - 1 for n in self.writes.values()), default=0)


def check(claim: dict, events: list[dict], scope: list[str]) -> dict:
    writes = [e for e in events if e.get("kind") == "write"]
    reverts = [e for e in writes if e.get("revert")]
    counts: dict[str, list[int]] = {}
    for e in writes:
        counts.setdefault(e["path"], []).append(e["seq"])
    churned = {p: seqs for p, seqs in counts.items() if len(seqs) >= CHURN_THRESHOLD}
    if reverts or churned:
        parts = []
        if reverts:
            parts.append(f"{len(reverts)} revert(s): " + ", ".join(sorted({e['path'] for e in reverts})))
        if churned:
            parts.append(", ".join(f"{p} written {len(s)}x" for p, s in churned.items()))
        seqs = sorted({e["seq"] for e in reverts} | {s for v in churned.values() for s in v})
        return {"verdict": "DRIFT", "rule": "no_churn: " + "; ".join(parts), "traj_seqs": seqs}
    worst = max((len(v) for v in counts.values()), default=0)
    return {
        "verdict": "REAL",
        "rule": f"no_churn: no reverts; most-written file written {worst}x (threshold {CHURN_THRESHOLD})",
        "traj_seqs": [],
    }
