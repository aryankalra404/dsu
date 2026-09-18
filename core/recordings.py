"""Recorded runs that USE_LLM=false replays through the real harness (MVP.md §0.6). A recording is a folder:

  meta.json          {"title", "repo" (path, relative to the folder or absolute), "intent", "scope"?, "claims"?,
                      "probe_entry"?, "recorded_with"?}
  transcript.json    the full tool-calling conversation (assistant turns are replayed; tools really execute)
  trajectory.jsonl   the recorded events -- only their ts_ms is used, to pace the replay like the real run
  repo/              optional pristine copy of the repo (used when meta.repo is absent)
  fixer_iter{N}.json optional recorded Fixer outputs {"diff", "rationale"}

Any live run can be saved as a recording (POST /runs/{id}/save-recording)."""

import json
import re
import shutil
from pathlib import Path

import config


def _dir(name: str) -> Path:
    if not re.fullmatch(r"[\w.-]+", name or ""):
        raise ValueError(f"bad recording name: {name!r}")
    return config.RECORDINGS_DIR / name


def load_meta(name: str) -> dict:
    d = _dir(name)
    f = d / "meta.json"
    if not f.is_file():
        raise FileNotFoundError(f"no recording named {name!r}")
    meta = json.loads(f.read_text(encoding="utf-8"))
    repo = meta.get("repo")
    repo_path = (d / repo).resolve() if repo and not Path(repo).is_absolute() else Path(repo) if repo else d / "repo"
    return {**meta, "name": name, "dir": d, "repo_path": repo_path}


def list_recordings() -> list[dict]:
    out = []
    if not config.RECORDINGS_DIR.is_dir():
        return out
    for d in sorted(config.RECORDINGS_DIR.iterdir()):
        if (d / "meta.json").is_file() and (d / "transcript.json").is_file():
            m = load_meta(d.name)
            out.append({"name": d.name, "title": m.get("title", d.name), "intent": m.get("intent", ""),
                        "repo": str(m["repo_path"]), "recorded_with": m.get("recorded_with"),
                        "scope": m.get("scope", []), "probe_entry": m.get("probe_entry")})
    return out


def turns(name: str) -> list[dict]:
    """Assistant turns of the recorded transcript, in order."""
    messages = json.loads((_dir(name) / "transcript.json").read_text(encoding="utf-8"))
    out = []
    for m in messages:
        if m.get("role") != "assistant":
            continue
        calls = m.get("tool_calls") or []
        if not calls:
            out.append({"content": m.get("content") or ""})
            continue
        out.append({"content": m.get("content"), "tool_calls": [
            {"id": tc["id"], "name": tc["function"]["name"], "arguments": json.loads(tc["function"]["arguments"] or "{}")}
            for tc in calls]})
    return out


def pacing(name: str) -> list[int]:
    """ts_ms of each recorded event; event i corresponds to tool call i."""
    f = _dir(name) / "trajectory.jsonl"
    if not f.is_file():
        return []
    return [json.loads(line)["ts_ms"] for line in f.read_text(encoding="utf-8").splitlines() if line.strip()]


def save(run, name: str, title: str | None = None) -> Path:
    d = _dir(name)
    if d.exists():
        raise FileExistsError(f"recording {name!r} already exists")
    d.mkdir(parents=True)
    shutil.copytree(run.dir / "original", d / "repo")
    for f in ("transcript.json", "trajectory.jsonl"):
        if (run.dir / f).is_file():
            shutil.copy2(run.dir / f, d / f)
    for i, p in enumerate(run.patches, 1):
        if p.get("source") == "llm":
            (d / f"fixer_iter{i}.json").write_text(json.dumps({"diff": p["diff"], "rationale": p["rationale"]}),
                                                   encoding="utf-8")
    meta = {"title": title or name, "intent": run.intent, "scope": run.scope,
            "claims": [c for c in run.claims if c.get("source") in ("llm", "human", "rules", "auto")],
            "probe_entry": run.probe_entry, "recorded_with": config.OPENAI_MODEL if not run.replay else None}
    (d / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return d
