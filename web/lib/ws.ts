// Native WebSocket to /ws/runs/{id}. Server → store; client → server is presence only (cursor|select|scrub).
import { CORE_WS_URL } from "@/lib/env";
import type { WsMessage, WsUpstream } from "@/lib/contracts";

export interface RunSocket {
  send: (msg: WsUpstream) => void;
  close: () => void;
}

export interface RunSocketHandlers {
  onMessage: (msg: WsMessage) => void;
  onStatus: (status: "connecting" | "open" | "closed") => void;
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export function connectRun(runId: string, handlers: RunSocketHandlers): RunSocket {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (closed) return;
    if (!CORE_WS_URL) {
      handlers.onStatus("closed");
      return;
    }
    handlers.onStatus("connecting");
    ws = new WebSocket(`${CORE_WS_URL}/ws/runs/${runId}`);
    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus("open");
    };
    ws.onmessage = (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return; // malformed frame: ignore, never fatal
      }
      if (parsed && typeof parsed === "object" && typeof (parsed as { t?: unknown }).t === "string") {
        handlers.onMessage(parsed as WsMessage);
      }
    };
    ws.onclose = () => {
      handlers.onStatus("closed");
      if (closed) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(open, delay);
    };
    ws.onerror = () => {
      // onclose follows; reconnect is handled there.
    };
  };

  open();

  return {
    send: (msg) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}
