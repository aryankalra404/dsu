"""The code city (MVP.md §6 scene snapshot). Computed once per run on the server from the actual repo; clients
never run layout. Directories are districts laid out as a squarified treemap on the ground; files are buildings
on a grid of lots inside their district; building height grows with lines of code. Every district keeps spare
lots, and a "new construction" district is reserved, so files the agent creates mid-run get a building
without moving any existing one.

Units: metres, right-handed, Y up, ground at y = 0, city footprint CITY x CITY centred on the origin."""

import ast
import math
import re
from pathlib import Path

import networkx as nx

from checks.scope import path_in_scope
from repo import list_files, read_text

CITY = 0.8  # footprint, metres
STREET = 0.012  # gap between districts
LOT_FILL = 0.62  # building footprint as a fraction of its lot
H_MIN, H_MAX = 0.012, 0.2
NEW_DISTRICT = "~new"
MAX_DISTRICT_DEPTH = 2

JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
JS_IMPORT = re.compile(
    r"""(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}/[^'"]+)['"]"""
    r"""|require\(\s*['"](\.{1,2}/[^'"]+)['"]\s*\)"""
    r"""|import\(\s*['"](\.{1,2}/[^'"]+)['"]\s*\)"""
)


def district_of(path: str) -> str:
    parts = path.split("/")[:-1]
    return "/".join(parts[:MAX_DISTRICT_DEPTH]) if parts else "."


def _lang(path: str) -> str:
    if path.endswith(".py"):
        return "python"
    if path.endswith(JS_EXTS):
        return "js"
    return path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else "file"


def _loc(text: str) -> int:
    return sum(1 for line in text.splitlines() if line.strip())


# ---------------------------------------------------------------- import edges

def _py_module_names(path: str) -> list[str]:
    stem = path[:-3]
    parts = stem.split("/")
    if parts[-1] == "__init__":
        parts = parts[:-1]
    names = [".".join(parts)] if parts else []
    if parts and parts[0] in ("src", "lib") and len(parts) > 1:
        names.append(".".join(parts[1:]))
    return names


def _py_imports(path: str, text: str) -> list[str]:
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []
    pkg = path.split("/")[:-1]
    out: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.extend(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = pkg[: len(pkg) - (node.level - 1)] if node.level > 1 else pkg
                mod = ".".join(base + ([node.module] if node.module else []))
            else:
                mod = node.module or ""
            if mod:
                out.append(mod)
                out.extend(f"{mod}.{a.name}" for a in node.names)
    return out


def _resolve_js(path: str, spec: str, files: set[str]) -> str | None:
    base = Path(path).parent.as_posix()
    raw = (Path(base) / spec).as_posix()
    parts: list[str] = []
    for p in raw.split("/"):
        if p == "..":
            if parts:
                parts.pop()
        elif p not in ("", "."):
            parts.append(p)
    cand = "/".join(parts)
    for suffix in ("", *JS_EXTS, *(f"/index{e}" for e in JS_EXTS)):
        if cand + suffix in files:
            return cand + suffix
    return None


def edges_for(path: str, text: str, files: set[str], py_index: dict[str, str]) -> list[dict]:
    targets: set[str] = set()
    if path.endswith(".py"):
        for mod in _py_imports(path, text):
            parts = mod.split(".")
            for i in range(len(parts), 0, -1):
                hit = py_index.get(".".join(parts[:i]))
                if hit:
                    targets.add(hit)
                    break
    elif path.endswith(JS_EXTS):
        for m in JS_IMPORT.finditer(text):
            spec = next(g for g in m.groups() if g)
            hit = _resolve_js(path, spec, files)
            if hit:
                targets.add(hit)
    targets.discard(path)
    return [{"src": path, "dst": t, "kind": "import"} for t in sorted(targets)]


def py_index_for(files: list[str]) -> dict[str, str]:
    idx: dict[str, str] = {}
    for f in files:
        if f.endswith(".py"):
            for name in _py_module_names(f):
                idx.setdefault(name, f)
    return idx


# ---------------------------------------------------------------- treemap

def _worst(row: list[float], w: float) -> float:
    s = sum(row)
    if not s or not w:
        return math.inf
    return max(max(row) * w * w / (s * s), (s * s) / (w * w * min(row)))


def squarify(values: list[float], x: float, y: float, w: float, h: float) -> list[tuple[float, float, float, float]]:
    """Squarified treemap (Bruls et al.). values must be sorted descending and sum to w*h."""
    rects: list[tuple[float, float, float, float]] = []
    vals = list(values)
    while vals:
        short = min(w, h)
        row = [vals.pop(0)]
        while vals and _worst(row + [vals[0]], short) <= _worst(row, short):
            row.append(vals.pop(0))
        s = sum(row)
        if w >= h:  # lay the row as a column on the left
            cw = s / h if h else 0
            cy = y
            for r in row:
                rh = r / cw if cw else 0
                rects.append((x, cy, cw, rh))
                cy += rh
            x, w = x + cw, w - cw
        else:  # lay the row along the top
            rh = s / w if w else 0
            cx = x
            for r in row:
                rw = r / rh if rh else 0
                rects.append((cx, y, rw, rh))
                cx += rw
            y, h = y + rh, h - rh
    return rects


# ---------------------------------------------------------------- the city

class City:
    """Mutable layout state for one run: districts, lots, buildings. Only the server mutates it."""

    def __init__(self, workdir: Path, scope: list[str], max_files: int):
        self.workdir = workdir
        self.scope = list(scope)
        self.files = list_files(workdir, limit=max_files)
        self.truncated = len(self.files) >= max_files
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, list[dict]] = {}
        self.districts: dict[str, dict] = {}
        self._free: dict[str, list[tuple[float, float]]] = {}
        self._lot: dict[str, float] = {}
        self._max_loc = 1
        self._build()

    # -- construction
    def _build(self) -> None:
        texts = {f: read_text(self.workdir / f) for f in self.files}
        locs = {f: _loc(t) for f, t in texts.items()}
        self._max_loc = max(locs.values(), default=1) or 1

        groups: dict[str, list[str]] = {}
        for f in self.files:
            groups.setdefault(district_of(f), []).append(f)
        slots = {d: len(fs) + max(2, math.ceil(len(fs) * 0.35)) for d, fs in groups.items()}
        slots[NEW_DISTRICT] = max(6, math.ceil(sum(len(fs) for fs in groups.values()) * 0.15))

        order = sorted(slots, key=lambda d: (-slots[d], d))
        total = sum(slots.values())
        area = CITY * CITY
        rects = squarify([slots[d] * area / total for d in order], -CITY / 2, -CITY / 2, CITY, CITY)

        for d, (rx, rz, rw, rd) in zip(order, rects):
            x0, z0 = rx + STREET / 2, rz + STREET / 2
            w, dd = max(rw - STREET, 0.004), max(rd - STREET, 0.004)
            n = slots[d]
            cols = max(1, round(math.sqrt(n * w / dd))) if dd else 1
            rows = math.ceil(n / cols)
            cw, ch = w / cols, dd / rows
            lots = [(x0 + cw * (i % cols + 0.5), z0 + ch * (i // cols + 0.5)) for i in range(n)]
            self._lot[d] = min(cw, ch)
            self._free[d] = lots
            label = "new construction" if d == NEW_DISTRICT else ("(root)" if d == "." else d)
            self.districts[d] = {
                "id": d, "label": label,
                "pos": [round(x0 + w / 2, 5), 0.0, round(z0 + dd / 2, 5)],
                "size": [round(w, 5), round(dd, 5)],
            }

        for d, fs in groups.items():
            for f in fs:
                self._place(f, d, locs[f])

        py_index = py_index_for(self.files)
        fileset = set(self.files)
        for f in self.files:
            self.edges[f] = edges_for(f, texts[f], fileset, py_index)

    def _height(self, loc: int) -> float:
        t = math.log1p(max(loc, 0)) / math.log1p(max(self._max_loc, 1))
        return round(H_MIN + (H_MAX - H_MIN) * min(t, 1.0), 5)

    def _place(self, path: str, district: str, loc: int) -> dict:
        target = district if self._free.get(district) else NEW_DISTRICT
        if self._free.get(target):
            x, z = self._free[target].pop(0)
            lot = self._lot[target]
        else:  # the city is full: extend a row along the south edge, deterministic by count
            k = sum(1 for n in self.nodes.values() if n.get("overflow"))
            lot = 0.04
            x, z = -CITY / 2 + lot * (k % 20 + 0.5), CITY / 2 + lot * (k // 20 + 0.5)
        fp = round(lot * LOT_FILL, 5)
        node = {
            "id": path,
            "label": path.rsplit("/", 1)[-1],
            "module": district,
            "district": target,
            "pos": [round(x, 5), 0.0, round(z, 5)],
            "size": [fp, self._height(loc), fp],
            "loc": loc,
            "lang": _lang(path),
            "in_scope": path_in_scope(path, self.scope),
        }
        if target != district and target != NEW_DISTRICT:
            node["overflow"] = True
        self.nodes[path] = node
        return node

    # -- mutation during a run
    def set_scope(self, scope: list[str]) -> None:
        self.scope = list(scope)
        for n in self.nodes.values():
            n["in_scope"] = path_in_scope(n["id"], self.scope)

    def touch(self, path: str) -> tuple[dict | None, list[dict] | None]:
        """A file was written. Returns (upserted node or None, new outgoing edges or None) for a graph_patch."""
        f = self.workdir / path
        if not f.is_file():
            return None, None
        text = read_text(f)
        loc = _loc(text)
        node = self.nodes.get(path)
        created = node is None
        if created:
            if path not in self.files:
                self.files.append(path)
            node = self._place(path, district_of(path), loc)
        else:
            node["loc"] = loc
            node["size"][1] = self._height(loc)
        fileset = set(self.files)
        new_edges = edges_for(path, text, fileset, py_index_for(self.files))
        changed_edges = new_edges != self.edges.get(path, [])
        self.edges[path] = new_edges
        return node, (new_edges if changed_edges or created else None)

    def ensure_node(self, path: str) -> dict | None:
        """A read of a file the city doesn't know (e.g. beyond the file cap): place it."""
        if path in self.nodes:
            return None
        node, _ = self.touch(path)
        return node

    # -- output
    def scope_nodes(self) -> list[str]:
        return sorted(n["id"] for n in self.nodes.values() if n["in_scope"])

    def fan_in(self) -> dict[str, int]:
        g = nx.DiGraph()
        g.add_nodes_from(self.nodes)
        for es in self.edges.values():
            g.add_edges_from((e["src"], e["dst"]) for e in es if e["dst"] in self.nodes)
        return dict(g.in_degree())

    def graph(self) -> dict:
        return {
            "nodes": list(self.nodes.values()),
            "edges": [e for es in self.edges.values() for e in es],
            "districts": list(self.districts.values()),
            "truncated": self.truncated,
        }
