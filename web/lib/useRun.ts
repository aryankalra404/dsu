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

    let effective = source;
    (async () => {
      try {
        let scene;
        if (source === "local") scene = await loadLocalScene();
        else {
          try {
            scene = await getScene(runId);
          } catch (coreErr) {
            // Core unreachable → local fixture, announced in the header (CLAUDE.md: stubs say so).
            console.warn("core unreachable, falling back to local fixture:", coreErr);
            effective = "local";
            useRunStore.getState().setSource("local", true);
            scene = await loadLocalScene();
          }
        }
        if (cancelled) return;
        useRunStore.getState().setScene(scene);
      } catch (err) {
        if (cancelled) return;
        useRunStore.getState().setSceneStatus("error", err instanceof Error ? err.message : String(err));
        return;
      }

      if (effective === "local") {
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
