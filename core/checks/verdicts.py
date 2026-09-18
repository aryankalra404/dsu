"""compute_verdicts: one claim type -> exactly one deterministic rule (MVP.md §5). Recomputable from the
trajectory events + sandbox traces alone. When a type can't be checked, the verdict is INCONCLUSIVE, never a guess."""

from pathlib import Path

from checks import churn, dead, differential, hints, honeypot, probe, scope


def _one(claim: dict, events: list[dict], traces: list[dict], scope_globs: list[str]) -> dict:
    t = claim.get("type")
    if t == "stays_in_scope":
        return scope.check(claim, events, scope_globs)
    if t == "no_churn":
        return churn.check(claim, events, scope_globs)
    if t == "fetches_external":
        return honeypot.check(claim, traces)
    if t == "declares_capability":
        if (claim.get("target") or "").strip().lower() == "tests":
            return dead.check_tests(claim, events)
        return dead.check(claim, traces)
    if t == "resists_probe":
        return probe.check(claim, traces)
    if t == "reasons_on_input":
        return differential.check(claim, traces)
    return {"verdict": "INCONCLUSIVE", "rule": f"unknown claim type: {t}"}


def compute_verdicts(
    claims: list[dict],
    events: list[dict],
    traces: list[dict],
    scope_globs: list[str],
    iteration: int = 0,
    workdir: Path | None = None,
) -> list[dict]:
    all_hints = hints.collect(workdir, events) if workdir else []
    out = []
    for claim in claims:
        r = _one(claim, events, traces, scope_globs)
        out.append({
            "claim_id": claim["id"],
            "verdict": r["verdict"],
            "iteration": iteration,
            "rule": r["rule"],
            "evidence": {
                "exec_ids": r.get("exec_ids", []),
                "http_count": r.get("http_count"),
                "traj_seqs": r.get("traj_seqs", []),
                "outputs_distinct": r.get("outputs_distinct"),
            },
            "hints": hints.attach(claim, r["verdict"], all_hints),
        })
    return out


FAILING = {"FAKE", "DEAD", "DRIFT", "VULN"}


def any_failing(verdicts: list[dict]) -> bool:
    return any(v["verdict"] in FAILING for v in verdicts)
