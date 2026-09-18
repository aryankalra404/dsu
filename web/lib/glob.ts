// Client-side mirror of core/checks/scope.py path_in_scope -- used ONLY to preview the scope district while the
// human edits globs at the intent gate. The server recomputes everything on confirm; this never decides anything.

function normalize(g: string): string {
  let s = g.trim().replace(/\\/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  return s.replace(/^\/+/, "");
}

function globToRegExp(g: string): RegExp {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") re += ".*"; // fnmatch: * also crosses "/"
    else if (c === "?") re += ".";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function pathInScope(path: string, globs: string[]): boolean {
  const p = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  for (const raw of globs) {
    const g = normalize(raw);
    if (!g) continue;
    if (g === "*" || g === "**") return true;
    if (g.endsWith("/**")) {
      const base = g.slice(0, -3);
      if (p === base || p.startsWith(base + "/")) return true;
      continue;
    }
    if (!/[*?[]/.test(g)) {
      const bare = g.replace(/\/+$/, "");
      if (p === bare || p.startsWith(bare + "/")) return true;
      continue;
    }
    if (globToRegExp(g).test(p)) return true;
  }
  return false;
}
