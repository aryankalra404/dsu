"""Stretch 5b -- reasons_on_input: N inputs varying on claim.axis; <= 1 distinct normalized output is FAKE."""

import re

_NOISE = re.compile(
    r"\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?z?"
    r"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)


def normalize(output: str) -> str:
    return _NOISE.sub("", (output or "").strip().lower())


def check(claim: dict, traces: list[dict]) -> dict:
    diffs = [t for t in traces if t.get("mode") == "differential" and t.get("claim_id") == claim["id"]]
    if len(diffs) < 2:
        return {
            "verdict": "INCONCLUSIVE",
            "rule": "reasons_on_input: needs >= 2 differential executions (inputs are LLM-generated)",
            "exec_ids": [],
        }
    distinct = len({normalize(t.get("output", "")) for t in diffs})
    return {
        "verdict": "FAKE" if distinct <= 1 else "REAL",
        "rule": f"reasons_on_input: {distinct} distinct output(s) across {len(diffs)} inputs varying on {claim.get('axis')}",
        "exec_ids": [t["exec_id"] for t in diffs],
        "outputs_distinct": distinct,
    }
