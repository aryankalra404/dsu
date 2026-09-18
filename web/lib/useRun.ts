"use client";
// Wires one run into the store: GET /runs/{id} (full detail), then the WebSocket. Resyncs on reconnect.
import { useEffect } from "react";
import { api } from "@/lib/api";
import { connectRun, type RunSocket } from "@/lib/ws";
import { useRun } from "@/lib/store";
import type { WsUpstream } from "@/lib/contracts";

let socket: RunSocket | null = null;

/** Presence upstream (cursor | select | scrub). No-op while disconnected. */
export function sendUpstream(msg: WsUpstream) {
  socket?.send(msg);
}

export function useRunConnection(runId: string) {
  useEffect(() => {
    const store = useRun.getState();
    store.reset(runId);
    let cancelled = false;

    const resync = async () => {
      try {
        const d = await api.detail(runId);
        if (!cancelled) useRun.getState().load(d);
        return d;
      } catch (e) {
        if (!cancelled) useRun.getState().setLoadError(e instanceof Error ? e.message : String(e));
        return null;
      }
    };

    (async () => {
      const d = await resync();
      if (cancelled || !d || d.archived) return; // an archived run has no live stream
      socket = connectRun(
        runId,
        (m) => useRun.getState().apply(m),
        (s) => useRun.getState().setWs(s),
        () => void resync(),
      );
    })();

    return () => {
      cancelled = true;
      socket?.close();
      socket = null;
    };
  }, [runId]);
}
