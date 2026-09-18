#!/usr/bin/env bash
# Spatial SOC demo helper (MVP.md §14). Works in Git Bash on Windows, macOS and Linux.
#   ./demo.sh start            core on :8000 + web on :3000 (logs in .demo/)
#   ./demo.sh replay [name]    start a replay run (default: drifting) and print its URL
#   ./demo.sh reset            stop, wipe run workdirs + audit log, start again
#   ./demo.sh stop
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .demo

start() {
  (cd core && uv sync -q && nohup uv run python main.py > ../.demo/core.log 2>&1 & echo $! > ../.demo/core.pid)
  (cd web && { [ -d node_modules ] || pnpm install; } && { [ -d .next ] || pnpm build; } \
     && nohup pnpm start -p 3000 > ../.demo/web.log 2>&1 & echo $! > ../.demo/web.pid)
  for _ in $(seq 1 60); do curl -sf localhost:8000/health >/dev/null && break; sleep 1; done
  echo "core: http://localhost:8000   web: http://localhost:3000"
}

stop() {
  for p in core web; do
    [ -f ".demo/$p.pid" ] && kill "$(cat ".demo/$p.pid")" 2>/dev/null || true
    rm -f ".demo/$p.pid"
  done
  echo "stopped"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  reset) stop; rm -rf core/runs core/audit.sqlite3; start ;;
  replay) (cd core && uv run python replay.py "${2:-drifting}") ;;
  *) echo "usage: $0 start|stop|reset|replay [recording]"; exit 1 ;;
esac
