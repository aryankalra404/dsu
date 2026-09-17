# STATUS — live handoff board. Every Claude session updates its owner's block; read all three before planning anything.

Format per block: **Gate** · **Done** (link commits/files) · **In progress** · **Blocked / manual pending** (what exactly the human must do) · **Next** · **For <other owner>** (questions, contract change requests).
Times in IST. Hackathon clock: H0 = 18 Sep 10:30.

---

## Core (person 1)
- **Gate:** H4 not started
- **Done:** scaffold only
- **In progress:** —
- **Blocked / manual pending:** Docker Desktop running? Anthropic auth (`ant auth status`)?
- **Next:** `plans/core-H4.md` items 0–4, publish replay server, post URL in team chat
- **For Web:** —
- **For VR:** —

## Web (person 2 — do first each gate)
- **Gate:** H4 in progress
- **Done:** item 3 city — R3F canvas (metres, 0.8 m cube), instanced nodes sized by fan_in, one LineSegments for edges, padded convex-hull district with 4 s breathing, agent dot with 400 ms ease-out queue (state commits instantly), trail with danger/accent segments + doubled revert, scrub-aware; loading/empty/error states on the centre panel; verified headless on `?replay=local` (screenshots); item 2 shared fixture `web/fixtures/{scene.json,events.jsonl}` (16 nodes / 20 edges / 20 events, §5 claim types, drift by the §5 formula) served by `/api/fixtures/*`; `?replay=local` plays it at 4× through the store with pause/steer/resume companions; item 1 contracts (`web/lib/contracts.ts` §6 field-for-field incl. trail in_scope/revert), zustand store with per-message reducers + fan_in helper, native WS with backoff, HTTP api (getScene/postDecision/confirmClaims); item 0 bootstrap — Next 15.5 + TS strict + Tailwind 4 + shadcn (radix) + R3F/drei/framer/zustand; dark-only layout, Inter/JetBrains Mono, DESIGN tokens in `web/lib/design.ts` + `soc-*` Tailwind colours; `/runs/[id]` 1280 px three-column frame; `.env.local` in place (gitignored)
- **In progress:** — (web 0–3 done; switching to VR 0–3 per the agreed order)
- **Blocked / manual pending:** —
- **Next:** after VR 0–3: web item 4 chrome (claims list, drift meter, timeline, state pill), item 5 point at Core replay when the URL is in Shared
- **For Core:** snapshot `trail[]` items now carry `in_scope` + `revert` (§6, committed 18 Sep) — the replay server's `GET /runs/demo/scene` should emit them, copied from the matching TrajectoryEvent.
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
- **Replay server URL:** (Core posts here) `http://<LAN-IP>:8000` · WS `ws://<LAN-IP>:8000/ws/runs/demo`
- **Hotspot:** SSID/password in team chat only, never here
- **Contract change requests pending:** none
- **Timeboxed decisions taken:** see `plans/decisions.md`

## How a free session writes the next plan
1. Read `MVP.md` §13 for the next gate's targets for that owner.
2. Read that owner's block above + their current `plans/<owner>-H<gate>.md` (what actually got done vs planned).
3. Read `plans/decisions.md` for fallbacks already taken.
4. Write `plans/<owner>-H<next>.md` in the same format (ordered items, timeboxes, acceptance, manual steps). Put unblocking items first.
5. Note in this file under that owner's **Next** that the plan exists. Do not start executing another owner's plan on their directory unless the human says so.
