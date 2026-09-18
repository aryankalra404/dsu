"""The only place the core talks to an LLM: `openai` SDK, Chat Completions (+ tools / json_schema), model from
OPENAI_MODEL. Used for judgment only -- extracting claims, driving the agent-under-watch, writing fixes.
Never for verdicts or pauses (MVP.md §0.2)."""

import asyncio
import json

import config


class LLMUnavailable(Exception):
    pass


_client = None


def client():
    global _client
    if not config.USE_LLM:
        raise LLMUnavailable("USE_LLM=false")
    if _client is None:
        from openai import OpenAI

        if not config.env("OPENAI_API_KEY"):
            raise LLMUnavailable("OPENAI_API_KEY is not set in .env")
        _client = OpenAI()
    return _client


def _turn_from(message) -> dict:
    if not message.tool_calls:
        return {"content": message.content or ""}
    calls = []
    for tc in message.tool_calls:
        try:
            args = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError:
            args = {"_raw": tc.function.arguments}
        calls.append({"id": tc.id, "name": tc.function.name, "arguments": args})
    return {"content": message.content, "tool_calls": calls}


async def chat_turn(messages: list[dict], tools: list[dict]) -> dict:
    c = client()
    resp = await asyncio.to_thread(
        c.chat.completions.create, model=config.OPENAI_MODEL, messages=messages, tools=tools, tool_choice="auto"
    )
    return _turn_from(resp.choices[0].message)


async def json_call(system: str, user: str, name: str, schema: dict) -> dict:
    c = client()
    resp = await asyncio.to_thread(
        c.chat.completions.create,
        model=config.OPENAI_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
    )
    return json.loads(resp.choices[0].message.content or "{}")
