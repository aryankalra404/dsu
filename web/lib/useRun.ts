"use client";
// Wires one run into the store: scene over HTTP, then events over WS (or the local fixture player).
import { useEffect, useRef } from "react";
import { getScene } from "@/lib/api";
import { connectRun, type RunSocket } from "@/lib/ws";
import { loadLocalEvents, loadLocalScene, playLocal } from "@/lib/localReplay";
import { useRunStore, type Source } from "@/lib/store";
import type { WsUpstream } from "@/lib/contracts";

export function useRun(runId: string, source: Source) {
  const socketRef = useRef<RunSocket | null>(null);

  useEffect(() => {
    const store = useRunStore.getState();
    store.reset(runId, source);
    store.setSceneStatus("loading");
    let cancelled = false;
    let stopLocal: (() => void) | null = null;

    (async () => {
      try {
        const scene = source === "local" ? await loadLocalScene() : await getScene(runId);
        if (cancelled) return;
        useRunStore.getState().setScene(scene);
      } catch (err) {
        if (cancelled) return;
        useRunStore.getState().setSceneStatus("error", err instanceof Error ? err.message : String(err));
        return;
      }

      if (source === "local") {
        const events = await loadLocalEvents();
        if (cancelled) return;
        useRunStore.getState().setWsStatus("open");
        stopLocal = playLocal(events, (m) => useRunStore.getState().apply(m)).stop;
      } else {
        socketRef.current = connectRun(runId, {
          onMessage: (m) => useRunStore.getState().apply(m),
          onStatus: (st) => useRunStore.getState().setWsStatus(st),
        });
      }
    })();

    return () => {
      cancelled = true;
      stopLocal?.();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [runId, source]);

  // Presence upstream (cursor | select | scrub). No-op on the local player.
  return (msg: WsUpstream) => socketRef.current?.send(msg);
}
