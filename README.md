# Spatial SOC

Real-time supervision for coding agents. Point it at **any repository** with a one-line task: it turns the task into
checkable claims and a write scope you confirm, runs the agent inside a harness that records every file read, write,
command and HTTP call, and shows the run live as a **3D code city** — directories are districts, files are buildings, the
agent is a dot flying across the rooftops, your scope is the lit district. The moment the agent writes outside scope or
reverts its own work it is **paused before its next tool call**; you continue, steer or kill it. When it finishes, every
claim is ticked or crossed by a deterministic rule over the trajectory and sandbox traces. The LLM never judges.

> **Bounded claim.** Spatial SOC proves when an agent drifted, faked a capability, or claimed something it didn't do.
> It does not prove the agent's code is correct.

Team Hackatoons · DSU DevHack 3.0 · Agentic AI track.

## Run it (offline, no keys, no Docker)

```bash
# core (Python 3.11, uv)
cd core && uv sync && uv run python main.py          # http://localhost:8000
# web (Node 20, pnpm) — in a second terminal
cd web && pnpm install && pnpm dev                   # http://localhost:3000
```

Open http://localhost:3000 → **New run** → **Replay a recording** → *drifts out of scope* → **Extract claims**.
Review the claims and scope, press **C**, and watch the agent leave the district and get paused.
Or from a shell: `./demo.sh start` then `./demo.sh replay drifting`.

With `USE_LLM=false` (the default) runs replay a recorded agent (`core/fixtures/runs/`) through the real harness —
every tool call, check, pause and verdict executes for real. The two bundled recordings are real GPT-5.5 runs on a small
example repo; they're examples, not the product.

## Supervise a live agent on your own repo

1. `cp .env.example .env`, set `USE_LLM=true`, `OPENAI_API_KEY`, `OPENAI_MODEL` (needs tools + json_schema on Chat Completions).
2. Restart the core. **New run → Live agent**: a local folder path or a git URL, and the task. Say where it may write
   (e.g. "…only under `src/payments`") — the extractor proposes the scope, you confirm it.
3. Optional: a probe entrypoint (`module:function` taking one string) enables the exploit probes; a Python test suite
   enables the happy / chaos executions. Without them those claims are honestly `INCONCLUSIVE`.
4. Save a finished live run as a recording (Gate tab) to replay it offline later.

## How it's built

| | |
|---|---|
| `core/` | FastAPI + WebSocket hub. `orchestrator.py` is the pipeline and local gate tree; `harness/` the hand-written tool loop, gate control and trajectory recorder; `checks/` the five deterministic rules (no LLM imports, enforced by a test); `agents/` claim extraction, summary claims and the Fixer (OpenAI SDK); `scene/` the code-city layout and run state; `sandbox/` executions under the polygraph shim; `honeypot.py` answers all outbound HTTP. |
| `sandbox/` | `polygraph_shim/sitecustomize.py` (records calls, rewrites HTTP to the honeypot, wraps SQL/open/subprocess sinks) and `runner.py`. Docker image for `USE_SANDBOX=true`. |
| `web/` | Next.js 15, React Three Fiber, zustand, Tailwind. Light theme. `/`, `/runs/new`, `/runs/[id]`, `/history`. |
| `n8n/workflow.json` | The control tower for `USE_N8N=true` (intent gate, live pause with rate limit, Fixer loop, approval). |
| `.github/workflows/spatial-soc.yml` + `core/ci.py` | Re-checks an agent's PR from its saved run record; red check + claims table comment on failure. |
| `vr/` | Unity / Quest 3 client (mirrors the web; see `vr/CLAUDE.md`). |

Flags: `USE_LLM`, `USE_N8N`, `USE_SANDBOX`, `USE_BEECEPTOR` — each layer degrades independently and the UI says so.

## Tests

```bash
cd core && uv run pytest          # checks, city layout, shim, diffs, loop, full offline pipeline, n8n protocol
cd web && pnpm typecheck && pnpm lint && pnpm build
```

Specs: `MVP.md` (product + contracts, §0.9 lists the v4 changes), `DESIGN.md` (visual contract), `STATUS.md` (handoff).
