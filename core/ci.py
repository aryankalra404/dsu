"""CI mode (MVP.md §3 GitHub Action): re-check an agent's PR with the same deterministic engine, no gates.

    uv run python ci.py --repo <checkout> --run <checkout>/.spatial-soc/run.json [--out report.md]

`run.json` is the run record Spatial SOC saves for every run (GET /runs/{id}, or core/runs/<id>/run.json):
claims, confirmed scope and the trajectory. The repo's tests and the probes are executed again here under the
shim; verdicts come from checks/ exactly as in the live product. Exit code 1 when any claim fails."""

import argparse
import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

import config
from checks import compute_verdicts
from checks.verdicts import FAILING
from notify import claims_table
from sandbox import executor


async def run_ci(repo: Path, record: dict) -> tuple[list[dict], list[dict]]:
    config.USE_SANDBOX = False  # CI runners are already disposable containers
    claims, scope, events = record["claims"], record["scope"], record.get("events", [])
    with tempfile.TemporaryDirectory(prefix="soc-ci-") as tmp:
        wd = Path(tmp) / "repo"
        shutil.copytree(repo, wd, ignore=shutil.ignore_patterns(".git", ".spatial-soc", "node_modules", ".venv"))
        traces: list[dict] = []
        if executor.has_python_tests(wd):
            traces.append(await executor.execute(wd, run_id="ci", exec_id="e1", mode="happy", iteration=0,
                                                 pytest_suite=True))
        if record.get("probe_entry"):
            for i, p in enumerate(executor.PROBES, len(traces) + 1):
                traces.append(await executor.execute(wd, run_id="ci", exec_id=f"e{i}", mode="probe", iteration=0,
                                                     entry=record["probe_entry"], input=p["input"]))
        verdicts = compute_verdicts(claims, events, traces, scope, 0, wd)
    return claims, verdicts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--run", required=True, type=Path)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    record = json.loads(args.run.read_text(encoding="utf-8"))
    claims, verdicts = asyncio.run(run_ci(args.repo, record))
    failed = [v for v in verdicts if v["verdict"] in FAILING]
    head = "passed" if not failed else f"{len(failed)} claim(s) failed"
    report = f"## Spatial SOC — {head}\n\nIntent: {record.get('intent', '')}\n\n{claims_table(claims, verdicts)}\n"
    if args.out:
        args.out.write_text(report, encoding="utf-8")
    print(report)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
