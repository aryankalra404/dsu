import ast
import fnmatch
from pathlib import Path

import networkx as nx

REPO_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes"
SCOPE_GLOBS = ["features/schemes/**"]
CUBE_SIZE_M = 0.8
SCOPE_LIFT_M = 0.1


def _module_id(path: Path) -> str:
    parts = list(path.relative_to(REPO_ROOT).parts)
    if parts[-1] == "__init__.py":
        parts = parts[:-1]
    else:
        parts[-1] = parts[-1][: -len(".py")]
    return ".".join(parts)


def _is_in_scope(module_id: str) -> bool:
    path_form = module_id.replace(".", "/")
    return any(fnmatch.fnmatch(path_form, glob) for glob in SCOPE_GLOBS)


def _imported_targets(tree: ast.Module) -> set[str]:
    targets: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            targets.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            targets.add(node.module)
    return targets


def build_graph() -> nx.DiGraph:
    graph = nx.DiGraph()
    py_files = [f for f in sorted(REPO_ROOT.rglob("*.py")) if "tests" not in f.parts]

    module_paths = {}
    for f in py_files:
        module_id = _module_id(f)
        module_paths[module_id] = f
        graph.add_node(
            module_id,
            label=module_id.rsplit(".", 1)[-1],
            module=module_id.split(".")[0],
            in_scope=_is_in_scope(module_id),
        )

    for module_id, f in module_paths.items():
        tree = ast.parse(f.read_text())
        for target in _imported_targets(tree):
            if target in module_paths and target != module_id:
                graph.add_edge(module_id, target, kind="import")

    return graph


def compute_scene_graph() -> tuple[dict, list[str]]:
    graph = build_graph()
    pos = nx.spring_layout(graph, dim=3, seed=7) if graph.number_of_nodes() else {}
    scale = CUBE_SIZE_M / 2

    nodes = []
    for node_id, data in graph.nodes(data=True):
        x, y, z = (pos[node_id] * scale).tolist() if node_id in pos else (0.0, 0.0, 0.0)
        if data["in_scope"]:
            y += SCOPE_LIFT_M
        nodes.append(
            {
                "id": node_id,
                "label": data["label"],
                "module": data["module"],
                "pos": [x, y, z],
                "in_scope": data["in_scope"],
            }
        )

    edges = [{"src": src, "dst": dst, "kind": data["kind"]} for src, dst, data in graph.edges(data=True)]
    scope_nodes = [n["id"] for n in nodes if n["in_scope"]]

    return {"nodes": nodes, "edges": edges}, scope_nodes
