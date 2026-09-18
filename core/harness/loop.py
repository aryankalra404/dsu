"""The one hand-written function-calling loop (MVP.md §11), shared by the agent-under-watch and the Fixer.
No framework: send messages -> execute each tool call (gate check first) -> append tool results -> repeat;
stop on a stop-tool or a plain assistant message."""

import json
from collections.abc import Awaitable, Callable

Turn = dict  # {"content": str | None, "tool_calls": [{"id", "name", "arguments": dict}]}

INTERVENED = "not executed: the human supervisor intervened before this call; read the next user message"


def assistant_message(turn: Turn) -> dict:
    if not turn.get("tool_calls"):
        return {"role": "assistant", "content": turn.get("content") or ""}
    return {
        "role": "assistant",
        "content": turn.get("content"),
        "tool_calls": [
            {"id": tc["id"], "type": "function",
             "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])}}
            for tc in turn["tool_calls"]
        ],
    }


async def tool_loop(
    *,
    messages: list[dict],
    next_turn: Callable[[list[dict]], Awaitable[Turn | None]],
    execute: Callable[[dict], Awaitable[tuple[str, bool]]],
    checkpoint: Callable[[], Awaitable[list[str]]],
    max_turns: int,
    on_turn: Callable[[list[dict]], None] | None = None,
) -> str | None:
    """Returns the final assistant text (a stop-tool's summary or a plain reply), or None if turns ran out.
    `execute(tool_call) -> (result, stop)`; `checkpoint()` blocks while paused, raises Killed, returns steers."""
    for _ in range(max_turns):
        turn = await next_turn(messages)
        if turn is None:
            return None
        messages.append(assistant_message(turn))
        if not turn.get("tool_calls"):
            if on_turn:
                on_turn(messages)
            return turn.get("content") or ""

        steers: list[str] = []
        final: str | None = None
        for tc in turn["tool_calls"]:
            if steers or final is not None:
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": INTERVENED})
                continue
            steers = await checkpoint()
            if steers:
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": INTERVENED})
                continue
            result, stop = await execute(tc)
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
            if stop:
                final = tc["arguments"].get("summary") or tc["arguments"].get("rationale") or ""
        for text in steers:
            messages.append({"role": "user", "content": text})
        if on_turn:
            on_turn(messages)
        if final is not None:
            return final
    return None
