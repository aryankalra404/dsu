# Web owner — read root CLAUDE.md and MVP.md §6, §9, §13 first

You own `web/`. The web app is the complete product; VR mirrors it. Nothing ships VR-first.

Order of work (H4): Next.js skeleton → `/runs/[id]` page → R3F city from `GET /runs/demo/scene` → dot moves on `traj_event` from `ws://localhost:8000/ws/runs/demo` (Core's replay server) → drift meter.
H12: claims list editable + confirm, Gate tab (Continue / Steer / Kill / Approve / Reject) wired over HTTP, timeline scrubber.

Rules specific to Web:
- You own `DESIGN.md` (the visual contract). Implement it exactly; when you need a new token, state or label, add it there first, then use it. VR copies whatever is in that file, so keep it current and freeze it at H12.
- Render only what the server sends. No client-side layout physics; positions come from `scene.graph.nodes[].pos`.
- Decisions go over HTTP (`POST /runs/{id}/decision`), never WS. WS upstream is cursor / select / scrub only.
- One accent colour for "lit", red for fail/out-of-scope, green for real, grey pending. No rainbow.
- Every panel has loading, empty and error states. Must run with all `USE_*` flags off (replay mode).
- 1280 px projector-safe, dark theme. `pnpm typecheck && pnpm build` before every commit.
- After H12 you also own the n8n Slack / Sheets / GitHub nodes (credentials are manual — ask), Render deploy and the .xyz domain.
