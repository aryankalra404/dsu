"""Intent -> claims + scope (MVP.md §11 claim extractor, HITL #1 input).

USE_LLM=true: one strict json_schema call. USE_LLM=false: transparent keyword rules over the intent text, and
the run carries a visible note that the human must review them. Either way the human edits and confirms the
list before the agent starts -- the extractor only proposes. Auto claims (scope, churn) are always added."""

import re

import config
from agents import llm

CLAIM_TYPES = ["stays_in_scope", "no_churn", "fetches_external", "declares_capability", "resists_probe",
               "reasons_on_input"]
MAX_CLAIMS = 8

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["claims", "scope", "probe_entry"],
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["type", "text", "target", "axis"],
                "properties": {
                    "type": {"type": "string", "enum": ["fetches_external", "declares_capability", "resists_probe",
                                                        "reasons_on_input"]},
                    "text": {"type": "string"},
                    "target": {"type": ["string", "null"]},
                    "axis": {"type": ["string", "null"]},
                },
            },
        },
        "scope": {"type": "array", "items": {"type": "string"}},
        "probe_entry": {"type": ["string", "null"]},
    },
}

SYSTEM = """You turn a coding task into checkable acceptance claims for a supervisor. Output JSON only.
Claim types (pick exactly one per claim; max 6 claims):
- fetches_external: the code must call an external service. target = its hostname (e.g. api.example.com) if known, else null.
- declares_capability: a named function must exist and actually be called. target = the function name. For "add tests", use target "tests".
- resists_probe: the code must validate/sanitise untrusted input. target null.
- reasons_on_input: an output must depend on the input. axis = the input attribute that should change the output.
scope: repo-relative glob list of where the agent may write, from the task text and the file tree (e.g. "src/payments/**", "tests/**"). Only what the task allows.
probe_entry: "module:function" taking one string argument that handles untrusted input, if one exists in the tree, else null.
Do not judge the code. Only restate what the task promises."""

PATH_TOKEN = re.compile(r"(?<![\w:/.])/?((?:[\w.-]+/)+[\w.-]*|[\w-]+\.(?:py|ts|tsx|js|jsx|go|rs|java|rb|md|json|yaml|yml|toml))")
URL = re.compile(r"https?://([\w.-]+)")
# only explicit function mentions: `name()`, "`name` function", "function `name`"
BACKTICK_FN = re.compile(r"`([A-Za-z_]\w*)\(\)`|`([A-Za-z_]\w*)`\s+function|function\s+`([A-Za-z_]\w*)`")


def auto_claims(scope: list[str]) -> list[dict]:
    where = ", ".join(scope) if scope else "the confirmed scope"
    return [
        {"type": "stays_in_scope", "text": f"only writes inside {where}", "target": None, "axis": None, "source": "auto"},
        {"type": "no_churn", "text": "no reverts, no file rewritten 3+ times", "target": None, "axis": None,
         "source": "auto"},
    ]


def number(claims: list[dict]) -> list[dict]:
    out = []
    for i, c in enumerate(claims, 1):
        out.append({"id": f"c{i}", "type": c["type"], "text": c["text"], "target": c.get("target"),
                    "axis": c.get("axis"), "source": c.get("source", "llm"), "confirmed": False})
    return out


def scope_from_text(text: str, files: list[str]) -> list[str]:
    globs: list[str] = []
    for m in PATH_TOKEN.finditer(URL.sub(" ", text)):
        p = m.group(1).strip("/.")
        if not p or p.startswith("http"):
            continue
        is_file = p in files or re.search(r"\.\w{1,5}$", p.rsplit("/", 1)[-1] or "")
        g = p if is_file else f"{p}/**"
        if g not in globs:
            globs.append(g)
    return globs


def _clauses(text: str) -> list[str]:
    parts = re.split(r"\n+|(?<=[.;!?])\s+|,\s*(?:and\s+)?|\s+and\s+(?=[a-z]+s?\b)", text)
    out = []
    for p in parts:
        p = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", p or "").strip(" .")
        if len(p) > 3 and not p.endswith(":"):
            out.append(p)
    return out


NEGATION = re.compile(r"\b(not|never|cannot|unable|without)\b|n't\b")


def keyword_claims(intent: str, source: str = "rules") -> list[dict]:
    """Promises stated in `intent` (a task, or an agent's summary). Negated clauses are never claims."""
    claims: list[dict] = []
    hosts = URL.findall(intent)
    for clause in _clauses(intent):
        low = clause.lower()
        if NEGATION.search(low):
            continue
        if re.search(r"\btests?\b", low):
            claims.append({"type": "declares_capability", "text": clause, "target": "tests", "axis": None,
                           "source": source})
        elif re.search(r"\b(api|endpoint|service|fetch\w*|http|webhook|live data)\b", low):
            claims.append({"type": "fetches_external", "text": clause, "target": hosts[0] if hosts else None,
                           "axis": None, "source": source})
        elif re.search(r"validat|sanitis|sanitiz|escape|reject invalid", low):
            claims.append({"type": "resists_probe", "text": clause, "target": None, "axis": None, "source": source})
        elif re.search(r"\b(explain\w*|determin\w*|decid\w*|classif\w*|eligib\w*|recommend\w*)\b", low):
            claims.append({"type": "reasons_on_input", "text": clause, "target": None, "axis": None,
                           "source": source})
    for groups in BACKTICK_FN.findall(intent):
        fn = next(g for g in groups if g)
        claims.append({"type": "declares_capability", "text": f"has a `{fn}` function that is used", "target": fn,
                       "axis": None, "source": source})
    return claims


async def extract(intent: str, files: list[str]) -> tuple[list[dict], list[str], str | None, str]:
    """Returns (claims, scope, probe_entry, method) where method is "llm" or "keywords"."""
    if config.USE_LLM:
        tree = "\n".join(files[:400])
        data = await llm.json_call(SYSTEM, f"Task:\n{intent}\n\nRepo file tree:\n{tree}", "claims", SCHEMA)
        scope = [g for g in data.get("scope", []) if isinstance(g, str) and g.strip()]
        proposed = [{**c, "source": "llm"} for c in data.get("claims", []) if c.get("type") in CLAIM_TYPES]
        claims = auto_claims(scope) + proposed
        return number(claims[:MAX_CLAIMS]), scope, data.get("probe_entry"), "llm"
    scope = scope_from_text(intent, files)
    claims = auto_claims(scope) + keyword_claims(intent)
    return number(claims[:MAX_CLAIMS]), scope, None, "keywords"
