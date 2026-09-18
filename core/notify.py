"""Outbound integrations. n8n is the control tower when USE_N8N=true (MVP.md §7); Slack and GitHub are used by
the local gate tree when USE_N8N=false (in n8n mode the workflow's own nodes post them). Each is skipped, with a
note on the run, when its credentials are not configured -- never faked."""

import logging

import httpx

import config

log = logging.getLogger("soc.notify")


async def n8n(payload: dict) -> dict | None:
    """POST to the n8n webhook. Returns n8n's JSON response (if its Respond node sent one)."""
    if not config.N8N_WEBHOOK:
        raise RuntimeError("USE_N8N=true but N8N_WEBHOOK is not set")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(config.N8N_WEBHOOK, json={**payload, "callback": config.N8N_CALLBACK_BASE})
        r.raise_for_status()
        try:
            return r.json()
        except ValueError:
            return None


async def resume_n8n(resume_url: str, body: dict) -> None:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(resume_url, json=body)
        r.raise_for_status()


async def slack(text: str) -> bool:
    if not config.SLACK_WEBHOOK_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(config.SLACK_WEBHOOK_URL, json={"text": text})
        return True
    except httpx.HTTPError as e:
        log.warning("slack post failed: %s", e)
        return False


def claims_table(claims: list[dict], verdicts: list[dict]) -> str:
    by = {v["claim_id"]: v for v in verdicts}
    rows = ["| Claim | Type | Verdict | Rule |", "|---|---|---|---|"]
    for c in claims:
        v = by.get(c["id"], {})
        rows.append(f"| {c['text']} | `{c['type']}` | **{v.get('verdict', 'PENDING')}** | {v.get('rule', '')} |")
    return "\n".join(rows)


async def github(pr: str, state: str, claims: list[dict], verdicts: list[dict]) -> str:
    """pr = "owner/repo#123". Posts the claims table as a PR comment and sets commit status on the head SHA."""
    if not config.GITHUB_TOKEN:
        return "skipped: GITHUB_TOKEN not set"
    try:
        repo, num = pr.split("#", 1)
    except ValueError:
        return f"skipped: github_pr must look like owner/repo#123, got {pr!r}"
    headers = {"Authorization": f"Bearer {config.GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}
    ok = state == "merged"
    async with httpx.AsyncClient(timeout=15, headers=headers, base_url="https://api.github.com") as c:
        prd = await c.get(f"/repos/{repo}/pulls/{num}")
        prd.raise_for_status()
        sha = prd.json()["head"]["sha"]
        body = f"### Spatial SOC verdict: {'approved' if ok else state}\n\n{claims_table(claims, verdicts)}"
        (await c.post(f"/repos/{repo}/issues/{num}/comments", json={"body": body})).raise_for_status()
        (await c.post(f"/repos/{repo}/statuses/{sha}", json={
            "state": "success" if ok else "failure", "context": "spatial-soc/verdict",
            "description": f"human {'approved' if ok else state}"})).raise_for_status()
    return f"posted to {pr}"
