# DESIGN.md — the visual contract (v4, light). Web defines, VR mirrors. Same tokens, same states, same motion.

Rule: the Web owner owns this file. Change a token here first, then `web/lib/design.ts` + `web/app/globals.css`
(and Unity) in the same commit. VR never invents a colour, size, label or animation that isn't listed here.

## Palette (hex; Unity uses the same values via `Color.FromHex`)
| Token | Hex | Used for |
|---|---|---|
| `bg` | `#F4F6FA` | page background |
| `surface` | `#FFFFFF` | cards, panels, the city's base slab |
| `sunken` | `#EEF1F6` | inset areas, tab rails, chips |
| `line` | `#E2E7EF` | borders, dividers, timeline track |
| `text` | `#0F172A` | primary text |
| `muted` / `faint` | `#5B6777` / `#94A0B2` | secondary / tertiary text, idle chips |
| `accent` | `#2F6BFF` | the agent dot, in-scope trail, lit scope district, selection, primary buttons |
| `accent-soft` | `#E7EEFF` | accent backgrounds |
| `danger` | `#E5484D` | out-of-scope trail + writes, FAKE / DEAD / DRIFT / VULN, paused, Kill / Reject |
| `ok` | `#16A34A` | REAL, merged, Approve, trail after approval |
| `warn` | `#D97706` | INCONCLUSIVE, advisory, churn, steered, gates waiting for a human |
| city: `district` | `#EDF1F7` | district (directory) plates; `districtNew` `#F5F2EA` for new construction |
| city: `building` | `#D9DFE8` | a file building, untouched, out of scope |
| city: `buildingScope` | `#A9C1FF` | a file building inside the confirmed scope |
| city: `buildingTouched` | `#2F6BFF` | a building the agent wrote, in scope |
| city: `danger` | `#E5484D` | a building the agent wrote, **out of scope** |
| `ghost` | `#0F172A` @ 20 % | other clients' presence (VR head/hands, web cursors) |

Soft `*-soft` tints (`danger-soft #FDECEC`, `ok-soft #E6F6EC`, `warn-soft #FDF3E4`) are only badge/banner backgrounds.
No other colours, no rainbow. VR (passthrough): use the city tokens; skip `bg`/`surface` page colours.

## The code city (metres; the web scales the same scene to the canvas)
- Ground: 0.8 m × 0.8 m, origin at table centre, Y up, ground at y = 0. White base slab 0.86 m.
- Districts = directories (two levels deep), squarified treemap, 0.012 m streets, plate 0.004 m high.
- Buildings = files, on a grid of lots inside their district; footprint 62 % of the lot; height
  `0.012 + 0.188 · log1p(loc) / log1p(max_loc)` m. Server-computed; clients never lay out.
- Lit scope district: one plate per district holding in-scope buildings, padded 0.014 m, `accent` fill breathing
  between 22 % and 34 % alpha over 4 s, 1 px `accent` outline.
- Agent dot: radius 0.011 m, `accent` (running) / `danger` (paused, killed) / `faint` (done), hovers 0.03 m above
  the roof, a billboard ring pulsing (1 Hz when paused), a small path label above it.
- Trail: arcs between consecutive roofs (height `+0.024 + 0.22 · distance`), 2.6 px, `accent` in scope, `danger`
  out of scope; revert arcs 6 px dashed; after approval in-scope arcs turn `ok`. A 3 mm dot marks every stop.
- Imports: arcs roof-to-roof in `#B7C2D3`, shown for the hovered/selected building (others fade 65 % to white),
  or all at once with the "imports" toggle.
- Claim satellites: icosahedra r 0.008 m orbiting 0.07 m above the scope district at 0.5 rpm; `faint` pending →
  verdict colour, 300 ms pop to 1.4×.
- Selection: `accent` outline box around the building; hover: `muted` outline + tooltip (path, loc, lang, scope, r/w).
- Lighting (web): hemisphere + one shadow-casting sun from the north-east; contact shadow under the slab; light fog.

## States (identical wording and colour on every client)
| State | Dot | Pill | Sound (VR only) |
|---|---|---|---|
| running | `accent`, moving | "Running" `accent` | — |
| paused | `danger`, ring pulse 1 Hz | "Paused — out of scope" / "Paused — reverted its own work" `danger` | one soft ping |
| steered | `accent`, moving | "Steered" `warn` for 2 s → "Running" | — |
| checking | `faint`, still | "Done — checking claims" | — |
| waiting | — | "Waiting for claim review" / "Waiting for approval" `warn` | — |
| killed | `danger`, fades out | "Killed" `danger` | — |
| merged / rejected | still | "Merged" `ok` / "Rejected" `danger` | — |

Drift meter: 0–100 bar, `accent` → `warn` above 40 → `danger` above 70; chips labelled exactly `scope`, `revert`,
`churn`, `advisory` (booleans `danger` when true; churn integer and advisory one decimal `warn` when > 0; else `faint`).
Verdict badges, exact text: `REAL` `FAKE` `DEAD` `DRIFT` `VULN` `INCONCLUSIVE` `PENDING`.
Gate labels, exact text and keys: `Confirm claims` (C) · `Continue` (Space) · `Steer` (S) · `Kill` (K) ·
`Approve` (A) · `Reject` (R). `F` focuses the selection, `Esc` clears selection and scrub. VR palm menu: same words, same order.

## Motion
- The dot flies each arc in 400 ms ease-out; events queue (at most the last few are kept so it stays live).
- State commits instantly; only the dot's visual position lags. Timeline, trail and building colours use the committed `seq`.
- Buildings rise over 700 ms on first load. Satellite pop 300 ms. Camera: auto-frame once, slow idle orbit (90 s/rev)
  until the user touches the canvas, `F` focus over 600 ms, nothing else moves the camera.
- Scrub rewinds the whole city to `seq`: trail, dot and building colours; the label reads "t = seq N".

## Typography
Web: Inter (UI), JetBrains Mono (paths, ids, diffs, numbers). VR: TextMeshPro sans, `text`, 0.012 m, billboarded.

## Layout parity
Web `/runs/{id}`: left claims + drift · centre city + timeline · right Gate / Evidence / Patch. VR: claims left of the
city, evidence right, gate on the palm. VR shows less detail (no diff viewer), never different detail.
