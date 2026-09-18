import json
import os
from pathlib import Path
from urllib.parse import urlparse

from openai import OpenAI

from harness.agent import TOOLS, execute_tool, load_system_prompt
from harness.control import Killed, RunControl
from harness.trajectory import TrajectoryRecorder

MAX_TURNS = 60


def _canned_turns() -> list[dict]:
    """Deterministic script used when USE_LLM=false, so the loop mechanism can be
    exercised without an API key."""
    return [
        {"tool_calls": [{"id": "c1", "name": "write_file", "arguments": {"path": "features/schemes/__init__.py", "content": ""}}]},
        {"tool_calls": [{"id": "c2", "name": "read_file", "arguments": {"path": "features/schemes/__init__.py"}}]},
        {"tool_calls": [{"id": "c3", "name": "run_cmd", "arguments": {"cmd": "pytest -q"}}]},
        {"tool_calls": [{"id": "c4", "name": "done", "arguments": {"summary": "canned replay: created features/schemes/__init__.py"}}]},
    ]


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
        exit_code = int(result.split("\n", 1)[0].removeprefix("exit="))
        return {"kind": "cmd", "cmd": args["cmd"], "exit": exit_code}
    if name == "http_get":
        status_line = result.split("\n", 1)[0]
        status = None if status_line.startswith("error") else int(status_line.removeprefix("status="))
        return {"kind": "http", "host": urlparse(args["url"]).hostname or "", "status": status}
    if name == "done":
        return {"kind": "done", "summary": args["summary"]}
    return None


async def run_agent(
    run_id: str, workdir: Path, runs_dir: Path, control: RunControl | None = None
) -> list[dict]:
    control = control or RunControl()
    use_llm = os.getenv("USE_LLM", "false").lower() == "true"
    model = os.getenv("OPENAI_MODEL", "gpt-4.1")
    client = OpenAI() if use_llm else None

    recorder = TrajectoryRecorder(run_id, runs_dir)
    messages = [{"role": "system", "content": load_system_prompt()}]
    canned = iter(_canned_turns()) if not use_llm else None

    for _ in range(MAX_TURNS):
        turn = _call_llm(client, model, messages) if use_llm else next(canned, {"content": ""})

        if not turn.get("tool_calls"):
            messages.append({"role": "assistant", "content": turn.get("content", "")})
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
