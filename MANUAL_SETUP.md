# Manual setup — humans only. Do these TONIGHT (17 Sep) so nobody blocks tomorrow.

Tick when done. Claude sessions will ask for anything missing here rather than working around it.

## All three laptops
- [ ] Git configured with your name/email; SSH key on GitHub.
- [ ] Clone the repo once it exists; `cp .env.example .env`.
- [ ] Claude Code signed in. Confirm plan mode works (Shift+Tab twice).
- [ ] Join the hackathon hotspot plan: one phone/laptop hotspot everyone (incl. headset) uses. Write its SSID/password in the team chat, not in the repo.

## Core laptop
- [ ] Docker Desktop installed and running; `docker run hello-world` works.
- [ ] `uv` installed (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- [ ] OpenAI API key with credit → `OPENAI_API_KEY` in `.env`; choose `OPENAI_MODEL` (newest function-calling model on the account; default `gpt-4.1`).
- [ ] n8n: `docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n` once; create the owner account; note credentials in `.env`.
- [ ] Beeceptor: create a free endpoint; note the base URL in `.env` as `HONEYPOT_BASE`. Check whether the request log is readable via API on the free plan (write the answer here: ______ ).
- [ ] Slack: create a workspace or channel `#spatial-soc`; create an Incoming Webhook; paste into `.env`.
- [ ] GitHub: create the public repo `spatial-soc`; create a fine-grained PAT (pull_requests:write, statuses:write); paste into `.env`; add the same token as an Actions secret `SOC_GITHUB_TOKEN`.
- [ ] Google Sheets (optional): create a sheet "Spatial SOC audit"; connect Google credentials inside n8n only.

## Web laptop
- [ ] Node 20 + pnpm installed.
- [ ] Render account created; GitHub connected. (Deploy happens at H20+, but the account takes 10 min and needs a card check.)
- [ ] .xyz domain: claim the sponsor .xyz domain via the hackathon's Devfolio/.xyz instructions; note the registrar login in the team chat.

## VR laptop
- [ ] Unity Hub + **Unity 6000.3.2f1** (exact version — the project is on it) with Android Build Support (SDK/NDK/OpenJDK). Person 3 needs this too (build machine).
- [ ] First open of `vr/` will download Meta XR SDK 205 + NativeWebSocket + Newtonsoft; do it tonight on both the VR laptop and person 3's laptop so the cache is warm. No git-lfs needed.
- [ ] Quest 3: Developer Mode on via the Meta Horizon app; `adb devices` shows it over USB; Quest Link or Air Link paired.
- [ ] Meta Quest Developer Hub installed for casting; or `scrcpy` installed.
- [ ] Spare battery pack + USB-C cable in the bag. Headset fully charged.
- [ ] Which headset exactly? ______ (Quest 3 assumed. Quest 2/Pico changes the pitch from mixed reality to VR.)

## Team
- [ ] Email dsudevhack@dsu.edu.in: "Team Hackatoons, shortlisted idea Spatial SOC (Supervising AI Agent Actions in Real-Time). We are widening what the agent's supervised 'actions' are from a single security patch to the agent's whole run; same product and theme. Flagging in case it matters." (Send tonight.)
- [ ] 20-minute paper stopwatch test: show 3 non-team people a text log vs a hand-drawn city with the path highlighted; ask "when did it leave scope?"; time it. Write the result here: ______
