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
- **Gate:** H4 not started
- **Done:** scaffold only
- **In progress:** —
- **Blocked / manual pending:** —
- **Next:** `plans/web-H4.md` items 0–3 on local fixture; swap to Core replay when posted
- **For Core:** —
- **For VR:** —

## VR (person 2 — after the web target; person 3 builds/tests on device)
- **Gate:** H4 not started
- **Done:** Unity project cleaned and moved to `vr/` (Quest passthrough + hands rig kept, circuit assets removed, Socket.IO → NativeWebSocket, MCP bridge configured)
- **In progress:** —
- **Blocked / manual pending:** scene strip (For Ops above); headset model confirmed?; Dev mode + adb on person 3's laptop?
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
- [ ] **Strip the Unity scene** — see `plans/vr-H4.md` item 0 for the exact list of objects to delete, then Save As `Assets/SpatialSOC/Scene/SpatialSOC.unity`, set as scene 0, Project Setup Tool → Fix All, commit `vr: clean scene`.

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
