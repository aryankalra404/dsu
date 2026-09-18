# STATUS — live handoff board. Every Claude session updates its owner's block; read all three before planning anything.

Format per block: **Gate** · **Done** (link commits/files) · **In progress** · **Blocked / manual pending** (what exactly the human must do) · **Next** · **For <other owner>** (questions, contract change requests).
Times in IST. Hackathon clock: H0 = 18 Sep 10:30.

---

## Core (person 1)
- **Gate:** H4 items 0–7 all done
- **Done:** all of `plans/core-H4.md`. Fixtures under `core/fixtures/runs/` are now **real recorded GPT-5.5 runs** (clean + drifting), not handwritten — the drifting one genuinely drifted on the first attempt (wrote `app.py`, `db.py`, `utils/helpers.py`, feature landed at `features/scheme_finder.py`; drift 46.67). `USE_LLM=false` replays those transcripts for real. Sandbox isolated + verified (honeypot reachable, `8.8.8.8` refused; SQLi probe hits the unparameterised `cur.execute` with `arg_has_payload`). Replay server verified against the real trajectory. `core/tests` green (6 tests).
- **In progress:** —
- **Blocked / manual pending:** **Port 8000 is taken** by an unrelated process on this laptop (`uvicorn app.main:app`) — core and the replay server both default to it. Free it or we pick another port before the demo. `OPENAI_API_KEY` is in `.env` (gitignored); it was pasted into a chat transcript, so **rotate it** when convenient. `honeypot-fallback` must be up for `http_get` (`docker compose up -d honeypot-fallback`, published on host **9000**).
- **Next:** H12 per MVP.md §13 — five checks against these recorded runs, pause-on-scope-violation through n8n. The drifting fixture has a scope violation but **no revert**, so the `no_churn` revert rule will need a different source or a second recording.
- **For Web:** —
- **For VR:** —

## Web (person 2 — do first each gate)
- **Gate:** **H4 done** (items 0–5). Verified against Core's real replay server on laptop 2 and against the local fixture.
- **Done:** item 4 chrome — `ClaimsPanel` (grouped by source, type badge, live DRIFT badge from trajectory, click → focus scope node), `DriftMeter` (bar + 4 chips per DESIGN), `StatePill` (all DESIGN states incl. Paused reason / Steered 2 s / Merged), `Timeline` (scrub shared upstream, red out-of-scope ticks, Live button, range spans snapshot trail + live events), `RightPanel` tabs — Evidence (trajectory table, filtered by selected node), Patch (diff viewer), **Gate (live: Continue/Steer/Kill/Approve/Reject/Confirm, steer presets, keyboard Space/S/K/A/R/C, auto-switches to Gate when one opens; posts over HTTP on core, applies in-page on local)**; item 5 — Core replay is the default source, **local fixture fallback with a header badge when Core is unreachable**; atmosphere per DESIGN.md → bloom, fog, floor grid, always-on labels for scope + agent node, auto-frame, idle orbit, `F` focus, Esc clears; earlier: items 0–3 (bootstrap, contracts, store, ws, fixture, city).
- **In progress:** —
- **Blocked / manual pending:** —
- **Next:** VR items 0–3 (`plans/vr-H4.md`), then write `plans/web-H12.md` (editable claims + confirm wired to `/claims/confirm`, evidence panel over `trace_event`, patch history, presence ghosts).
- **For Core:** snapshot `trail[]` items now carry `in_scope` + `revert` (§6, committed 18 Sep) — the replay server's `GET /runs/demo/scene` should emit them, copied from the matching TrajectoryEvent. **Still missing as of 18 Sep 02:xx** (verified: items are `{seq,node,kind}`).
- **For Core — fixture/replay fixes needed before H12 (verified by running `python -m replay` on laptop 2):**
  1. **Scope globs → `features/**` and `tests/**`.** The recorded drifting run wrote `features/scheme_finder.py` (the actual feature) but scope was `/features/schemes/**`, so *every* write is `in_scope=False`, the district is empty, and the trail is red from seq 7. With the wider scope, seqs 7/8/12/21/23 are in scope and the first violation is **seq 10 (`write app.py`)**, then 11 (`utils/helpers.py`), 18, 19 — a much better story: starts right, then rewrites app/utils/db. `in_scope` is computed at replay time, so **no re-recording**; just recompute and rewrite the jsonl (or compute on load). Document that scope is the human-confirmed glob list at HITL #1 (the human widened it from the intent's literal path).
  2. **`scope_nodes` is `[]`** — must resolve to `features`, `features.scheme_finder`, `tests.test_app` under the new globs.
  3. **Graph must include nodes the agent creates.** `features.scheme_finder` isn't in `graph.nodes` because layout ran on the pre-run repo. Build the graph from the repo AST **∪ every `node` referenced in the trajectory** (place new nodes near their package's centroid), so the dot always has somewhere to go.
  4. **The fixture repo is 5 files → a 4-node city.** Add ~12–15 inert but plausible modules (e.g. `api/routes.py`, `api/auth.py`, `models/user.py`, `models/scheme.py`, `services/eligibility.py`, `services/notify.py`, `config.py`, `utils/text.py`, `utils/dates.py`, `tests/test_db.py`, `tests/test_utils.py`) with real imports between them so `spring_layout` produces a city with clusters. They don't need to do anything. Keep the recorded run valid: don't rename existing files.
  5. Trail items: add `in_scope` and `revert` (item above).
  6. Optional: the `no_churn` revert rule has nothing to fire on in this run. Either record a second short run nudged into a revert, or accept revert as hand-written-only and say so in `plans/decisions.md`.
  7. **Replay ends with `{"t":"final","state":"merged"}`** (`replay.py:36`). Nothing was approved; the web then shows "Merged" and turns the trail green. End the replay with `agent_state: done` only, and reserve `final` for real gate outcomes. If you want the loop to visibly restart, emit `run_created` again instead.
  8. **`claims` is empty in the demo scene.** Put the fixture's claims (`fixtures/cache/claims.json`, or the six from `web/fixtures/scene.json` until the extractor is cached) into `GET /runs/demo/scene` so the left panel isn't blank on the real server.
  After 1–5, 7, 8: restart replay, `curl /runs/demo/scene` should show ≥15 nodes, non-empty `scope_nodes`, claims, trail items with `in_scope`. Then ping laptop 2 for the H4 sync check.
  **Verified 18 Sep on laptop 2:** web ↔ Core replay integration works end to end (scene fetch + WS stream + CORS). Screenshots in the Web block.
- **For VR:** —

## VR (person 2 — after the web target; person 3 builds/tests on device)
- **Gate:** H4 not started
- **Done:** Unity project cleaned and moved to `vr/` (Quest passthrough + hands rig kept, circuit assets removed, Socket.IO → NativeWebSocket, MCP bridge configured). 18 Sep: scene stripped via MCP and saved as `Assets/SpatialSOC/Scene/SpatialSOC.unity` (item 0 editor half).
- **In progress:** —
- **Blocked / manual pending:** build settings + Project Setup Tool (For Ops below); headset model confirmed?; Dev mode + adb on person 3's laptop?
- **Next:** `plans/vr-H4.md` items 0–2; first device build last
- **For Core:** need laptop LAN IP for the headset once the hotspot is up
- **For Web:** —

## Ops (person 3, no Claude)
- **Currently wearing it:** —
- **Done:** —
- **In progress:** —
- **Blocked / needs a decision:** —
- **Next:** `plans/ops.md` in order

## For Ops — manual steps waiting (person 2 writes click-by-click lists here; person 3 ticks them)
- [ ] **Unity build settings + project setup** (scene strip already done via MCP — `Assets/SpatialSOC/Scene/SpatialSOC.unity` exists):
  1. Pull `main`. Open `vr/` in Unity Hub with **6000.3.2f1**. Wait for packages to resolve (NativeWebSocket + Newtonsoft download on first open).
  2. Project window → open `Assets/SpatialSOC/Scene/SpatialSOC.unity`. Hierarchy should show exactly: `Directional Light`, `Global Volume`, `[BuildingBlock] Camera Rig`, `[BuildingBlock] Passthrough`, `EventSystem`. If anything else is there, tell person 2 — don't delete it yourself.
  3. File → Build Profiles (Unity 6) → Scene List: click **Add Open Scenes**; untick/remove `Assets/Scenes/SampleScene`; drag `SpatialSOC` to index 0.
  4. Menu Meta → Tools → **Project Setup Tool** → Android tab → **Fix All**, then **Apply All** in Recommended. Repeat until no red items.
  5. Project window → `Assets/Oculus/OculusProjectConfig.asset` → Inspector: Passthrough Support = **Required** (or Supported), Hand Tracking Support = **Controllers and Hands**. Ctrl/Cmd-S.
  6. Commit from `vr/`: `git add Assets/SpatialSOC ProjectSettings && git commit -m "vr: build settings + project setup"`, push. Write "done" in the Ops block.

---

## Shared
- **Replay server URL:** `http://172.20.10.3:8000` · scene `http://172.20.10.3:8000/runs/demo/scene` · WS `ws://172.20.10.3:8000/ws/runs/demo` — run with `cd core && uv run python -m replay` (loops the drifting trajectory continuously; connect anytime)
- **Hotspot:** SSID/password in team chat only, never here
- **Contract change requests pending:** none
- **Timeboxed decisions taken:** see `plans/decisions.md`

## How a free session writes the next plan
1. Read `MVP.md` §13 for the next gate's targets for that owner.
2. Read that owner's block above + their current `plans/<owner>-H<gate>.md` (what actually got done vs planned).
3. Read `plans/decisions.md` for fallbacks already taken.
4. Write `plans/<owner>-H<next>.md` in the same format (ordered items, timeboxes, acceptance, manual steps). Put unblocking items first.
5. Note in this file under that owner's **Next** that the plan exists. Do not start executing another owner's plan on their directory unless the human says so.
