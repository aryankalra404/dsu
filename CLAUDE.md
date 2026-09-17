# Spatial SOC — instructions for every Claude session in this repo

## The map: what each file is and when to read it

| File | What it is | Read it when |
|---|---|---|
| `CLAUDE.md` (this) | Rules for how to work here. Auto-loaded. | Always. |
| `<owner>/CLAUDE.md` (`core/`, `web/`, `vr/`) | Owner-specific rules and build order. | Working in that directory. |
| `MVP.md` | **The product spec. Single source of truth.** Principles, scope, architecture, contracts (§6), checks (§5), n8n tree (§7), gates (§13), demo, risks. | Before any planning or coding. Re-read the section you're touching. |
| `DESIGN.md` | The visual contract: colours, sizes, states, labels, motion. Web owns, VR mirrors. | Any UI work, web or VR. |
| `STATUS.md` | Live handoff board: per-owner done / in progress / blocked / next. | Start of every session; update at the end and on every block. |
| `plans/<owner>-H<gate>.md` | The ordered checklist for one owner, one gate. Tick items as you go. | Executing or writing a gate. |
| `plans/decisions.md` | Append-only log of timeboxed calls and fallbacks taken. | Before re-deciding anything; after taking a fallback. |
| `MANUAL_SETUP.md` | Human-only setup checklist (installs, accounts, keys, headset). | When a manual step comes up — check if it's already listed. |
| `.env.example` | Every environment variable with a comment. Real values live in `.env` (gitignored). | When you need a secret or config value. |
| `README.md` | For judges and GitHub visitors. Written at H28. | Not before H20. |
| `.mcp.json` (root and `vr/`) | Unity MCP bridge config with absolute paths for the VR laptop. | Only person 2's machine; others ignore it. |

**Session start ritual:** read `CLAUDE.md` → `STATUS.md` → your `<owner>/CLAUDE.md` → your current `plans/` file → the `MVP.md` sections it cites. Then plan or execute. Nothing else is required reading.

Read `MVP.md` before doing anything. It is the single source of truth. §6 contracts are law. §3 OUT list wins on scope. `DESIGN.md` is the visual contract: Web defines it, VR mirrors it; neither client invents a colour, size, label or animation that isn't in it.
Three people, **two Claude seats**. **Core** owns `core/`, `sandbox/`, `n8n/`, `.github/`; **Web+VR** is one person owning `web/`, `vr/` and `DESIGN.md`; **Ops** is the third person with no Claude — see `plans/ops.md`.
- **Person 1 (Claude + VS Code): Core.** Full time.
- **Person 2 (Claude + VS Code + Unity MCP): Web first, then VR.** Each gate: hit the web target, then mirror it in Unity. Web is the product; VR is the reveal and may lag 2–3 h. If overloaded at H12, VR drops to view-only (MVP.md §3 cut order).
- **Person 3 (no Claude): Ops + hands.** n8n canvas, accounts, keys, deploys, slides, recordings, the stopwatch test — and all Unity editor GUI steps, headset pairing, adb, APK builds and casting. Person 3 has Unity installed and pulls person 2's commits to build and test on device.
Manual Unity steps: Claude on person 2's machine writes the click-by-click list into `STATUS.md` → **For Ops**; person 3 executes it and reports back. Person 2 does not stop coding to click.
Do not edit another owner's directory unless the task explicitly says so. Shared files (`MVP.md`, `docker-compose.yml`, `demo.sh`, this file) are edited only when the human confirms.

## Token discipline (two accounts for three people — this matters)
- Plan mode first, then execute the plan; never explore the repo by reading whole directories. Read the files the plan names.
- `/clear` between plan items. Do not carry a 100k-token context into a new task.
- Ask for a file's specific lines/sections, not the whole file, when it is large (`MVP.md` is large — read the cited sections).
- Generate code in one pass per file; avoid rewrite-the-whole-file loops. Prefer targeted edits.
- Person 2 alternates web and VR plan items; `/clear` between them so Unity context and Next.js context never mix.
- Ops has no Claude. If person 3 needs a one-line answer, person 1 or 2 asks it between items; nobody opens a third session.

## How to work

1. **Plan before code for anything bigger than one file.** Enter plan mode, read the relevant MVP.md sections, write the plan to `plans/<owner>-<gate>.md` as a checklist, get a yes, then execute and tick items off as you go. Never try to build a whole gate in one shot.
2. **One gate at a time.** Gates are H4 → H12 → H20 → H28 (MVP.md §13). Do not start H12 work while an H4 item is open.
3. **Contracts first.** If a task needs a new field, event, or endpoint, propose the change to MVP.md §6 and stop for confirmation. Then update core, web and Unity in the same commit.
4. **Fixtures, not mocks-in-code.** Anything that stands in for the LLM, n8n, Docker or Beeceptor lives in `core/fixtures/` and is switched by the `USE_*` flags. Never hardcode claims, verdicts, trajectories or diffs anywhere else.
5. **Tests are the acceptance.** `core/tests/test_checks_on_fixtures.py` and `test_no_llm_in_engine.py` must pass before a Core commit. Web: `pnpm typecheck` and `pnpm build`. VR: the scene runs in the editor against the replay server.
6. **Commit small, commit often**, from the owner's own directory, message `core|web|vr: <what>`. Never commit `.env`, keys, tokens, `node_modules`, Unity `Library/`.
7. **Stay honest in status.** If something is stubbed, say "stubbed" in the commit and in the UI badge. If a test fails, report it; do not narrow it.
8. **Keep `STATUS.md` current.** After every finished plan item, every blocked/manual step, and before a session ends or is cleared, update your owner's block in `STATUS.md` (done / in progress / blocked / next / open questions for others). It is the handoff document: any free Claude session on any laptop reads `STATUS.md` + `plans/` + `plans/decisions.md` and can write the next plan for any owner. Never rewrite another owner's block; append a question under "For <owner>" instead.

## Manual steps: ASK, never work around

Some things only a human can do: API keys, OAuth logins, account creation, installing Docker/Unity/n8n, pairing the headset, buying the domain, pasting Slack webhooks, enabling GitHub Actions secrets.

When you hit one of these:
- **Stop and ask** with the exact step written out (what to click, what to copy, where to paste). Use AskUserQuestion when available.
- Add the variable to `.env.example` with a comment. Never put a real value in any tracked file. Never invent, guess, or "temporarily" hardcode a key, token, URL or account.
- Never pick a worse design to avoid a manual step (e.g. skipping the honeypot because Beeceptor needs signup, or polling instead of a webhook because Slack needs a token). Ask, and continue on something else meanwhile.
- Keep `MANUAL_SETUP.md` current: if you discover a new manual step, append it there.

Secrets are read only from environment variables loaded from `.env` (gitignored). The LLM calls use the `openai` SDK with `OPENAI_API_KEY` and `OPENAI_MODEL` from `.env`. Claude Pro is the tool we build with, not the runtime model. Do not add the `anthropic` SDK.

## Stack (do not substitute)

Core: Python 3.11, FastAPI, `uv`, `ruff`, `openai` Python SDK (Chat Completions + `tools`, hand-written loop in `core/harness/loop.py`, model from `OPENAI_MODEL`), `networkx`, Docker, SQLite, n8n self-hosted.
Web: Next.js 15 App Router, TypeScript strict, pnpm, React Three Fiber + drei, Tailwind, shadcn/ui, Framer Motion, zustand (store), native WebSocket.
VR: Unity 6 LTS, C#, Meta XR SDK via OpenXR, NativeWebSocket, Quest 3.
Not used: LangChain, vector DBs, Socket.IO, WebXR, Unity Netcode, Postgres, ORMs.

## Unblocking each other

Core's first deliverable (hour 1) is `core/fixtures/runs/drifting/trajectory.jsonl` plus `python -m core.replay` which serves `GET /runs/demo/scene` and streams the recorded events on `/ws/runs/demo` at 4×. Web and VR build against that from hour 1 and never wait for the real engine.
