"""Polygraph shim (MVP.md §8). Auto-imported by the interpreter when this folder is on PYTHONPATH (subprocess
sandbox) or installed into site-packages (Docker sandbox). Configured only by environment:

  SOC_APP_DIR         the supervised repo (default /app); only code under it is traced
  SOC_TRACE           "1" = record calls + sinks for trace.json; "0" = only redirect HTTP (agent dev-loop runs)
  SOC_PROBE_INPUT     probe payload; a sink whose statement/path/command contains it is marked arg_has_payload
  SOC_CHAOS           "host:status" -> synthetic response for that host, nothing forwarded
  SOC_HONEYPOT_BASE   every outbound HTTP request is rewritten to {base}/{host}{path}?{query}

Outbound HTTP is intercepted in urllib, requests and httpx. Sinks are wrapped directly (sqlite3 execute*,
open, subprocess.Popen, os.system), so arg_has_payload is a fact about the actual argument, not a guess."""

import ast
import builtins
import os
import sys
import threading
import time

APP_DIR = os.path.realpath(os.environ.get("SOC_APP_DIR", "/app"))
TRACE = os.environ.get("SOC_TRACE", "1") == "1"
PROBE = os.environ.get("SOC_PROBE_INPUT", "")
CHAOS = os.environ.get("SOC_CHAOS", "")
HONEYPOT = os.environ.get("SOC_HONEYPOT_BASE", "").rstrip("/")
SKIP_PARTS = (os.sep + "site-packages" + os.sep, os.sep + ".venv" + os.sep, os.sep + "node_modules" + os.sep)
T0 = time.time()

HTTP_LOG: list = []
CALL_LOG: list = []
DEFINED: list = []
_seen: set = set()
_rel_cache: dict = {}


def _now() -> int:
    return int((time.time() - T0) * 1000)


def _rel(filename: str):
    """Repo-relative POSIX path for a code filename under APP_DIR, else None. Cached."""
    hit = _rel_cache.get(filename)
    if hit is not None or filename in _rel_cache:
        return hit
    rel = None
    try:
        real = os.path.realpath(filename)
        if real.startswith(APP_DIR + os.sep) and not any(p in real for p in SKIP_PARTS):
            rel = os.path.relpath(real, APP_DIR).replace(os.sep, "/")
    except (ValueError, OSError):
        rel = None
    _rel_cache[filename] = rel
    return rel


def _called_from_app(depth: int = 2) -> bool:
    try:
        return _rel(sys._getframe(depth).f_code.co_filename) is not None
    except ValueError:
        return False


# ------------------------------------------------------------------ HTTP

def _chaos_status(host: str):
    if not CHAOS:
        return None
    h, _, status = CHAOS.rpartition(":")
    return int(status) if h and h.lower() in (host or "").lower() else None


def _forward(host: str, path: str, query: str) -> str:
    url = f"{HONEYPOT}/{host}{path or '/'}"
    return f"{url}?{query}" if query else url


def _log_http(method: str, host: str, path: str, status):
    if not host or (HONEYPOT and host in HONEYPOT):
        return
    HTTP_LOG.append({"ts": _now(), "method": method, "host": host, "path": path, "status": status})


def _patch_urllib():
    import io
    import urllib.error
    import urllib.request
    from urllib.parse import urlsplit

    original = urllib.request.OpenerDirector.open

    def patched(self, fullurl, data=None, *args, **kwargs):
        req = fullurl if isinstance(fullurl, urllib.request.Request) else urllib.request.Request(fullurl, data)
        parts = urlsplit(req.full_url)
        host = parts.hostname or ""
        if HONEYPOT and host and host not in HONEYPOT:
            method = req.get_method()
            chaos = _chaos_status(host)
            if chaos is not None:
                _log_http(method, host, parts.path, chaos)
                raise urllib.error.HTTPError(req.full_url, chaos, "chaos", {}, io.BytesIO(b""))
            req.full_url = _forward(host, parts.path, parts.query)
            try:
                resp = original(self, req, *args, **kwargs)
            except urllib.error.HTTPError as e:
                _log_http(method, host, parts.path, e.code)
                raise
            except Exception:
                _log_http(method, host, parts.path, None)
                raise
            _log_http(method, host, parts.path, getattr(resp, "status", None))
            return resp
        return original(self, fullurl, data, *args, **kwargs)

    urllib.request.OpenerDirector.open = patched


def _patch_requests():
    try:
        import requests
    except ImportError:
        return
    from urllib.parse import urlsplit

    original = requests.Session.request

    def patched(self, method, url, *args, **kwargs):
        parts = urlsplit(url)
        host = parts.hostname or ""
        if not HONEYPOT or not host or host in HONEYPOT:
            return original(self, method, url, *args, **kwargs)
        chaos = _chaos_status(host)
        if chaos is not None:
            _log_http(method, host, parts.path, chaos)
            resp = requests.Response()
            resp.status_code = chaos
            resp.url = url
            resp._content = b""
            return resp
        try:
            resp = original(self, method, _forward(host, parts.path, parts.query), *args, **kwargs)
        except Exception:
            _log_http(method, host, parts.path, None)
            raise
        _log_http(method, host, parts.path, resp.status_code)
        return resp

    requests.Session.request = patched


def _patch_httpx():
    try:
        import httpx
    except ImportError:
        return

    def rewrite(request):
        host = request.url.host or ""
        if not HONEYPOT or not host or host in HONEYPOT:
            return None, host
        chaos = _chaos_status(host)
        if chaos is not None:
            return httpx.Response(chaos, request=request), host
        request.url = httpx.URL(_forward(host, request.url.path, request.url.query.decode() if isinstance(
            request.url.query, bytes) else str(request.url.query or "")))
        return None, host

    sync_send, async_send = httpx.Client.send, httpx.AsyncClient.send

    def send(self, request, *args, **kwargs):
        path = request.url.path
        synthetic, host = rewrite(request)
        if synthetic is not None:
            _log_http(request.method, host, path, synthetic.status_code)
            return synthetic
        resp = sync_send(self, request, *args, **kwargs)
        _log_http(request.method, host, path, resp.status_code)
        return resp

    async def asend(self, request, *args, **kwargs):
        path = request.url.path
        synthetic, host = rewrite(request)
        if synthetic is not None:
            _log_http(request.method, host, path, synthetic.status_code)
            return synthetic
        resp = await async_send(self, request, *args, **kwargs)
        _log_http(request.method, host, path, resp.status_code)
        return resp

    httpx.Client.send = send
    httpx.AsyncClient.send = asend


# ------------------------------------------------------------------ sinks

def _has_payload(value) -> bool:
    if not PROBE:
        return False
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", "replace")
    if isinstance(value, os.PathLike):
        value = os.fspath(value)
    if isinstance(value, str):
        return PROBE in value
    if isinstance(value, (list, tuple)):
        return any(_has_payload(v) for v in value)
    return False


def _sink(fn: str, first_arg) -> None:
    if TRACE and _called_from_app(3):
        CALL_LOG.append({"ts": _now(), "fn": fn, "sink": True, "arg_has_payload": _has_payload(first_arg)})


def _patch_sinks():
    import sqlite3
    import subprocess

    class Cursor(sqlite3.Cursor):
        def execute(self, sql, *a, **k):
            _sink("sqlite3.Cursor.execute", sql)
            return super().execute(sql, *a, **k)

        def executemany(self, sql, *a, **k):
            _sink("sqlite3.Cursor.executemany", sql)
            return super().executemany(sql, *a, **k)

        def executescript(self, sql, *a, **k):
            _sink("sqlite3.Cursor.executescript", sql)
            return super().executescript(sql, *a, **k)

    class Connection(sqlite3.Connection):
        def cursor(self, factory=Cursor):
            return super().cursor(factory)

        def execute(self, sql, *a, **k):
            _sink("sqlite3.Connection.execute", sql)
            return super().execute(sql, *a, **k)

        def executemany(self, sql, *a, **k):
            _sink("sqlite3.Connection.executemany", sql)
            return super().executemany(sql, *a, **k)

        def executescript(self, sql, *a, **k):
            _sink("sqlite3.Connection.executescript", sql)
            return super().executescript(sql, *a, **k)

    original_connect = sqlite3.connect

    def connect(*a, **k):
        k.setdefault("factory", Connection)
        return original_connect(*a, **k)

    sqlite3.connect = connect

    original_open = builtins.open

    def soc_open(file, *a, **k):
        _sink("open", file)
        return original_open(file, *a, **k)

    builtins.open = soc_open

    original_popen_init = subprocess.Popen.__init__

    def popen_init(self, args, *a, **k):
        _sink("subprocess.Popen", args)
        return original_popen_init(self, args, *a, **k)

    subprocess.Popen.__init__ = popen_init

    original_system = os.system

    def system(cmd):
        _sink("os.system", cmd)
        return original_system(cmd)

    os.system = system


# ------------------------------------------------------------------ calls + definitions

def _profile(frame, event, arg):
    if event != "call":
        return
    code = frame.f_code
    rel = _rel(code.co_filename)
    if rel is None:
        return
    fn = f"{rel}:{getattr(code, 'co_qualname', code.co_name)}"
    if fn not in _seen:
        _seen.add(fn)
        CALL_LOG.append({"ts": _now(), "fn": fn})


def _walk_defined() -> list:
    out = []
    skip = {".git", "__pycache__", ".venv", "venv", "node_modules", ".pytest_cache", "site-packages"}
    for root, dirs, files in os.walk(APP_DIR):
        dirs[:] = [d for d in dirs if d not in skip]
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, APP_DIR).replace(os.sep, "/")
            try:
                with builtins.open(path, encoding="utf-8", errors="replace") as fh:
                    tree = ast.parse(fh.read())
            except (SyntaxError, OSError, ValueError):
                continue
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    out.append(f"{rel}:{node.name}")
                elif isinstance(node, ast.ClassDef):
                    for sub in node.body:
                        if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            out.append(f"{rel}:{node.name}.{sub.name}")
    return sorted(out)


def trace_payload() -> dict:
    return {"http": HTTP_LOG, "calls": CALL_LOG, "defined": DEFINED}


if HONEYPOT:
    _patch_urllib()
    _patch_requests()
    _patch_httpx()
if TRACE:
    DEFINED.extend(_walk_defined())
    _patch_sinks()
    sys.setprofile(_profile)
    threading.setprofile(_profile)
