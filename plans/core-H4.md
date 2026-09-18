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
- [ ] `sandbox/Dockerfile` (python:3.11-slim, `/app`, installs `requirements.txt` + `polygraph_shim/`).
- [ ] `sandbox/polygraph_shim/sitecustomize.py`: patch `requests`/`httpx`, `sys.setprofile` filtered to `/app`, `ast` walk for `defined`, write `/out/trace.json`. HTTP host rewrite to `HONEYPOT_BASE/{alias}/…` (fallback to local if empty).
- [ ] `sandbox/runner.py`: runs `app.run(argv[1])`, writes output/exit/duration.
- [ ] `core/sandbox/docker.py`: `build()`, `run(mode, input) -> Trace`.
- [ ] `docker compose` with `core`, `n8n`, `honeypot-fallback` (tiny FastAPI serving canned JSON). **MANUAL: Docker Desktop must be running — ask if `docker info` fails.**
- [ ] Network isolation: try a compose network where only `honeypot-fallback` is reachable. **If not working by minute 45, take the MVP.md §8 fallback and log it in `plans/decisions.md`.**
- [ ] Commit `core: sandbox + shim`.

## 6. Agent harness (40 min)
- [ ] `core/harness/loop.py`: ~60-line function-calling loop over `client.chat.completions.create(model=OPENAI_MODEL, messages, tools, tool_choice="auto")`: while `finish_reason == "tool_calls"` → for each call: gate check → execute → append `{"role":"tool","tool_call_id":…}` → repeat; stop on `done` tool or plain assistant text; cap 60 turns. Persist the full `messages` list as the transcript.
- [ ] `core/harness/agent.py`: tool JSON schemas + implementations; tools `read_file`, `write_file`, `run_cmd` (allowlist), `http_get`, `done(summary)` implemented against the sandbox container; system prompt = intent verbatim.
- [ ] Gate hook: before every tool call `await run.gate_event.wait()`; `steer` appends a user message; `kill` raises.
- [ ] `core/harness/trajectory.py`: build `TrajectoryEvent` per call (`in_scope` from scope globs, `content_hash`/`prev_hash`, `node` mapping, drift components per MVP.md §5), append to `runs/<id>/trajectory.jsonl`, broadcast `traj_event`.
- [ ] `USE_LLM=false` → harness replays a transcript instead of calling the API. **MANUAL: `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env` — ask if absent.**
- [ ] Commit `core: harness + recorder`.

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
