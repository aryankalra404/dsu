"use client";
import { useSearchParams } from "next/navigation";
import { useRun } from "@/lib/useRun";
import { useRunStore } from "@/lib/store";

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
      <section className="flex items-center justify-center bg-soc-bg text-sm text-muted-foreground">
        {sceneStatus === "loading" && "Loading scene…"}
        {sceneStatus === "error" && <span className="text-soc-danger">Scene failed: {sceneError}</span>}
        {sceneStatus === "ready" && "City (item 3)"}
      </section>
      <aside className="bg-background p-3 text-sm text-muted-foreground">Evidence · Patch · Gate</aside>
    </main>
  );
}
