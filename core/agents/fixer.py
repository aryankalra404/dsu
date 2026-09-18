"""The Fixer (MVP.md §11): same SDK and loop as the agent-under-watch. Input: the failing verdicts + evidence +
hints. It edits a scratch copy of the repo with read_file / write_file and ends with propose_patch(rationale);
the core then computes the unified diff itself (difflib), so the diff always applies cleanly.
A live run's fixes are saved with the run; a replayed recording reuses the fixes recorded with it."""

import json
import shutil
from pathlib import Path

import config
from agents import llm
from diffs import make_diff
from harness.agent import read_file, write_file
from harness.loop import tool_loop
from repo import IGNORED_DIRS

FIXER_TOOLS = [
    {"type": "function", "function": {
        "name": "read_file", "description": "Read a file from the repo.",
        "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {
        "name": "write_file", "description": "Overwrite a file with its full new content.",
        "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                       "required": ["path", "content"]}}},
    {"type": "function", "function": {
        "name": "propose_patch", "description": "Finish: your edits become the patch. Give a <=3 sentence rationale.",
        "parameters": {"type": "object", "properties": {"rationale": {"type": "string"}}, "required": ["rationale"]}}},
]

SYSTEM = """You fix a repository so that failing behavioural checks pass. Each failing check says what was
claimed, the deterministic rule that failed and the evidence. Make the smallest change that makes the claim
true for real (e.g. actually call the API instead of returning hardcoded data; parameterise a SQL query; call
the declared function; write and run tests). Only edit files inside the allowed scope. Then call propose_patch."""


def _brief(intent: str, scope: list[str], claims: list[dict], verdicts: list[dict]) -> str:
    by_id = {c["id"]: c for c in claims}
    failing = [v for v in verdicts if v["verdict"] in ("FAKE", "DEAD", "DRIFT", "VULN")]
    lines = [f"Task: {intent}", f"Allowed scope: {', '.join(scope) or '(none)'}", "", "Failing checks:"]
    for v in failing:
        c = by_id.get(v["claim_id"], {})
        lines.append(f"- [{v['verdict']}] claim: {c.get('text')!r} (type {c.get('type')}, target {c.get('target')})")
        lines.append(f"  rule: {v['rule']}")
        for h in v.get("hints", []):
            lines.append(f"  hint: {h['kind']} {h['file']}:{h['line']} {h['msg']}")
    return "\n".join(lines)


async def propose_fix(workdir: Path, scratch: Path, intent: str, scope: list[str], claims: list[dict],
                      verdicts: list[dict], files: list[str]) -> dict:
    """Returns {"diff", "rationale"}; raises llm.LLMUnavailable when USE_LLM=false."""
    llm.client()  # fail fast if the LLM is unavailable
    if scratch.exists():
        shutil.rmtree(scratch)
    shutil.copytree(workdir, scratch, ignore=lambda _d, names: {n for n in names if n in IGNORED_DIRS})

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": _brief(intent, scope, claims, verdicts) + "\n\nRepo file tree:\n" + "\n".join(files[:400])},
    ]

    async def execute(tc: dict) -> tuple[str, bool]:
        a = tc["arguments"]
        if tc["name"] == "read_file":
            return read_file(scratch, a.get("path", "")), False
        if tc["name"] == "write_file":
            return write_file(scratch, a.get("path", ""), a.get("content", "")), False
        if tc["name"] == "propose_patch":
            return "ok", True
        return f"error: unknown tool {tc['name']}", False

    async def no_gate() -> list[str]:
        return []

    rationale = await tool_loop(
        messages=messages,
        next_turn=lambda m: llm.chat_turn(m, FIXER_TOOLS),
        execute=execute,
        checkpoint=no_gate,
        max_turns=config.MAX_AGENT_TURNS,
    )
    return {"diff": make_diff(workdir, scratch), "rationale": (rationale or "").strip()[:600]}


def cached_fix(recording_dir: Path | None, iteration: int) -> dict | None:
    if recording_dir is None:
        return None
    f = recording_dir / f"fixer_iter{iteration}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else None
