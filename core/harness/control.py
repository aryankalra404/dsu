"""Per-run gate the harness checks before every tool call (MVP.md §4 data flow, step 5a)."""

import asyncio


class Killed(Exception):
    pass


class RunControl:
    def __init__(self) -> None:
        self.gate_event = asyncio.Event()
        self.gate_event.set()  # open by default
        self.steer_texts: list[str] = []
        self.killed = False

    @property
    def paused(self) -> bool:
        return not self.gate_event.is_set()

    def pause(self) -> None:
        self.gate_event.clear()

    def resume(self) -> None:
        self.gate_event.set()

    def steer(self, text: str) -> None:
        if text.strip():
            self.steer_texts.append(text.strip())
        self.resume()

    def kill(self) -> None:
        self.killed = True
        self.resume()

    async def checkpoint(self) -> list[str]:
        """Block while paused; raise if killed; return steer messages to inject as user turns."""
        await self.gate_event.wait()
        if self.killed:
            raise Killed()
        texts, self.steer_texts = self.steer_texts, []
        return texts
