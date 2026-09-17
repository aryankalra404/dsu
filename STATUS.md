# STATUS — live handoff board. Every Claude session updates its owner's block; read all three before planning anything.

Format per block: **Gate** · **Done** (link commits/files) · **In progress** · **Blocked / manual pending** (what exactly the human must do) · **Next** · **For <other owner>** (questions, contract change requests).
Times in IST. Hackathon clock: H0 = 18 Sep 10:30.

---

## Core (laptop B)
- **Gate:** H4 not started
- **Done:** scaffold only
- **In progress:** —
- **Blocked / manual pending:** Docker Desktop running? Anthropic auth (`ant auth status`)?
- **Next:** `plans/core-H4.md` items 0–4, publish replay server, post URL in team chat
- **For Web:** —
- **For VR:** —

## Web (laptop C)
- **Gate:** H4 not started
- **Done:** scaffold only
- **In progress:** —
- **Blocked / manual pending:** —
- **Next:** `plans/web-H4.md` items 0–3 on local fixture; swap to Core replay when posted
- **For Core:** —
- **For VR:** —

## VR (laptop A)
- **Gate:** H4 not started
- **Done:** scaffold only
- **In progress:** —
- **Blocked / manual pending:** Unity 6 LTS + Android support installed? Meta XR SDK imported? Headset model confirmed? Dev mode + adb?
- **Next:** `plans/vr-H4.md` items 0–2; first device build last
- **For Core:** need laptop LAN IP for the headset once the hotspot is up
- **For Web:** —

## Ops (rotating hat — whoever of Web/VR is not holding Account 2)
- **Currently wearing it:** —
- **Done:** —
- **In progress:** —
- **Blocked / needs a decision:** —
- **Next:** `plans/ops.md` in order

## Account 2 (shared Web/VR) — who has it now
- **Holder:** — · **since:** — · **hands off at:** — (say it in team chat too)

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
