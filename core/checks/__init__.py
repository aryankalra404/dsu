"""The engine (MVP.md §5). Pure, deterministic rules over the trajectory and sandbox traces.
Nothing in this package may import an LLM SDK -- tests/test_no_llm_in_engine.py enforces it."""

from checks.verdicts import compute_verdicts

__all__ = ["compute_verdicts"]
