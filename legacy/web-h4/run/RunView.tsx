"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { useRunStore } from "@/lib/store";
import { color } from "@/lib/design";
import { City } from "@/components/city/City";
import { ClaimsPanel } from "@/components/run/ClaimsPanel";
import { RightPanel } from "@/components/run/RightPanel";
import { DriftMeter } from "@/components/run/DriftMeter";
import { StatePill } from "@/components/run/StatePill";
import { Timeline } from "@/components/run/Timeline";

/**
 * Data source: `?replay=local` plays web/fixtures; otherwise Core's replay server from .env.local.
 * If Core is unreachable the page falls back to the local fixture and says so (CLAUDE.md: stubs announce themselves).
 */
export function RunView({ runId }: { runId: string }) {
  const params = useSearchParams();
  const requested = params.get("replay") === "local" ? "local" : "core";
  const send = useRun(runId, requested);

  const source = useRunStore((s) => s.source);
  const fallback = useRunStore((s) => s.fallback);
  const sceneStatus = useRunStore((s) => s.sceneStatus);
  const sceneError = useRunStore((s) => s.sceneError);
  const wsStatus = useRunStore((s) => s.wsStatus);
  const eventCount = useRunStore((s) => s.events.length);
  const nodeCount = useRunStore((s) => s.scene?.graph.nodes.length ?? 0);
  const setSelected = useRunStore((s) => s.setSelected);
  const setScrub = useRunStore((s) => s.setScrub);

  // Esc clears focus and returns to live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelected(null); setScrub(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelected, setScrub]);

  return (
    <main className="mx-auto grid h-screen w-full max-w-[1280px] grid-cols-[280px_1fr_320px] grid-rows-[48px_1fr] gap-px bg-border">
      <header className="col-span-3 flex items-center gap-3 bg-background px-4 text-sm">
        <span className="font-semibold tracking-tight">Spatial SOC</span>
        <span className="font-mono text-muted-foreground">run {runId}</span>
        <StatePill />
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <SourceBadge source={source} fallback={fallback} />
          <span>·</span>
          <span style={{ color: wsStatus === "open" ? color.ok : wsStatus === "connecting" ? color.warn : color.nodeDim }}>ws {wsStatus}</span>
          <span>·</span>
          <span>{eventCount} events</span>
        </span>
      </header>

      <aside className="min-h-0 bg-background">
        <ClaimsPanel />
      </aside>

      <section className="relative flex min-h-0 flex-col bg-soc-bg">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-soc-bg/90 to-transparent">
          <DriftMeter />
        </div>
        <div className="relative min-h-0 flex-1">
          <CityPanel status={sceneStatus} error={sceneError} nodeCount={nodeCount} />
        </div>
        <div className="z-10 border-t bg-background/80 backdrop-blur" style={{ borderColor: `${color.nodeDim}44` }}>
          <Timeline send={send} />
        </div>
      </section>

      <aside className="min-h-0 bg-background">
        <RightPanel runId={runId} />
      </aside>
    </main>
  );
}

function SourceBadge({ source, fallback }: { source: string; fallback: boolean }) {
  if (source === "core") return <span style={{ color: color.ok }}>core</span>;
  return (
    <span className="rounded border px-1.5 py-px" style={{ borderColor: `${color.warn}88`, color: color.warn }}>
      {fallback ? "local fixture · core unreachable" : "local fixture"}
    </span>
  );
}

/** Centre column. Loading / empty / error states per web/CLAUDE.md; the canvas only mounts when there is a scene. */
function CityPanel({ status, error, nodeCount }: { status: string; error: string | null; nodeCount: number }) {
  if (status === "idle" || status === "loading") return <Centered>Loading scene…</Centered>;
  if (status === "error") return <Centered className="text-soc-danger">Scene failed: {error}</Centered>;
  if (nodeCount === 0) return <Centered>Empty scene — the server sent no nodes.</Centered>;
  return (
    <div className="absolute inset-0">
      <City />
    </div>
  );
}

function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex h-full items-center justify-center text-sm text-muted-foreground ${className}`}>{children}</div>;
}
