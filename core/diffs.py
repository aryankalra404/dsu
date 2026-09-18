"""Unified diffs between two repo trees, and a strict applier (POST /runs/{id}/apply). Hunks must match their
context exactly (searched near the stated line); a hunk that doesn't match fails the whole apply -- no fuzzing."""

import difflib
import re
from pathlib import Path

from repo import list_files, read_text, resolve_inside

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


class PatchError(Exception):
    pass


def make_diff(a_root: Path, b_root: Path) -> str:
    a_files, b_files = set(list_files(a_root)), set(list_files(b_root))
    chunks: list[str] = []
    for rel in sorted(a_files | b_files):
        a = read_text(a_root / rel).splitlines(keepends=True) if rel in a_files else []
        b = read_text(b_root / rel).splitlines(keepends=True) if rel in b_files else []
        if a == b:
            continue
        fromfile = f"a/{rel}" if rel in a_files else "/dev/null"
        tofile = f"b/{rel}" if rel in b_files else "/dev/null"
        lines = list(difflib.unified_diff(a, b, fromfile, tofile, n=3))
        chunks.append("".join(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n"
                              for line in lines))
    return "".join(chunks)


def _file_header(lines: list[str], i: int) -> bool:
    return lines[i].startswith("--- ") and i + 1 < len(lines) and lines[i + 1].startswith("+++ ")


def _parse(diff: str) -> list[tuple[str | None, str | None, list[tuple[int, list[str]]]]]:
    files: list = []
    lines = diff.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        if lines[i].startswith("--- ") and i + 1 < len(lines) and lines[i + 1].startswith("+++ "):
            old = lines[i][4:].strip().split("\t")[0]
            new = lines[i + 1][4:].strip().split("\t")[0]
            old = None if old == "/dev/null" else old.removeprefix("a/")
            new = None if new == "/dev/null" else new.removeprefix("b/")
            hunks: list = []
            i += 2
            while i < len(lines) and not lines[i].startswith("--- "):
                m = HUNK.match(lines[i])
                if not m:
                    i += 1
                    continue
                start = int(m.group(1))
                body: list[str] = []
                i += 1
                while i < len(lines) and lines[i][:1] in (" ", "+", "-", "\\") and not _file_header(lines, i):
                    if lines[i].startswith("\\"):
                        if body:
                            body[-1] = body[-1].rstrip("\n")
                    else:
                        body.append(lines[i])
                    i += 1
                hunks.append((start, body))
            files.append((old, new, hunks))
        else:
            i += 1
    return files


def _apply_hunks(original: list[str], hunks: list[tuple[int, list[str]]], rel: str) -> list[str]:
    out = list(original)
    offset = 0
    for start, body in hunks:
        before = [ln[1:] for ln in body if ln[:1] in (" ", "-")]
        after = [ln[1:] for ln in body if ln[:1] in (" ", "+")]
        want = max(start - 1 + offset, 0) if before else max(start + offset, 0)
        found = None
        for delta in range(0, 40):
            for pos in (want - delta, want + delta):
                if 0 <= pos <= len(out) and out[pos:pos + len(before)] == before:
                    found = pos
                    break
            if found is not None:
                break
        if found is None:
            raise PatchError(f"hunk at line {start} does not apply to {rel}")
        out[found:found + len(before)] = after
        offset += len(after) - len(before)
    return out


def apply_diff(root: Path, diff: str) -> list[str]:
    """Applies all file diffs or none. Returns the repo-relative paths it changed."""
    plan: list[tuple[Path, str | None]] = []
    for old, new, hunks in _parse(diff):
        rel = new or old
        if rel is None:
            continue
        target = resolve_inside(root, rel)
        if target is None:
            raise PatchError(f"path escapes the repo: {rel}")
        if new is None:
            plan.append((target, None))
            continue
        original = read_text(target).splitlines(keepends=True) if (old and target.is_file()) else []
        plan.append((target, "".join(_apply_hunks(original, hunks, rel))))
    if not plan:
        raise PatchError("diff contains no file changes")
    changed = []
    for target, content in plan:
        if content is None:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="")
        changed.append(target.relative_to(root.resolve()).as_posix() if target.is_absolute() else str(target))
    return changed
