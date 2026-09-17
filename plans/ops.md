# Ops — the rotating hat. Whoever of Web/VR is NOT holding Account 2 does the next unticked item here.

Almost everything here is human clicking. Open a **fresh, short** Claude session only for a specific question ("what JSON body does the n8n HTTP node need for X?"), then close it. Never run a build session and Ops on the same account at the same time.
Tick items, note the result inline, and update the **Ops** block in `STATUS.md`. If an item needs a decision, write it under **Blocked / needs a decision** and move on.

## H0–H4 (do these first; Core and Web are blocked on some of them at H12)
- [ ] Hotspot up; all three laptops + headset on it; laptop B's LAN IP written in `STATUS.md` → Shared.
- [ ] GitHub repo public, everyone cloned, branch protection off, Actions enabled. Actions secret `SOC_GITHUB_TOKEN` added (fine-grained PAT: pull_requests:write, statuses:write).
- [ ] Anthropic auth on Core laptop verified (`ant auth status`) or key in `.env`.
- [ ] n8n running via `docker compose up n8n` on laptop B; owner account created; `N8N_BASIC_AUTH_*` in `.env`; UI reachable at `http://<LAN-IP>:5678` from the other laptops.
- [ ] Slack: channel `#spatial-soc`, incoming webhook created → `SLACK_WEBHOOK_URL` in `.env` on laptop B. Post a test message.
- [ ] Beeceptor: endpoint created → `HONEYPOT_BASE` in `.env`. Add rules: `/gov-schemes-api/*` → canned JSON (ask Core for the file `core/fixtures/beeceptor_rules.json` once it exists), `/v1/messages` and `/v1/chat/completions` → canned completions. **Answer and record here:** is the request log readable via API on the free plan? ______
- [ ] Render account + GitHub connected (no deploy yet).
- [ ] .xyz domain claimed via the sponsor flow; registrar login in team chat.
- [ ] Email to organisers sent (text in `MANUAL_SETUP.md`). Reply, if any: ______
- [ ] Quest 3: Developer Mode, adb pairing, Quest Link, MQDH/scrcpy casting tested with any app. (VR person does this one when *they* are on Ops.)

## H4–H12 (n8n canvas — Core dictates bodies, Ops clicks)
- [ ] Import or build `n8n/workflow.json` skeleton: Webhook `POST /spatial-soc` → Switch on `event`.
- [ ] Branch `claims_extracted`: HTTP → core `/runs/{id}/gate` (which: intent) → Slack → **Wait (resume on webhook)** → HTTP → core `/runs/{id}/start`. Test with `curl` per the payload in MVP.md §6.
- [ ] Branch `traj_event`: IF `drift.scope_violation OR drift.revert` → HTTP gate (pause) → Slack → Wait → Switch on decision → HTTP `/runs/{id}/agent` (resume | steer | kill). Add the 60 s per-run rate limit (n8n "Limit"/static data or a core-side flag — ask Core which).
- [ ] Branch `verdicts_ready`: IF any failing verdict AND `iteration < 3` → `/agents/fix` → `/runs/{id}/apply`; ELSE gate (approve) → Slack → Wait → IF approved → GitHub node (PR comment + commit status) → Sheets/SQLite → `/runs/{id}/final`.
- [ ] Export → `n8n/workflow.json`, commit `n8n: workflow v1`. Re-export after every change.
- [ ] Google Sheets (optional): create "Spatial SOC audit", connect Google credential inside n8n only. If OAuth fights you >20 min, skip; SQLite is the default.
- [ ] GitHub node credential (the PAT) added inside n8n.

## H12–H20
- [ ] Render: deploy `core` (web service) and `web` (Next.js) from the repo; set env vars from `.env.example` with `USE_*=false` (read-only replay demo). Note URLs in `STATUS.md`.
- [ ] Point the .xyz domain at Render.
- [ ] Slides skeleton (5 slides: problem+citations, the 90 seconds, architecture, sponsors/n8n tree, bounded claim). Use the exact wording from MVP.md §1, §2, §14.
- [ ] Stopwatch test prep: recruit 5 non-team people for H26; prepare the text-log view vs city view for "when did the agent leave scope?"

## H20–H28
- [ ] Run the stopwatch test; write numbers into `STATUS.md` → Shared and onto the slide.
- [ ] Record: 30 s full web loop (Core's item, but Ops holds the camera/OBS), 20 s MR clip from the headset cast, 60 s side-by-side web+VR.
- [ ] README.md real version (from MVP.md §1, §2, §4 + GIF + bounded claim + "add to your repo" section).
- [ ] `demo.sh reset` drill ×3 with a stopwatch; must be under 60 s.

## H28–H36
- [ ] Charge everything; spare battery in the bag; hotspot phone on charge.
- [ ] Rehearse the 4-minute script three times with the mouse handed to a "judge".
- [ ] Devfolio submission: repo link, Render URL, video, slides. Submit at least 30 min before the deadline.

## Standing rule
If you are on Ops and every item above is blocked or done, write the next gate's plan for the owner closest to finishing theirs (recipe at the bottom of `STATUS.md`). That needs one short Claude session; take Account 2 only if it's free.
