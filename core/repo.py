"""Getting the supervised repo into a run's workdir, and walking it. Any repo: a local folder or a git URL."""

import shutil
import subprocess
from pathlib import Path

IGNORED_DIRS = {
    ".git", ".hg", ".svn", "__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache", ".venv", "venv",
    "env", "node_modules", ".next", "dist", "build", ".tox", ".idea", ".vscode", ".turbo", "coverage",
    ".cache", "target", "Library", "Temp", "Logs", ".gradle", ".DS_Store",
}
BINARY_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".whl", ".so", ".dll",
    ".exe", ".dylib", ".pyc", ".class", ".jar", ".mp3", ".mp4", ".mov", ".woff", ".woff2", ".ttf", ".otf",
    ".sqlite", ".sqlite3", ".db", ".lock", ".bin", ".npy", ".pt", ".onnx", ".glb", ".fbx", ".meta", ".asset",
}


class RepoError(Exception):
    pass


def is_git_url(source: str) -> bool:
    s = source.strip()
    return s.startswith(("http://", "https://", "git@", "ssh://")) or s.endswith(".git")


def _ignore(_dir: str, names: list[str]) -> set[str]:
    return {n for n in names if n in IGNORED_DIRS}


def acquire(source: str, dest: Path) -> None:
    """Copy a local folder, or shallow-clone a git URL, into `dest` (which must not exist yet)."""
    source = source.strip()
    if not source:
        raise RepoError("repo is required: a local folder path or a git URL")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if is_git_url(source):
        try:
            result = subprocess.run(
                ["git", "clone", "--depth", "1", source, str(dest)],
                capture_output=True, text=True, timeout=180,
            )
        except FileNotFoundError as e:
            raise RepoError("git is not installed on the core machine") from e
        except subprocess.TimeoutExpired as e:
            raise RepoError(f"git clone timed out: {source}") from e
        if result.returncode != 0:
            raise RepoError(f"git clone failed: {result.stderr.strip()[-400:]}")
        shutil.rmtree(dest / ".git", ignore_errors=True)
        return
    src = Path(source).expanduser()
    if not src.is_dir():
        raise RepoError(f"not a folder on the core machine: {source}")
    shutil.copytree(src, dest, ignore=_ignore)


def list_files(root: Path, limit: int | None = None) -> list[str]:
    """Repo-relative POSIX paths of text-ish files, ignoring VCS/deps/build folders. Sorted, deterministic."""
    out: list[str] = []
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(part in IGNORED_DIRS for part in rel.parts):
            continue
        if not p.is_file() or p.suffix.lower() in BINARY_SUFFIXES:
            continue
        out.append(rel.as_posix())
        if limit is not None and len(out) >= limit:
            break
    return out


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def normalize_rel(path: str) -> str:
    """Agent-supplied paths: strip leading ./ and /, use forward slashes."""
    p = path.strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def resolve_inside(root: Path, rel: str) -> Path | None:
    """Resolve a repo-relative path; None if it escapes the repo."""
    target = (root / normalize_rel(rel)).resolve()
    base = root.resolve()
    if target != base and base not in target.parents:
        return None
    return target
