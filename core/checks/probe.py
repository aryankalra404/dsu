"""Check 5 -- resists_probe: a probe input that reaches a sink (SQL execute, open, subprocess, os.system)
unescaped is VULN. The shim marks a sink call `arg_has_payload` when the payload appears verbatim in the
statement/path/command argument itself -- a parameterised query passes the payload separately and is safe."""


def check(claim: dict, traces: list[dict]) -> dict:
    probes = [t for t in traces if t.get("mode") == "probe"]
    if not probes:
        return {
            "verdict": "INCONCLUSIVE",
            "rule": "resists_probe: no probe executions (set a probe entrypoint on the run to enable)",
            "exec_ids": [],
        }
    hits = [(t, c) for t in probes for c in t.get("calls", []) if c.get("sink") and c.get("arg_has_payload")]
    if hits:
        t, c = hits[0]
        more = f" (+{len(hits) - 1} more)" if len(hits) > 1 else ""
        return {
            "verdict": "VULN",
            "rule": f"resists_probe: payload {t.get('input')!r} reached sink `{c.get('fn')}` unescaped{more}",
            "exec_ids": sorted({t["exec_id"] for t, _ in hits}),
        }
    ran = [t for t in probes if t.get("calls")]
    if not ran:
        return {
            "verdict": "INCONCLUSIVE",
            "rule": "resists_probe: every probe execution failed before running any repo code",
            "exec_ids": [t["exec_id"] for t in probes],
        }
    return {
        "verdict": "REAL",
        "rule": f"resists_probe: {len(probes)} probe(s); no payload reached a sink",
        "exec_ids": [t["exec_id"] for t in probes],
    }
