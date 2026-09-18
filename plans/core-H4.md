# Core — H4 plan (hours 0–4)

**Gate:** the agent runs in the cage on the fixture, trajectory events stream over WS, and both clients see the dot move.
**Read first:** `CLAUDE.md`, `core/CLAUDE.md`, `MVP.md` §4, §6, §8, §13.
**Order matters.** Items 1–4 unblock Web and VR; ship them in the first 60–75 minutes even if rough.

## 0. Bootstrap (15 min)
- [x] `uv init core --python 3.11`; deps: `fastapi uvicorn[standard] networkx pydantic openai python-dotenv`; dev: `pytest ruff httpx websockets`.
- [x] `core/main.py` with `/health`, CORS for `localhost:3000`, `.env` loading, `USE_*` flags exposed at `GET /flags`.
- [x] `core/tests/test_no_llm_in_engine.py`: fails if `core/checks/**` or `core/harness/trajectory.py` import `openai` (or `anthropic`, `langchain`). Keep it green from the start.
- [x] Commit `core: bootstrap`.

## 1. Fixture repo (20 min) — MANUAL-FREE
- [x] `core/fixtures/repo_schemes/`: tiny Flask app with `app.py` (`run(input: str) -> str` + `GET /schemes?bio=`), `db.py` (sqlite, one deliberately unparameterised query behind a flag so the drifting run can leave it vulnerable), `utils/helpers.py`, `features/__init__.py`, `requirements.txt`, one existing test.
- [x] `core/fixtures/repo_schemes/SPATIAL_SOC.md` with the intent string from MVP.md §3.
- [x] Commit `core: fixture repo`.

## 2. Static scene + layout (25 min)
- [x] `core/scene/layout.py`: walk `repo_schemes` with `ast`, build import/call graph in `networkx`, `spring_layout(dim=3, seed=7)`, scale to 0.8 m cube, lift scope nodes +0.1 m, emit `graph.nodes[].pos`, `edges`, `in_scope`.
- [x] `core/scene/state.py`: in-memory `RunState` = MVP.md §6 scene snapshot (`graph`, `scope_nodes`, `agent`, `trail`, `claims`, `gate`, `iteration`, `cursors`).
- [x] `GET /runs/{id}/scene` returns it. `GET /runs/demo/scene` works with no LLM, no Docker.
- [x] Commit `core: scene layout + snapshot`.

## 3. Hand-written drifting trajectory (20 min)
- [x] `core/fixtures/runs/drifting/trajectory.jsonl`: ~25 `TrajectoryEvent`s (§6) telling the story: 6 in-scope reads/writes → `write utils/helpers.py` (`in_scope:false`, `drift.scope_violation:true`) → revert (`content_hash == earlier prev_hash`, `drift.revert:true`) → `run_cmd pytest` exit 1 → `http` to nothing → `done`. `node` field set for every event.
- [x] `core/fixtures/runs/clean/trajectory.jsonl`: ~15 in-scope events, `run_cmd pytest` exit 0, `done`.
- [x] This is a placeholder until item 7 records real runs. Mark the files `# HANDWRITTEN — replace at H12` in a sibling `README`.
- [x] Commit `core: handwritten fixture trajectories`.

## 4. WS hub + replay server (30 min) — **PUBLISH THIS; Web and VR are waiting**
- [x] `core/ws.py`: `/ws/runs/{run_id}`; per-run connection set; `broadcast(run_id, msg)`; accept upstream `cursor|select|scrub`, rebroadcast `cursors` at ≤20 Hz and `select`/`scrub` immediately; ignore unknown `t`.
- [x] `core/replay.py`: loads the jsonl, serves the scene, streams `traj_event` in order with `ts_ms` deltas / speed, updates `agent.node`, `trail`, `drift`; emits `agent_state` and `final`. Loops continuously so a client connecting at any time sees the demo within one cycle. Runs as `cd core && uv run python -m replay --run drifting --speed 4` (flat package layout — `python -m core.replay` from repo root does not resolve; see decision log).
- [x] Verified with a `websockets` python client instead of `websocat` (not installed) — events appear in order, `select`/`scrub` rebroadcast immediately, `cursor` aggregates into `cursors`, unknown `t` ignored.
- [x] Posted team-chat message and LAN URL under STATUS.md → Shared. Commit `core: ws hub + replay`.

## 5. Sandbox image (45 min, timebox — see §8 fallback)
- [x] `sandbox/Dockerfile` (python:3.11-slim, `/app`, installs `requirements.txt` + `polygraph_shim/`).
- [x] `sandbox/polygraph_shim/sitecustomize.py`: patch `requests`/`httpx`, `sys.setprofile` filtered to `/app` (both `call` and `c_call`, so C-implemented sinks like `sqlite3.Cursor.execute`/`open` are actually caught), `ast` walk for `defined`, write `/out/trace.json`. HTTP host rewrite to `HONEYPOT_BASE/{alias}/…` (fallback to local `honeypot-fallback` service if empty). Dropped the stale `ANTHROPIC_BASE_URL` from MVP.md §8 per the OpenAI-only decision — only `OPENAI_BASE_URL` is set.
- [x] `sandbox/runner.py`: runs `app.run(argv[1])`, writes output/exit/duration.
- [x] `core/sandbox/docker.py`: `build()`, `run(mode, input) -> Trace`.
- [x] `docker compose` with `n8n`, `honeypot-fallback` (tiny FastAPI serving canned JSON). Docker Desktop confirmed running. (`core` itself is not containerized — it runs via `uv run` on the host, as already verified in item 4; not adding an unbuilt/untested core Dockerfile.)
- [x] Network isolation: compose network `spatial-soc-sandbox-net` (`internal: true`) — verified the sandbox container reaches `honeypot-fallback` but a raw socket to `8.8.8.8` is refused ("Network is unreachable"). Worked well within the timebox.
- [x] Commit `core: sandbox + shim`.

## 6. Agent harness (40 min)
- [x] `core/harness/loop.py`: function-calling loop over `client.chat.completions.create(model=OPENAI_MODEL, messages, tools, tool_choice="auto")`: while there are tool calls → for each: gate check → execute → append `{"role":"tool","tool_call_id":…}` → repeat; stop on `done` tool or plain assistant text; cap 60 turns. Persists `messages` to `runs/<id>/transcript.json` after every turn.
- [x] `core/harness/agent.py`: tool JSON schemas + implementations; `read_file`/`write_file` (path-escape guarded), `run_cmd` (allowlist: `pytest` only, normalized to `python -m pytest` — bare `pytest` doesn't add the repo root to `sys.path`, breaking the fixture's own `from db import ...`), `http_get` (honeypot rewrite), `done(summary)`; system prompt = `SPATIAL_SOC.md` intent verbatim. `USE_SANDBOX` toggles `run_cmd` between host subprocess and a `docker run` against `spatial-soc-sandbox-net` with a live bind mount (item 5's baked image can't see files the agent just wrote).
- [x] Gate hook: before every tool call `await control.gate_event.wait()`; `steer` appends a user message; `kill` raises `Killed`. `core/harness/control.py`. Verified live: pause blocks, resume continues, kill raises before any tool executes.
- [x] `core/harness/trajectory.py`: builds `TrajectoryEvent` per call (`in_scope` from scope globs, `content_hash`/`prev_hash`, `node` mapping, drift score per MVP.md §5), appends to `runs/<id>/trajectory.jsonl`, broadcasts `traj_event`, and now also applies the event to the run's `RunState` (via a new shared `scene/state.apply_event`, also adopted by `replay.py`) so `GET /runs/{id}/scene` reflects live runs too, not just the replay demo.
- [x] `USE_LLM=false` → harness runs a small canned tool-call script instead of calling the API (covered by `core/tests/test_harness_loop.py`). **MANUAL: `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env` — asked, still pending.**
- [x] Wired `POST /runs` in `main.py` (copies the fixture to a per-run workdir, seeds `RunState`, runs the harness as a background task) — needed for item 7 and the H4 acceptance line "a live POST /runs produces a trajectory file and WS events"; not spelled out as its own bullet here but required by the acceptance section below.
- [x] Fixed two bugs found while testing: `SCOPE_GLOBS` matching didn't match the bare package root (`features/schemes/__init__.py` showed `in_scope:false`); `sys.setprofile` was only handling `'call'` events, silently missing `'c_call'` — which is how C-implemented sinks like `sqlite3.Cursor.execute` and `open()` actually fire (exactly the sinks MVP.md §5 names). Also removed `"run"` from the shim's `SINK_FUNCS` — it collided with the fixture's own `app.run()` entry point and flagged every call.
- [x] Commit `core: harness + recorder`.

## 7. Record the real runs (30 min, may spill into H4–H6)
- [ ] `POST /runs` with the fixture + intent; let the agent run live; save `transcript.json` + `trajectory.jsonl` under `fixtures/runs/clean/`.
- [ ] Drifting run: ambiguous intent variant + a `TODO: refactor utils` comment in the repo; run again; if it drifts, save as `fixtures/runs/drifting/`. If it stays clean after 2 tries, keep the handwritten file and note it in `plans/decisions.md`.
- [ ] Replace handwritten trajectories; rerun replay; confirm the story still reads on screen.
- [ ] Commit `core: recorded runs`.

## Acceptance for H4
- `uv run pytest core/tests` green (includes `test_no_llm_in_engine`).
- `python -m core.replay` streams; Web and VR both show the dot moving on the fixture city.
- A live `POST /runs` produces a trajectory file and WS events (or, if Docker fell back, does so in subprocess mode with `USE_SANDBOX=false` and the badge says so).

## Manual steps you will hit (ask, don't work around)
Docker Desktop running · `OPENAI_API_KEY` + `OPENAI_MODEL` in `.env` · nothing else in H4. n8n, Beeceptor, Slack, GitHub PAT are set up by **Ops** (`plans/ops.md`) in parallel; you consume them at H12. If you need one earlier, write it under **For Ops** in `STATUS.md`.
