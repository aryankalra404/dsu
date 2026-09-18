"""The agent's done(summary) -> "What the agent said" claims (MVP.md §4 step 6), plus AST-declared capabilities of
the final repo (MVP.md §5 check 4: "auto from AST of final repo"). Claims only -- verdicts come from checks/."""

import ast
from pathlib import Path

import config
from agents import llm
from agents.extract import CLAIM_TYPES, SCHEMA, keyword_claims
from checks.dead import is_test_file

SYSTEM = """Split a coding agent's final summary into the checkable claims it makes about its own work. Output JSON.
Use only these types: fetches_external (target = hostname it says it calls), declares_capability (target = function
name it says exists and is used; target "tests" if it says it added tests), resists_probe (it says it validates or
sanitises input), reasons_on_input (it says an output depends on an input; axis = that input).
Only claims the summary actually makes. Skip anything it says it could not do. scope: []. probe_entry: null."""

MAX_AST_CLAIMS = 4


async def agent_claims(summary: str) -> tuple[list[dict], str]:
    if not summary.strip():
        return [], "none"
    if config.USE_LLM:
        data = await llm.json_call(SYSTEM, summary, "agent_claims", SCHEMA)
        claims = [{**c, "source": "agent"} for c in data.get("claims", []) if c.get("type") in CLAIM_TYPES]
        return claims, "llm"
    return keyword_claims(summary, source="agent"), "keywords"


def ast_claims(workdir: Path, events: list[dict]) -> list[dict]:
    """Public top-level functions the agent defined in non-test Python files it wrote."""
    out: list[dict] = []
    written = sorted({e["path"] for e in events if e.get("kind") == "write"})
    for rel in written:
        if not rel.endswith(".py") or is_test_file(rel):
            continue
        f = workdir / rel
        if not f.is_file():
            continue
        try:
            tree = ast.parse(f.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
                out.append({"type": "declares_capability", "text": f"`{node.name}` in {rel} is actually used",
                            "target": node.name, "axis": None, "source": "ast"})
                if len(out) >= MAX_AST_CLAIMS:
                    return out
    return out


def merge(existing: list[dict], new: list[dict]) -> list[dict]:
    """Append new claims with fresh ids. An agent claim duplicating another agent claim is skipped; an AST claim
    is skipped if anyone already claimed that function."""
    out = list(existing)

    def key(c: dict) -> tuple[str, str]:
        return c["type"], (c.get("target") or "").lower()

    for c in new:
        dup = any(key(o) == key(c) and (o.get("source") == c["source"] or c["source"] == "ast") for o in out)
        if not dup:
            out.append({"id": next_id(out), "type": c["type"], "text": c["text"], "target": c.get("target"),
                        "axis": c.get("axis"), "source": c["source"], "confirmed": False})
    return out


def next_id(claims: list[dict]) -> str:
    nums = [int(c["id"][1:]) for c in claims if c["id"][1:].isdigit()]
    return f"c{max(nums, default=0) + 1}"
