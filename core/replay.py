"""Start a replay run from a recording on a running core, and print where to watch it.

    cd core && uv run python replay.py              # lists recordings
    cd core && uv run python replay.py drifting     # POST /runs {replay: "drifting"}
"""

import sys

import httpx

import config


def main() -> int:
    base = config.CORE_BASE_URL
    web = config.env("WEB_BASE_URL", "http://localhost:3000")
    try:
        recs = httpx.get(f"{base}/recordings", timeout=5).json()
    except httpx.HTTPError as e:
        print(f"core is not reachable at {base}: {e}\nstart it first: cd core && uv run python main.py")
        return 1
    if len(sys.argv) < 2:
        print("recordings:")
        for r in recs:
            print(f"  {r['name']:<12} {r['title']}")
        return 0
    r = httpx.post(f"{base}/runs", json={"replay": sys.argv[1]}, timeout=120)
    if r.status_code != 200:
        print(f"error {r.status_code}: {r.text}")
        return 1
    run_id = r.json()["run_id"]
    print(f"run {run_id} created -> {web}/runs/{run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
