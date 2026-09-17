# VR — H4 plan (hours 0–4)

**Gate:** passthrough + WebSocket echo running **on the Quest 3**, and the fixture city rendered with the dot moving on `traj_event`.
**Read first:** `CLAUDE.md`, `vr/CLAUDE.md`, `MVP.md` §6, §10, §13.
**You share Account 2 with Web.** Work in plan items; after each one update `STATUS.md`, `/clear`, and hand the account over (say so in chat). While you don't have it, do `plans/ops.md`.
**Do not wait for Core.** Until the replay server is up (target: minute 60), load `vr/Assets/SpatialSOC/Fixtures/scene.json` + `events.jsonl` you write from §6 and play them locally.
**Build APKs only at the end of this plan.** Iterate via Quest Link / Meta XR Simulator.

## 0. Project (30 min) — MANUAL-HEAVY, do it with the human beside you
- [ ] Unity Hub → new **Unity 6 LTS** 3D (URP) project at `vr/`; switch platform to **Android**; texture compression ASTC; IL2CPP; ARM64.
- [ ] Import **Meta XR All-in-One SDK** (Package Manager, Meta registry). Run Project Setup Tool → fix all. **MANUAL: package sign-in / registry prompts — ask.**
- [ ] OpenXR + Meta feature group enabled; passthrough enabled in the OVR/Meta camera rig; hand tracking + controllers both on.
- [ ] Add **NativeWebSocket** via git URL in Package Manager.
- [ ] Newtonsoft JSON (`com.unity.nuget.newtonsoft-json`) for the contracts.
- [ ] `.gitignore` already covers `Library/ Temp/ Logs/ Builds/`; confirm Unity project uses **Force Text** serialisation + Visible Meta Files; enable YAML merge.
- [ ] Commit `vr: project bootstrap`.

## 1. Contracts (20 min)
- [ ] `Assets/SpatialSOC/Net/Contracts.cs`: C# classes for `Claim`, `TrajectoryEvent`, `SceneSnapshot` (graph nodes/edges, scope_nodes, agent, trail, gate, cursors) and a `WsEnvelope { string t; }` + per-`t` payload classes — copied field-for-field from MVP.md §6. Unknown `t` → log once, ignore.
- [ ] `Coords.cs`: `Vector3 FromServer(float[] p) => new(p[0], p[1], -p[2])` (flip Z) + table anchor offset.
- [ ] Commit `vr: contracts`.

## 2. Networking (30 min)
- [ ] `SceneClient.cs` (MonoBehaviour): on start `GET {CORE_BASE}/runs/{id}/scene` (UnityWebRequest) → `SceneSnapshot`; then open `ws://{CORE_HOST}:8000/ws/runs/{id}` with NativeWebSocket; dispatch messages on the main thread; reconnect with backoff.
- [ ] `Config` ScriptableObject: `coreHost`, `runId`, `speed`. **Laptop LAN IP goes here, never hardcoded in a script. Ask the human for the IP.**
- [ ] `Presence.cs`: sends `{"t":"cursor","client":"vr-1","kind":"head",...}` and both hands at 20 Hz; `pinch` flag from hand tracking.
- [ ] Verify on Quest Link: console shows `traj_event`s arriving from Core's replay (or the local fixture player `FixturePlayer.cs` if Core isn't up).
- [ ] Commit `vr: ws client + presence`.

## 3. The city (60 min)
- [ ] `CityRoot` GameObject anchored 0.9 m above floor / table height; 0.8 m cube gizmo for sanity.
- [ ] `NodeRenderer.cs`: `Graphics.RenderMeshInstanced` (or GPU instancer) for node spheres at `FromServer(pos)`; in-scope material emissive, out-of-scope 10 % alpha.
- [ ] `EdgeRenderer.cs`: one `LineRenderer` per edge, thin, dim grey (batch if >200).
- [ ] `ScopeDistrict.cs`: soft glowing translucent volume around `scope_nodes` bounds.
- [ ] `AgentDot.cs`: emissive sphere + small particle system tail; `Lerp` to the new node position on each `traj_event`.
- [ ] `Trail.cs`: `LineRenderer` accumulating trail points; per-segment colour red when the event was `in_scope:false`; width ×2 on revert.
- [ ] Commit `vr: city + dot + trail`.

## 4. Minimal HUD (20 min)
- [ ] World-space canvas above the city: agent state (running/paused/done/killed), drift score with four component chips, run id. Update from events.
- [ ] Commit `vr: hud`.

## 5. First device build (30 min) — MANUAL
- [ ] **Ask the human**: Developer Mode on, `adb devices` shows the headset, USB debugging allowed.
- [ ] Build & Run to the Quest 3. Passthrough visible, city floats over the table, dot moves from Core's replay over the hotspot LAN IP.
- [ ] If the build pipeline fights you for >30 min, stop building; stay on Quest Link for H12 and build again at the H12 gate. Log it in `plans/decisions.md`.
- [ ] Commit `vr: first device build config`.

## Acceptance for H4
- On device (or on Quest Link if the build slipped): passthrough on, city rendered from the server snapshot, dot follows the replay, trail goes red out of scope, HUD drift climbs.
- Head + hands presence visible as ghosts in the web client.
- No feature exists here that the web lacks.

## Manual steps you will hit (ask, don't work around)
Meta SDK sign-in · Developer Mode + adb pairing · laptop LAN IP · headset on the hotspot. Palm menu, time-scrub and any decision buttons are H12, and only after the web has them.
