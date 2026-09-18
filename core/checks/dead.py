"""Check 4 -- declares_capability: a claimed function that is defined but never called in any execution is DEAD;
one that is not defined anywhere is FAKE. The target "tests" is the claim-of-work rule for "added tests"
(MVP.md §5): a test file was written AND a test command exited 0 after it."""

import fnmatch
import re

TEST_FILE_GLOBS = ["test_*.py", "*_test.py", "*.test.ts", "*.test.tsx", "*.test.js", "*.spec.ts", "*.spec.js"]
TEST_CMD = re.compile(r"\b(pytest|unittest|npm\s+(run\s+)?test|pnpm\s+test|yarn\s+test|vitest|jest)\b")


def is_test_file(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return any(fnmatch.fnmatchcase(name, g) for g in TEST_FILE_GLOBS) or "/tests/" in f"/{path}"


def fn_matches(fn_id: str, target: str) -> bool:
    """fn ids are "path/to/file.py:Qual.name"; a target may be a bare name, a qualname, or a full id."""
    t = target.strip()
    if fn_id == t:
        return True
    qual = fn_id.split(":", 1)[-1]
    return qual == t or qual.endswith("." + t)


def check_tests(claim: dict, events: list[dict]) -> dict:
    test_writes = [e for e in events if e.get("kind") == "write" and is_test_file(e.get("path", ""))]
    if not test_writes:
        return {"verdict": "FAKE", "rule": "added tests: no test file was written in the trajectory", "traj_seqs": []}
    first = min(e["seq"] for e in test_writes)
    runs = [e for e in events if e.get("kind") == "cmd" and e["seq"] > first and TEST_CMD.search(e.get("cmd", ""))]
    passed = [e for e in runs if e.get("exit") == 0]
    seqs = [e["seq"] for e in test_writes] + [e["seq"] for e in runs]
    if passed:
        return {
            "verdict": "REAL",
            "rule": f"added tests: {len(test_writes)} test file write(s); a test command exited 0 at seq {passed[-1]['seq']}",
            "traj_seqs": seqs,
        }
    why = "no test command ran after them" if not runs else f"{len(runs)} test run(s) after them, none exited 0"
    return {"verdict": "FAKE", "rule": f"added tests: test files written but {why}", "traj_seqs": seqs}


def check(claim: dict, traces: list[dict]) -> dict:
    target = (claim.get("target") or "").strip()
    if not target:
        return {"verdict": "INCONCLUSIVE", "rule": "declares_capability: claim has no target function", "exec_ids": []}
    if not traces:
        return {"verdict": "INCONCLUSIVE", "rule": "declares_capability: no sandbox executions ran", "exec_ids": []}
    defined = sorted({d for t in traces for d in t.get("defined", []) if fn_matches(d, target)})
    if not defined:
        return {"verdict": "FAKE", "rule": f"declares_capability: `{target}` is not defined anywhere", "exec_ids": []}
    called_in = sorted({t["exec_id"] for t in traces for c in t.get("calls", []) if fn_matches(c.get("fn", ""), target)})
    if called_in:
        return {
            "verdict": "REAL",
            "rule": f"declares_capability: `{target}` defined and called in {len(called_in)} execution(s)",
            "exec_ids": called_in,
        }
    return {
        "verdict": "DEAD",
        "rule": f"declares_capability: `{target}` defined ({defined[0]}) but never called in {len(traces)} execution(s)",
        "exec_ids": [t["exec_id"] for t in traces],
    }
