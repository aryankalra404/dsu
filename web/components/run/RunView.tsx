"use client";
import { useSearchParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { useRunStore } from "@/lib/store";
import { City } from "@/components/city/City";

/** Data source: `?replay=local` plays web/fixtures; otherwise Core's replay server from .env.local. */
export function RunView({ runId }: { runId: string }) {
  const params = useSearchParams();
  const source = params.get("replay") === "local" ? "local" : "core";
  useRun(runId, source);

  const sceneStatus = useRunStore((s) => s.sceneStatus);
  const sceneError = useRunStore((s) => s.sceneError);
  const wsStatus = useRunStore((s) => s.wsStatus);
  const eventCount = useRunStore((s) => s.events.length);
  const agent = useRunStore((s) => s.agent);
  const nodeCount = useRunStore((s) => s.scene?.graph.nodes.length ?? 0);

  return (
    <main className="mx-auto grid h-screen w-full max-w-[1280px] grid-cols-[280px_1fr_320px] grid-rows-[48px_1fr] gap-px bg-border">
      <header className="col-span-3 flex items-center gap-3 bg-background px-4 text-sm">
        <span className="font-semibold">Spatial SOC</span>
        <span className="font-mono text-muted-foreground">run {runId}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {source} · scene {sceneStatus} · ws {wsStatus} · {eventCount} events · {agent.state} @ {agent.node ?? "—"}
        </span>
      </header>
      <aside className="bg-background p-3 text-sm text-muted-foreground">Claims</aside>
      <section className="relative min-h-0 bg-soc-bg">
        <CityPanel status={sceneStatus} error={sceneError} nodeCount={nodeCount} />
      </section>
      <aside className="bg-background p-3 text-sm text-muted-foreground">Evidence · Patch · Gate</aside>
    </main>
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
