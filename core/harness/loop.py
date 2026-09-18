import json
import os
from pathlib import Path
from urllib.parse import urlparse

from openai import OpenAI

from harness.agent import TOOLS, execute_tool, load_system_prompt
from harness.control import Killed, RunControl
from harness.trajectory import TrajectoryRecorder

MAX_TURNS = 60
FIXTURE_RUNS = Path(__file__).resolve().parent.parent / "fixtures" / "runs"
IGNORED_DIRS = {".git", "__pycache__", ".pytest_cache", ".ruff_cache", ".venv"}


def _list_repo_files(workdir: Path) -> list[str]:
    return sorted(
        str(p.relative_to(workdir))
        for p in workdir.rglob("*")
        if p.is_file() and not IGNORED_DIRS.intersection(p.parts)
    )


def _transcript_turns(run_name: str) -> list[dict]:
    """USE_LLM=false replays a recorded transcript rather than calling the API
    (plans/core-H4.md item 6). The stand-in lives in core/fixtures/, not in code
    (CLAUDE.md: fixtures, not mocks-in-code)."""
    messages = json.loads((FIXTURE_RUNS / run_name / "transcript.json").read_text())
    turns = []
    for message in messages:
        if message.get("role") != "assistant":
            continue
        tool_calls = message.get("tool_calls")
        if not tool_calls:
            turns.append({"content": message.get("content") or ""})
            continue
        turns.append(
            {
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "name": tc["function"]["name"],
                        "arguments": json.loads(tc["function"]["arguments"]),
                    }
                    for tc in tool_calls
                ]
            }
        )
    return turns


def _call_llm(client, model, messages) -> dict:
    response = client.chat.completions.create(model=model, messages=messages, tools=TOOLS, tool_choice="auto")
    message = response.choices[0].message
    if not message.tool_calls:
        return {"content": message.content}
    return {
        "tool_calls": [
            {"id": tc.id, "name": tc.function.name, "arguments": json.loads(tc.function.arguments)}
            for tc in message.tool_calls
        ]
    }


def _tool_call_to_event_fields(name: str, args: dict, result: str) -> dict | None:
    if name == "read_file":
        return {"kind": "read", "path": args["path"]}
    if name == "write_file":
        return {"kind": "write", "path": args["path"], "content": args["content"]}
    if name == "run_cmd":
        first_line = result.split("\n", 1)[0]
        # a rejected (non-allowlisted) command never ran, so there's no real exit
        # code -- report failure rather than crash trying to parse the error text.
        exit_code = int(first_line.removeprefix("exit=")) if first_line.startswith("exit=") else 1
        return {"kind": "cmd", "cmd": args["cmd"], "exit": exit_code}
    if name == "http_get":
        status_line = result.split("\n", 1)[0]
        status = None if status_line.startswith("error") else int(status_line.removeprefix("status="))
        return {"kind": "http", "host": urlparse(args["url"]).hostname or "", "status": status}
    if name == "done":
        return {"kind": "done", "summary": args["summary"]}
    return None


async def run_agent(
    run_id: str,
    workdir: Path,
    runs_dir: Path,
    control: RunControl | None = None,
    replay_run: str | None = None,
) -> list[dict]:
    control = control or RunControl()
    use_llm = os.getenv("USE_LLM", "false").lower() == "true"
    model = os.getenv("OPENAI_MODEL", "gpt-4.1")
    client = OpenAI() if use_llm else None
    replay_run = replay_run or os.getenv("REPLAY_RUN", "clean")

    recorder = TrajectoryRecorder(run_id, runs_dir)
    # System prompt is the intent verbatim (MVP.md §3/§4); the file tree goes in a
    # separate user message so the agent knows what's actually there -- without it,
    # read_file/run_cmd are the only way to discover the repo and the agent has
    # no way to *find* files to read in the first place. Observed live: without
    # this, the model assumed a Next.js/TypeScript stack for our Python fixture
    # and wrote nonsensical .tsx/package.json files (all "in scope" by path, just
    # wrong).
    file_tree = "\n".join(_list_repo_files(workdir))
    messages = [
        {"role": "system", "content": load_system_prompt(workdir)},
        {"role": "user", "content": f"Repo file tree:\n{file_tree}"},
    ]
    replay = iter(_transcript_turns(replay_run)) if not use_llm else None

    for _ in range(MAX_TURNS):
        turn = _call_llm(client, model, messages) if use_llm else next(replay, {"content": ""})

        if not turn.get("tool_calls"):
            content = turn.get("content") or ""
            messages.append({"role": "assistant", "content": content})
            # The model sometimes considers itself finished and replies with plain
            # text instead of calling `done` -- every recorded trajectory (and every
            # client that draws the story) expects to end on a done event, so
            # synthesize one from the final text rather than silently dropping it.
            await recorder.record("done", summary=content)
            (runs_dir / run_id / "transcript.json").write_text(json.dumps(messages, indent=2))
            break

        messages.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])},
                    }
                    for tc in turn["tool_calls"]
                ],
            }
        )

        done_called = False
        for tool_call in turn["tool_calls"]:
            await control.gate_event.wait()
            if control.killed:
                raise Killed()
            if control.steer_text:
                messages.append({"role": "user", "content": control.steer_text})
                control.steer_text = None

            name, args = tool_call["name"], tool_call["arguments"]
            result = execute_tool(name, args, workdir)
            messages.append({"role": "tool", "tool_call_id": tool_call["id"], "content": result})

            event_fields = _tool_call_to_event_fields(name, args, result)
            if event_fields is not None:
                await recorder.record(**event_fields)

            if name == "done":
                done_called = True

        (runs_dir / run_id / "transcript.json").write_text(json.dumps(messages, indent=2))

        if done_called:
            break

    return messages
