# DESIGN.md — the visual contract. Web defines, VR mirrors. Same tokens, same states, same motion on both clients.

Rule: **Web owner owns this file.** Change a token here first, then web and Unity in the same commit. VR never invents a colour, size, or animation that isn't listed. If VR needs something that isn't here, ask Web to add it.
Frozen at H12. After that only bug fixes.

## Palette (hex; Unity uses the same values in linear space via `Color.FromHex`)
| Token | Hex | Used for |
|---|---|---|
| `bg` | `#0B0F14` | web page background; VR: not used (passthrough) |
| `node-dim` | `#3A4250` @ 35 % alpha | out-of-scope nodes (10 % was invisible on the projector; raised 18 Sep) |
| `node-scope` | `#9FB3C8` @ 85 % alpha | in-scope nodes |
| `edge-dim` | `#2A313C` @ 45 % alpha | all edges by default, and the floor grid |
| `accent` | `#39D0FF` | the agent dot, live highlights, "lit" claim satellites, selected ring, scope district glow |
| `danger` | `#FF3B5C` | out-of-scope trail segments, FAKE / DEAD / DRIFT / VULN, paused state |
| `ok` | `#3DFF9A` | REAL verdicts, applied/merged state, in-scope trail after approval |
| `warn` | `#FFB43A` | advisory hints, churn (pre-threshold), INCONCLUSIVE |
| `ghost` | `#FFFFFF` @ 20 % alpha | presence ghosts (other client's head/hands/cursor) |
| `text` | `#E6EDF3` | labels |

No other colours. No gradients except the district glow. No rainbow.

## Atmosphere (both clients)
- **Bloom** on emissive materials only: threshold 0.55, intensity 0.9, radius 0.6. Bloom is what makes `accent` and `danger` read as light. Dim nodes must stay below the threshold.
- **Fog** in `bg` from 1.2 m to 3.5 m (web). VR: none (passthrough).
- **Floor grid**: `edge-dim`, 5 cm cells, 25 cm sections, fading out at 1.6 m, at y = −0.4 m (the bottom of the cube). Web only; in VR the real table is the floor.
- **Labels**: scope nodes and the agent's current node always show a small mono label (`text` @ 70 %, 11 px). Other nodes label on hover only.
- **Idle orbit** (web only): the camera orbits slowly (one revolution per ~90 s) until the user touches the canvas, then never again for that session. VR: the user moves.
- **Auto-frame**: on scene load the web camera frames the node bounding box once; no other automatic camera moves except `F`.

## Geometry (metres in VR; web scales the same 0.8 m cube to the canvas)
- City bounding cube: **0.8 m**, origin at table centre, Y up.
- Node radius: `0.006 + 0.004 * clamp(fan_in / 10, 0, 1)` m. In-scope nodes +20 %. `fan_in` is not in the snapshot: both clients compute it as the number of `graph.edges` whose `dst` is the node (a count, not layout).
- Edge width: 0.0008 m (web: 1 px line).
- Agent dot radius: **0.012 m**, emissive `accent`, bloom/glow ×1.5, particle tail 0.5 s.
- Trail width: 0.002 m; in-scope segments `accent` @ 60 % alpha; out-of-scope segments `danger`; **revert segments ×2 width** and drawn as a doubled line; after final approval the whole trail fades to `ok` over 1 s.
- Scope district: convex hull (web) / bounds box (VR) around `scope_nodes`, padded 0.03 m, fill `accent` @ 6 % alpha, edge `accent` @ 35 % alpha, slow breathing glow (4 s period, ±20 % alpha).
- Claim satellites: small icosahedra radius 0.008 m orbiting the district at 0.5 rpm, colour grey (`node-scope`) pending → `ok` / `danger` on verdict, with a 300 ms pop scale to 1.4 and back.
- Selected node: ring radius 1.8× node, `accent` (or the selecting client's presence colour), 2 px / 0.001 m.
- Presence: other client's head = translucent `ghost` capsule 0.18 m; hands = `ghost` spheres 0.02 m at wrist + fingertips; web mouse cursor in VR = `ghost` sphere 0.015 m with a `text` name tag; VR head/hands on web = `ghost` wireframe capsule + dots.

## States (identical wording and colour on both clients)
| State | Dot | HUD / pill | Sound (VR only, short) |
|---|---|---|---|
| running | `accent`, moving | "Running" `accent` | — |
| paused | `danger`, frozen, ring pulse 1 Hz | "Paused — out of scope" `danger` | one soft ping |
| steered | `accent`, moving, brief `warn` flash | "Steered" `warn` 2 s → "Running" | — |
| done | `node-scope`, stops | "Done — checking claims" `text` | — |
| killed | `danger`, fades out | "Killed" `danger` | — |
| merged / rejected | dot hidden; trail `ok` / stays `danger` | "Merged" `ok` / "Rejected" `danger` | — |

Drift meter: 0–100 bar, `accent` → `warn` above 40 → `danger` above 70, four component chips labelled exactly: `scope`, `revert`, `churn`, `advisory`. Boolean chips (`scope`, `revert`) are `danger` when true and `node-dim` when false; `churn` shows the count (`warn` when > 0); `advisory` shows one decimal (`warn` when > 0). Chip states from `drift`: `scope` and `revert` are booleans — `danger` fill when true, `node-dim` when false, no number; `churn` shows the integer, `warn` when > 0 else `node-dim`; `advisory` shows one decimal (`0.2`), `warn` when > 0 else `node-dim`. Before the first event all four are `node-dim` and the bar is empty.
Verdict badges, exact text: `REAL` (`ok`), `FAKE` (`danger`), `DEAD` (`danger`), `DRIFT` (`danger`), `VULN` (`danger`), `INCONCLUSIVE` (`warn`), `PENDING` (`node-scope`).
Gate labels, exact text: `Confirm claims` · `Continue` · `Steer` · `Kill` · `Approve` · `Reject`. VR palm menu uses the same words in the same order.

## Motion
- Dot moves between nodes with ease-out over **400 ms** per event (replay at 4× still 400 ms; events queue).
- State commits instantly, only the dot lags: every `traj_event` updates trail, drift, seq and HUD the moment it arrives; only the dot's *visual* position goes through the 400 ms queue. Scrub, timeline and trail always use the committed `seq`, never the dot's animated position.
- Trail segment draws in over the same 400 ms.
- Verdict arrival: satellite pop 300 ms; badge fade 200 ms.
- Camera (web): no auto-camera moves except `F` (focus selected) over 600 ms. VR: never move the city; the user moves.
- Scrub: both clients render the trail truncated at `seq` and the dot at that node; a thin `text` tick on the timeline / a floating `text` label "t = seq 17" in VR.

## Typography
Web: Inter (UI), JetBrains Mono (ids, paths, diffs). VR world-space labels: TextMeshPro default sans, `text`, 0.012 m cap height, always billboarded.

## Layout parity
Web `/runs/{id}`: left claims · centre city · right Evidence/Patch/Gate. VR: the same three groups as world-space panels — claims to the left of the city, evidence/patch to the right, gate on the palm. Same order, same labels. VR shows less detail (no diff viewer), never different detail.
