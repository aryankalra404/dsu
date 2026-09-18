"""Check 3 -- fetches_external: zero requests to the claimed target across all sandbox executions is FAKE."""


def host_matches(host: str, target: str | None) -> bool:
    if not target:
        return True
    h, t = (host or "").lower(), target.lower().strip()
    if "://" in t:
        t = t.split("://", 1)[1]
    t = t.split("/", 1)[0]
    return h == t or h.endswith("." + t) or t in h


def check(claim: dict, traces: list[dict]) -> dict:
    execs = [t for t in traces if t.get("mode") in ("happy", "chaos", "differential")]
    if not execs:
        return {"verdict": "INCONCLUSIVE", "rule": "fetches_external: no sandbox executions ran", "exec_ids": []}
    target = claim.get("target")
    label = target or "any external host"
    hits = [(t["exec_id"], h) for t in execs for h in t.get("http", []) if host_matches(h.get("host", ""), target)]
    if not hits:
        return {
            "verdict": "FAKE",
            "rule": f"fetches_external: 0 requests to {label} across {len(execs)} execution(s)",
            "exec_ids": [t["exec_id"] for t in execs],
            "http_count": 0,
        }
    return {
        "verdict": "REAL",
        "rule": f"fetches_external: {len(hits)} request(s) to {label} across {len(execs)} execution(s)",
        "exec_ids": sorted({e for e, _ in hits}),
        "http_count": len(hits),
    }
