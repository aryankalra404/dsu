import ast
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent
BANNED = {"openai", "anthropic", "langchain"}

GUARDED_PATHS = [
    *CORE.glob("checks/**/*.py"),
    CORE / "harness" / "trajectory.py",
]


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module.split(".")[0])
    return modules


def test_no_llm_sdk_in_engine():
    offenders = {}
    for path in GUARDED_PATHS:
        if not path.exists() or not path.is_file():
            continue
        hit = _imported_modules(path) & BANNED
        if hit:
            offenders[str(path.relative_to(CORE))] = hit
    assert not offenders, f"LLM SDK imported in engine code: {offenders}"
