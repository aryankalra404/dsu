"""Advisory AST hints (MVP.md §5). Never verdicts: they are only attached under a claim that already failed a
behavioural check -- the false-positive firewall. Only files the agent wrote are inspected."""

import ast
from pathlib import Path


def _is_url(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value.startswith(("http://", "https://"))


def _literal_const(node: ast.AST | None) -> bool:
    if node is None:
        return False
    if isinstance(node, ast.Constant):
        return node.value is not None
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return all(_literal_const(e) for e in node.elts)
    if isinstance(node, ast.Dict):
        return all(_literal_const(k) and _literal_const(v) for k, v in zip(node.keys, node.values))
    return False


def _swallows(stmt: ast.stmt) -> bool:
    """`pass`, `continue`, bare `return`, or returning a literal / empty container."""
    if isinstance(stmt, (ast.Pass, ast.Continue)):
        return True
    if not isinstance(stmt, ast.Return):
        return False
    v = stmt.value
    if v is None or (isinstance(v, ast.Constant)) or _literal_const(v):
        return True
    return isinstance(v, (ast.List, ast.Tuple, ast.Set)) and not v.elts or isinstance(v, ast.Dict) and not v.keys


def _hints_for_source(rel: str, source: str) -> list[dict]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    out: list[dict] = []
    for stmt in tree.body:
        if isinstance(stmt, (ast.Assign, ast.AnnAssign)) and isinstance(stmt.value, (ast.List, ast.Tuple, ast.Set)):
            urls = [e for e in stmt.value.elts if _is_url(e)]
            if len(urls) >= 2:
                target = stmt.targets[0] if isinstance(stmt, ast.Assign) else stmt.target
                name = target.id if isinstance(target, ast.Name) else "a module constant"
                out.append({"kind": "HARDCODED_DATA", "file": rel, "line": stmt.lineno,
                            "msg": f"`{name}` is a literal list of {len(urls)} URLs"})
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
            t = node.test
            if (isinstance(t.left, ast.Constant) and isinstance(t.left.value, str)
                    and any(isinstance(op, (ast.In, ast.NotIn)) for op in t.ops)):
                out.append({"kind": "KEYWORD_MATCH", "file": rel, "line": node.lineno,
                            "msg": f"decision on a literal keyword: `if {t.left.value!r} in ...`"})
        elif isinstance(node, ast.ExceptHandler):
            if len(node.body) == 1 and _swallows(node.body[0]):
                what = ast.unparse(node.body[0]).strip()
                out.append({"kind": "SWALLOWED_ERROR", "file": rel, "line": node.lineno,
                            "msg": f"exception swallowed: `except: {what}`"})
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = [a.arg for a in node.args.args if a.arg not in ("self", "cls")]
            returns = [n for n in ast.walk(node) if isinstance(n, ast.Return)]
            if args and returns and all(_literal_const(r.value) for r in returns):
                out.append({"kind": "STATIC_RETURN", "file": rel, "line": node.lineno, "fn": node.name,
                            "msg": f"`{node.name}` ignores its inputs and always returns a literal"})
    return out


def collect(workdir: Path, events: list[dict]) -> list[dict]:
    written = sorted({e["path"] for e in events if e.get("kind") == "write" and e.get("path", "").endswith(".py")})
    out: list[dict] = []
    for rel in written:
        f = workdir / rel
        if f.is_file():
            out.extend(_hints_for_source(rel, f.read_text(encoding="utf-8", errors="replace")))
    return out


RELEVANT = {
    "fetches_external": {"HARDCODED_DATA", "SWALLOWED_ERROR"},
    "declares_capability": {"STATIC_RETURN", "SWALLOWED_ERROR"},
    "reasons_on_input": {"KEYWORD_MATCH", "STATIC_RETURN"},
}


def attach(claim: dict, verdict: str, hints: list[dict]) -> list[dict]:
    if verdict not in ("FAKE", "DEAD"):
        return []
    kinds = RELEVANT.get(claim.get("type"), set())
    picked = [h for h in hints if h["kind"] in kinds]
    target = (claim.get("target") or "").split(".")[-1]
    if claim.get("type") == "declares_capability" and target:
        own = [h for h in picked if h.get("fn") == target]
        picked = own or picked
    return [{k: v for k, v in h.items() if k != "fn"} for h in picked[:5]]
