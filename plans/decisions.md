# Decisions log — append, never rewrite. One line each: time, owner, decision, why.

- 17 Sep 23:xx · team · v3 adopted: supervise the whole agent run live; web is the product; VR complements; n8n is the control tower. See MVP.md.
- 18 Sep 01:15 · VR · Reused the old Quest project (OVRCameraRig + Passthrough building block + hands) instead of creating a new one; deleted circuit assets/builds/backups; replaced Socket.IO with NativeWebSocket; dropped LFS gitattributes; moved to `vr/`, inner .git removed.
- 18 Sep 01:30 · team · Runtime LLM = OpenAI (user has a key). `openai` SDK, Chat Completions + tools, hand-written loop; no Anthropic SDK in the product. Model via `OPENAI_MODEL`, default gpt-4.1 until Core confirms what the account exposes.
