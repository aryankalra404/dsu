"""Diffs, the tool loop's gate/steer handling, and keyword claim extraction."""

import asyncio

import pytest

from agents.extract import keyword_claims, scope_from_text
from diffs import PatchError, apply_diff, make_diff
from harness.control import Killed, RunControl
from harness.loop import INTERVENED, tool_loop


def test_diff_roundtrip(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    for root in (a, b):
        (root / "pkg").mkdir(parents=True)
    (a / "pkg" / "x.py").write_text("one\ntwo\nthree\nfour\nfive\n")
    (b / "pkg" / "x.py").write_text("one\ntwo\nTHREE\nfour\nfive\nsix\n")
    (b / "pkg" / "new.py").write_text("print('hi')\n")
    (a / "gone.py").write_text("bye\n")
    diff = make_diff(a, b)
    changed = apply_diff(a, diff)
    assert sorted(changed) == ["gone.py", "pkg/new.py", "pkg/x.py"]
    assert (a / "pkg" / "x.py").read_text() == (b / "pkg" / "x.py").read_text()
    assert (a / "pkg" / "new.py").read_text() == "print('hi')\n"
    assert not (a / "gone.py").exists()
    with pytest.raises(PatchError):
        apply_diff(a, diff)  # context no longer matches


def _turns(*turns):
    it = iter(turns)

    async def next_turn(_m):
        return next(it, None)
    return next_turn


def test_loop_injects_steer_and_skips_rest_of_batch():
    control = RunControl()
    ran: list[str] = []

    async def execute(tc):
        ran.append(tc["id"])
        control.steer("stay in scope")  # the supervisor steers right after the first call
        return "ok", False

    messages: list[dict] = []
    final = asyncio.run(tool_loop(
        messages=messages,
        next_turn=_turns(
            {"tool_calls": [{"id": "a", "name": "read_file", "arguments": {}},
                            {"id": "b", "name": "read_file", "arguments": {}}]},
            {"content": "done"}),
        execute=execute, checkpoint=control.checkpoint, max_turns=5))
    assert final == "done"
    assert ran == ["a"]
    tool_b = next(m for m in messages if m.get("tool_call_id") == "b")
    assert tool_b["content"] == INTERVENED
    assert {"role": "user", "content": "stay in scope"} in messages


def test_loop_kill_raises_before_the_call():
    control = RunControl()
    control.kill()

    async def execute(tc):
        raise AssertionError("must not run")

    with pytest.raises(Killed):
        asyncio.run(tool_loop(messages=[], next_turn=_turns({"tool_calls": [{"id": "a", "name": "x", "arguments": {}}]}),
                              execute=execute, checkpoint=control.checkpoint, max_turns=3))


def test_keyword_claims_and_scope():
    intent = ("Add a scheme-finder feature under /features/schemes that calls the live gov schemes API, validates "
              "the user's bio input, and explains eligibility. Add tests. Do not touch anything outside "
              "/features/schemes.")
    assert scope_from_text(intent, []) == ["features/schemes/**"]
    types = [(c["type"], c["target"]) for c in keyword_claims(intent)]
    assert ("fetches_external", None) in types
    assert ("resists_probe", None) in types
    assert ("declares_capability", "tests") in types
    assert ("reasons_on_input", None) in types
    said = keyword_claims("Added tests for parsing. Could not run the test suite.", source="agent")
    assert [c["text"] for c in said] == ["Added tests for parsing"]
