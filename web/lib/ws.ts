// Native WebSocket to /ws/runs/{id}. Server -> store; client -> server is presence only (cursor | select | scrub).
import { CORE_WS_URL } from "@/lib/env";
import type { WsMessage, WsUpstream } from "@/lib/contracts";

export interface RunSocket {
  send: (msg: WsUpstream) => void;
  close: () => void;
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export function connectRun(
  runId: string,
  onMessage: (m: WsMessage) => void,
  onStatus: (s: "connecting" | "open" | "closed") => void,
  onReconnect: () => void,
): RunSocket {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opened = false;

  const open = () => {
    if (closed) return;
    onStatus("connecting");
    ws = new WebSocket(`${CORE_WS_URL}/ws/runs/${runId}`);
    ws.onopen = () => {
      attempt = 0;
      onStatus("open");
      if (opened) onReconnect(); // resync the snapshot: events may have been missed while disconnected
      opened = true;
    };
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (parsed && typeof parsed.t === "string") onMessage(parsed as WsMessage);
      } catch {
        /* malformed frame: ignored, never fatal */
      }
    };
    ws.onclose = () => {
      onStatus("closed");
      if (closed) return;
      timer = setTimeout(open, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
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
