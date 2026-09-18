"""Auto-imported by the Python interpreter inside the sandbox container (installed
into site-packages by sandbox/Dockerfile). Patches outbound HTTP, traces function
calls under /app, and walks /app for defined functions (MVP.md §8).
"""

import ast
import functools
import os
import sys
import time

APP_DIR = "/app"
RUN_START = time.time()

PROBE_INPUT = sys.argv[1] if len(sys.argv) > 1 else ""
CHAOS = os.environ.get("SOC_CHAOS", "")  # "host:status"
HONEYPOT_BASE = os.environ.get("HONEYPOT_BASE", "")
LOCAL_HONEYPOT_BASE = os.environ.get("LOCAL_HONEYPOT_BASE", "http://honeypot-fallback:8000")

SINK_FUNCS = {"execute", "open", "call", "check_output", "Popen"}

HTTP_LOG: list[dict] = []
CALL_LOG: list[dict] = []


def _now_ms() -> int:
    return int((time.time() - RUN_START) * 1000)


def _honeypot_base() -> str:
    return (HONEYPOT_BASE or LOCAL_HONEYPOT_BASE).rstrip("/")


# code running inside /app that tries to call an LLM directly gets redirected
# to the honeypot mock instead of a real API.
os.environ.setdefault("OPENAI_BASE_URL", f"{_honeypot_base()}/openai")


def _chaos_status(alias: str) -> int | None:
    if not CHAOS:
        return None
    chaos_host, _, chaos_status = CHAOS.partition(":")
    return int(chaos_status) if chaos_host == alias else None


def _forward_url(alias: str, path: str, query: str = "") -> str:
    url = f"{_honeypot_base()}/{alias}{path}"
    return f"{url}?{query}" if query else url


def _patch_requests() -> None:
    try:
        import requests
    except ImportError:
        return

    original_request = requests.Session.request

    @functools.wraps(original_request)
    def patched(self, method, url, *args, **kwargs):
        from urllib.parse import urlparse

        parsed = urlparse(url)
        alias = parsed.hostname or ""

        chaos_status = _chaos_status(alias)
        if chaos_status is not None:
            HTTP_LOG.append({"ts": _now_ms(), "method": method, "host": alias, "path": parsed.path, "status": chaos_status})
            resp = requests.Response()
            resp.status_code = chaos_status
            return resp

        forward_url = _forward_url(alias, parsed.path, parsed.query)
        try:
            resp = original_request(self, method, forward_url, *args, **kwargs)
            status = resp.status_code
        except Exception:
            resp = None
            status = None

        HTTP_LOG.append({"ts": _now_ms(), "method": method, "host": alias, "path": parsed.path, "status": status})
        return resp

    requests.Session.request = patched


def _patch_httpx() -> None:
    try:
        import httpx
    except ImportError:
        return

    def _make_patched(original_send, is_async: bool):
        async def patched_async(self, request, *args, **kwargs):
            alias = request.url.host
            chaos_status = _chaos_status(alias)
            if chaos_status is not None:
                HTTP_LOG.append({"ts": _now_ms(), "method": request.method, "host": alias, "path": request.url.path, "status": chaos_status})
                return httpx.Response(chaos_status, request=request)
            request.url = httpx.URL(_forward_url(alias, request.url.path, str(request.url.query or "")))
            resp = await original_send(self, request, *args, **kwargs)
            HTTP_LOG.append({"ts": _now_ms(), "method": request.method, "host": alias, "path": request.url.path, "status": resp.status_code})
            return resp

        def patched_sync(self, request, *args, **kwargs):
            alias = request.url.host
            chaos_status = _chaos_status(alias)
            if chaos_status is not None:
                HTTP_LOG.append({"ts": _now_ms(), "method": request.method, "host": alias, "path": request.url.path, "status": chaos_status})
                return httpx.Response(chaos_status, request=request)
            request.url = httpx.URL(_forward_url(alias, request.url.path, str(request.url.query or "")))
            resp = original_send(self, request, *args, **kwargs)
            HTTP_LOG.append({"ts": _now_ms(), "method": request.method, "host": alias, "path": request.url.path, "status": resp.status_code})
            return resp

        return patched_async if is_async else patched_sync

    if hasattr(httpx, "Client"):
        httpx.Client.send = _make_patched(httpx.Client.send, is_async=False)
    if hasattr(httpx, "AsyncClient"):
        httpx.AsyncClient.send = _make_patched(httpx.AsyncClient.send, is_async=True)


def _trace_calls(frame, event, arg) -> None:
    # 'call' catches pure-Python functions; 'c_call' catches C-implemented
    # builtins like sqlite3.Cursor.execute and open() -- the actual sinks
    # named in MVP.md §5, which a plain 'call'-only filter would miss entirely.
    if event == "call":
        if not frame.f_code.co_filename.startswith(APP_DIR):
            return
        fn_name = frame.f_code.co_name
    elif event == "c_call":
        if not frame.f_code.co_filename.startswith(APP_DIR):
            return
        fn_name = getattr(arg, "__name__", None)
        if fn_name is None:
            return
    else:
        return

    entry = {"ts": _now_ms(), "fn": fn_name}
    if PROBE_INPUT and fn_name in SINK_FUNCS:
        for value in frame.f_locals.values():
            if isinstance(value, str) and PROBE_INPUT in value:
                entry["arg_has_payload"] = True
                break
    CALL_LOG.append(entry)


def _walk_defined() -> list[str]:
    defined = []
    for root, _, files in os.walk(APP_DIR):
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, APP_DIR)
            mod = rel[: -len(".py")].replace(os.sep, ".")
            if mod.endswith(".__init__"):
                mod = mod[: -len(".__init__")]
            try:
                tree = ast.parse(open(path).read())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    defined.append(f"{mod}.{node.name}" if mod else node.name)
    return defined


DEFINED = _walk_defined()

_patch_requests()
_patch_httpx()
sys.setprofile(_trace_calls)
