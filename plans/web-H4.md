# Web — H4 plan (hours 0–4)

**Gate:** the city renders from `GET /runs/demo/scene` and the dot moves on `traj_event` from Core's replay server.
**Read first:** `CLAUDE.md`, `web/CLAUDE.md`, `MVP.md` §6, §9, §13.
**You are person 2; do this plan before `plans/vr-H4.md`.** `/clear` when you switch to VR.
**Do not wait for Core.** Until the replay server is up (target: minute 60), use `web/fixtures/scene.json` and `web/fixtures/events.jsonl` that you write from the §6 contract; swap the URL later.

## 0. Bootstrap (20 min)
- [x] `pnpm create next-app@latest web --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"`.
- [x] Add: `three @react-three/fiber @react-three/drei framer-motion zustand`; shadcn init + `button card badge tabs table scroll-area separator tooltip dialog textarea`.
- [x] `.env.local` from `.env.example` (`NEXT_PUBLIC_CORE_BASE_URL`, `NEXT_PUBLIC_CORE_WS_URL`). Never commit it.
- [x] Dark theme default; base layout with a 1280 px-safe grid. `pnpm typecheck` script.
- [x] Commit `web: bootstrap`.

## 1. Types + store (20 min)
- [x] `web/lib/contracts.ts`: TypeScript types for `Claim`, `TrajectoryEvent`, `Trace`, `Verdict`, `SceneSnapshot`, and a discriminated union `WsMessage` on `t` — copied field-for-field from MVP.md §6.
- [x] `web/lib/store.ts` (zustand): `scene`, `events[]`, `agent`, `trail[]`, `drift`, `claims`, `gate`, `cursors`, `scrubSeq | null`; reducers per `WsMessage`; unknown `t` ignored.
- [x] `web/lib/ws.ts`: connect to `${WS_URL}/ws/runs/${id}`, JSON parse, dispatch to store, reconnect with backoff, send helper for `cursor|select|scrub`.
- [x] `web/lib/api.ts`: `getScene(id)`, `postDecision(id, body)`, `confirmClaims(id, claims)` — HTTP only.
- [x] Commit `web: contracts, store, ws`.

## 2. Local fixtures (10 min)
- [x] `web/fixtures/scene.json` (≈15 nodes, 3 in scope) and `web/fixtures/events.jsonl` (≈20 events incl. one out-of-scope write and one revert), matching §6 exactly. **This is the single shared fixture** — VR copies these files unchanged to `vr/Assets/SpatialSOC/Fixtures/`.
- [x] `?replay=local` query flag plays the local file at 4× through the same store so the UI is testable with Core down.
- [x] Commit `web: local fixtures`.

## 3. The city (60 min)
- [ ] `components/city/City.tsx`: R3F `<Canvas>`, dark background, `OrbitControls` (damped), soft key light + bloom via drei `Effects` only if cheap.
- [ ] `Nodes.tsx`: `InstancedMesh` spheres at `pos`, size by `fan_in` if present; in-scope nodes bright, out-of-scope at 10 % opacity. Hover tooltip with `label`.
- [ ] `Edges.tsx`: `Line` per edge (drei), dim grey.
- [ ] `ScopeDistrict.tsx`: translucent glowing hull/box around `scope_nodes`.
- [ ] `AgentDot.tsx`: emissive sphere lerping to `agent.node` position on each `traj_event`; short particle/trail sprite.
- [ ] `Trail.tsx`: polyline through `trail[]` node positions; segments where the event was `in_scope:false` are red; revert segments thicker.
- [ ] Commit `web: city renders + dot moves`.

## 4. Chrome around the canvas (45 min)
- [ ] `/runs/[id]` three-column layout: left claims list (static from `scene.claims`, type badge, verdict badge placeholder), centre city, right tabs `Evidence | Patch | Gate` (empty states for now).
- [ ] `DriftMeter.tsx` above the city: 0–100 bar with four component chips (scope, revert, churn, advisory) from the latest event's `drift`.
- [ ] `Timeline.tsx` under the canvas: `seq` slider; dragging sets `scrubSeq` and sends `{"t":"scrub","seq"}`; when a `scrub` arrives from another client, follow it; "Live" button clears.
- [ ] Agent state pill: running / paused / done / killed with reason.
- [ ] Commit `web: run page chrome`.

## 5. Point at the real replay server (10 min)
- [ ] Remove `?replay=local` default; hit Core's `/runs/demo/scene` + `/ws/runs/demo`. Fix any contract mismatch by raising it, not by patching around it.
- [ ] `pnpm typecheck && pnpm build` green. Commit `web: wired to core replay`.

## Acceptance for H4
- Open `/runs/demo` with Core's replay running: city visible, scope glows, dot walks the trail, trail turns red when it leaves scope, drift meter climbs, timeline scrubs.
- Works with Core down via `?replay=local`.
- No client-side layout; positions come from the server.

## Manual steps you will hit
None in H4. Render, .xyz, Slack/Sheets/GitHub nodes are H20+. If Core's server URL is a LAN IP (for the headset), take it from team chat, put it in `.env.local`, never in code.
