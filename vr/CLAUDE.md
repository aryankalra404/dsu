# VR owner — read root CLAUDE.md and MVP.md §6, §10, §13 first

You own `vr/` (Unity 6 LTS project, Meta XR SDK via OpenXR, NativeWebSocket, Quest 3). The MR client is a second view onto the same scene as the web: no state, logic or UI the web lacks.

Order of work (H4): project + passthrough running on device → NativeWebSocket connects to `ws://<laptop>:8000/ws/runs/demo` and logs events → city rendered from `GET /runs/demo/scene` (instanced nodes, LineRenderer edges) → dot moves on `traj_event`.
H12: trail with red out-of-scope segments, hand time-scrub sending `{"t":"scrub"}`, palm menu Approve/Reject over HTTP.

Rules specific to VR — manual steps:
- **Anything that needs the Unity editor GUI or the headset is manual. Stop and ask with exact click-by-click steps**: creating the project, switching platform, importing Meta XR / NativeWebSocket packages, Project Setup Tool fixes, XR plug-in settings, Developer Mode, adb pairing, Quest Link, Build & Run, casting. Via Unity MCP you may create scenes, GameObjects, components, materials and C# scripts; you may not trigger a build or change Player/XR settings without asking first.
- If Unity MCP is not connected, write the C# files and a numbered "do this in the editor" list; do not guess at editor state.

Rules specific to VR:
- Coordinates from the server are metres, right-handed, Y up; flip Z on ingest. Graph fits a 0.8 m cube above the table.
- Iterate via Quest Link / Meta XR Simulator; build APKs only at gates. Developer mode, adb and pairing are manual — ask.
- Controllers must work identically to hands behind one setting.
- Commit `.unity`/`.prefab` with YAML merge enabled; never commit `Library/`, `Temp/`, `Logs/`, `Builds/`.
- If a feature is not yet on web, do not build it in VR. Ask the Web owner first.
- Every colour, radius, width, label and timing comes from `DESIGN.md`. Same hex, same words, same 400 ms. If it is not in DESIGN.md, ask Web to add it; do not improvise.
