from dataclasses import dataclass, field


@dataclass
class RunState:
    graph: dict
    scope_nodes: list
    agent: dict = field(default_factory=lambda: {"node": None, "state": "running", "drift": 0})
    trail: list = field(default_factory=list)
    claims: list = field(default_factory=list)
    gate: dict = field(default_factory=lambda: {"which": None, "resume_url": None})
    iteration: int = 0
    cursors: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "graph": self.graph,
            "scope_nodes": self.scope_nodes,
            "agent": self.agent,
            "trail": self.trail,
            "claims": self.claims,
            "gate": self.gate,
            "iteration": self.iteration,
            "cursors": self.cursors,
        }


RUNS: dict[str, RunState] = {}


def get_run(run_id: str) -> RunState | None:
    return RUNS.get(run_id)


def put_run(run_id: str, state: RunState) -> None:
    RUNS[run_id] = state
