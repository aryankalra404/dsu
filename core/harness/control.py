import asyncio


class Killed(Exception):
    pass


class RunControl:
    """Per-run gate the harness checks before every tool call (MVP.md §6 data flow, step 5a)."""

    def __init__(self):
        self.gate_event = asyncio.Event()
        self.gate_event.set()  # open by default
        self.steer_text: str | None = None
        self.killed = False

    def pause(self) -> None:
        self.gate_event.clear()

    def resume(self) -> None:
        self.gate_event.set()

    def steer(self, text: str) -> None:
        self.steer_text = text
        self.resume()

    def kill(self) -> None:
        self.killed = True
        self.resume()
