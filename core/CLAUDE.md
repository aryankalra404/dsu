# Core owner — read root CLAUDE.md and MVP.md §4–§8, §11, §13 first

You own: `core/`, `sandbox/`, `n8n/`, `.github/`, `docker-compose.yml`, `demo.sh`.

Order of work (H4): fixture repo → replay server (`core/replay.py`, serves `/runs/demo/scene` + streams `fixtures/runs/drifting/trajectory.jsonl` at 4×) → real harness in Docker → trajectory recorder → WS hub. Publish the replay server first; Web and VR depend on it.

Rules specific to Core:
- `core/checks/` and `core/harness/trajectory.py` import nothing from `anthropic`. `tests/test_no_llm_in_engine.py` enforces it; keep it green.
- Every verdict and pause must be recomputable from `trajectory.jsonl` + `trace.json` alone.
- Docker networking: timebox 1 h, then take the MVP.md §8 fallback and move on. Ask the human before spending longer.
- n8n: build the workflow in the n8n UI (human does clicks; you write the HTTP bodies and expressions), then export to `n8n/workflow.json` and commit. Slack/Sheets/GitHub credentials are manual — ask.
- Model is `claude-opus-5` everywhere. Adaptive thinking, streaming. Cache every LLM output used by the demo into `core/fixtures/cache/`.
