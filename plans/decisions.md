# Decisions log — append, never rewrite. One line each: time, owner, decision, why.

- 17 Sep 23:xx · team · v3 adopted: supervise the whole agent run live; web is the product; VR complements; n8n is the control tower. See MVP.md.
- 18 Sep 01:15 · VR · Reused the old Quest project (OVRCameraRig + Passthrough building block + hands) instead of creating a new one; deleted circuit assets/builds/backups; replaced Socket.IO with NativeWebSocket; dropped LFS gitattributes; moved to `vr/`, inner .git removed.
- 18 Sep 01:30 · team · Runtime LLM = OpenAI (user has a key). `openai` SDK, Chat Completions + tools, hand-written loop; no Anthropic SDK in the product. Model via `OPENAI_MODEL`, default gpt-4.1 until Core confirms what the account exposes.
- 18 Sep · Web+VR · §6 change: scene snapshot `trail[]` items are `{seq, node, kind, in_scope, revert}` (was `{seq, node, kind}`). Why: DESIGN.md colours out-of-scope segments red and doubles revert segments; a client joining mid-run couldn't style the historical trail. `in_scope` was derivable from the node, `revert` was not. Core fills both from the TrajectoryEvent.
- 18 Sep · Web+VR · The VR laptop is a Mac: no Quest Link. Iterate via Meta XR Simulator / Play mode with the headset emulator; device checks only through Ops builds on person 3's machine. Replaced every "Quest Link" reference in plans/vr-H4.md, vr/CLAUDE.md, MANUAL_SETUP.md.
- 18 Sep · Web+VR · zustand added to the Web stack (store). Why: plan named it; the alternative (context + useReducer) is more code for the same result. Recorded in root CLAUDE.md.
- 18 Sep · Web+VR · Scene strip done through Unity MCP instead of by Ops (deletes + Save As). Only Build Settings, Project Setup Tool and OculusProjectConfig remain manual.
