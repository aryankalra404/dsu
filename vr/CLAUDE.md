# VR owner — read root CLAUDE.md and MVP.md §6, §10, §13 first

You own `vr/`. The MR client is a second view onto the same scene as the web: no state, logic or UI the web lacks.

**Project state (already set up — do not recreate):** Unity **6000.3.2f1**, URP, Android target. `Packages/manifest.json` has Meta XR SDK All-in-One 205.0.0, XR Management + Oculus loader, XR Interaction Toolkit 3.3.2, Input System, **NativeWebSocket** (`com.endel.nativewebsocket`), Newtonsoft JSON, and `com.gamelovers.mcp-unity` (the Unity MCP bridge, port 8090, auto-starts with the editor). `Assets/Scenes/SampleScene.unity` contains an **OVRCameraRig**, a `[BuildingBlock] Passthrough`, hand tracking and controller models — keep all of that. It also still contains leftover circuit objects (`BREADBOARD`, `LED`, `MOTOR`, `PIR`, `RES`, `DeleteZone`, `HoverLocation`, `Handle`, the circuit `Canvas`/`Panel`) whose scripts were deleted; the first Ops task is to delete those and Save As `Assets/SpatialSOC/Scene/SpatialSOC.unity`. New code goes under `Assets/SpatialSOC/{Scene,Net,Hands,UI,Fixtures,Scripts}`. `Assets/Samples/Meta XR Interaction SDK` is reference material only.
`.mcp.json` at the repo root and in `vr/` points Claude at the bridge with absolute paths for this machine; person 3's machine needs the paths edited or the bridge disabled.

Order of work (H4): project + passthrough running on device → NativeWebSocket connects to `ws://<laptop>:8000/ws/runs/demo` and logs events → city rendered from `GET /runs/demo/scene` (instanced nodes, LineRenderer edges) → dot moves on `traj_event`.
H12: trail with red out-of-scope segments, hand time-scrub sending `{"t":"scrub"}`, palm menu Approve/Reject over HTTP.

Rules specific to VR — manual steps:
- **Anything that needs the Unity editor GUI or the headset is manual. Stop and ask with exact click-by-click steps**: creating the project, switching platform, importing Meta XR / NativeWebSocket packages, Project Setup Tool fixes, XR plug-in settings, Developer Mode, adb pairing, Quest Link, Build & Run, casting. Via Unity MCP you may create scenes, GameObjects, components, materials and C# scripts; you may not trigger a build or change Player/XR settings without asking first.
- The person doing editor GUI work, builds and headset testing is **Ops (person 3)** on a separate machine with the same Unity project pulled from git. Write every manual step as a numbered click-by-click list under **For Ops** in `STATUS.md`, keep coding, and pick up their result from the Ops block. If Unity MCP is not connected, do the same for scene wiring.

Rules specific to VR:
- Coordinates from the server are metres, right-handed, Y up; flip Z on ingest. Graph fits a 0.8 m cube above the table.
- Iterate via Quest Link / Meta XR Simulator; build APKs only at gates. Developer mode, adb and pairing are manual — ask.
- Controllers must work identically to hands behind one setting.
- Commit `.unity`/`.prefab` with YAML merge enabled; never commit `Library/`, `Temp/`, `Logs/`, `Builds/`.
- If a feature is not yet on web, do not build it in VR. Ask the Web owner first.
- Every colour, radius, width, label and timing comes from `DESIGN.md`. Same hex, same words, same 400 ms. If it is not in DESIGN.md, ask Web to add it; do not improvise.
