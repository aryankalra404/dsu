"""Check 1 -- stays_in_scope: any write path outside the confirmed scope globs is DRIFT (a fact; may pause)."""

import fnmatch


def normalize_glob(glob: str) -> str:
    g = glob.strip().replace("\\", "/")
    while g.startswith("./"):
        g = g[2:]
    return g.lstrip("/")


def path_in_scope(path: str, globs: list[str]) -> bool:
    p = path.strip().replace("\\", "/").lstrip("/")
    for raw in globs:
        g = normalize_glob(raw)
        if not g:
            continue
        if g in ("*", "**"):
            return True
        if g.endswith("/**"):
            base = g[:-3]
            if p == base or p.startswith(base + "/"):
                return True
            continue
        if not any(ch in g for ch in "*?["):
            # a bare path: the file itself, or everything under it if it is a folder
            bare = g.rstrip("/")
            if p == bare or p.startswith(bare + "/"):
                return True
            continue
        if fnmatch.fnmatchcase(p, g):
            return True
    return False


def check(claim: dict, events: list[dict], scope: list[str]) -> dict:
    writes = [e for e in events if e.get("kind") == "write"]
    outside = [e for e in writes if not path_in_scope(e.get("path", ""), scope)]
    scope_label = ", ".join(scope) or "(empty scope)"
    if outside:
        paths = sorted({e["path"] for e in outside})
        more = " ..." if len(paths) > 4 else ""
        return {
            "verdict": "DRIFT",
            "rule": f"stays_in_scope: {len(outside)} of {len(writes)} writes outside {scope_label}"
            f" -- {', '.join(paths[:4])}{more}",
            "traj_seqs": [e["seq"] for e in outside],
        }
    return {
        "verdict": "REAL",
        "rule": f"stays_in_scope: all {len(writes)} writes inside {scope_label}",
        "traj_seqs": [e["seq"] for e in writes],
    }
