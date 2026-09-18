"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Drift, Scene } from "@/lib/contracts";
import { color, driftColor, motion, PHASE_LABEL } from "@/lib/design";
import { useRun } from "@/lib/store";
import { Badge, cx } from "@/components/ui";

export function RunHeader({ scene }: { scene: Scene }) {
  const ws = useRun((s) => s.wsStatus);
  const archived = useRun((s) => s.archived);
  return (
    <div className="flex items-center gap-4 border-b border-line bg-surface px-5 py-2.5">
      <Link href="/history" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink">
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-faint">{scene.run_id}</span>
          {scene.replay && <Badge tone="muted">replay · {scene.replay}</Badge>}
          {scene.iteration > 0 && <Badge tone="accent">fix iteration {scene.iteration}</Badge>}
        </div>
        <p className="truncate text-sm font-medium text-ink" title={scene.intent}>
          {scene.intent}
        </p>
      </div>
      <StatePill scene={scene} />
      <span
        title={archived ? "archived run (read-only)" : `live connection: ${ws}`}
        className={cx(
          "size-2 shrink-0 rounded-full",
          archived ? "bg-faint" : ws === "open" ? "bg-ok" : ws === "connecting" ? "bg-warn" : "bg-danger",
        )}
      />
    </div>
  );
}

/** DESIGN.md states table: identical wording on web and VR. */
export function StatePill({ scene }: { scene: Scene }) {
  const steeredAt = useRun((s) => s.steeredAt);
  const [, force] = useState(0);
  useEffect(() => {
    if (!steeredAt) return;
    const id = setTimeout(() => force((n) => n + 1), motion.steeredFlash + 50);
    return () => clearTimeout(id);
  }, [steeredAt]);
  const steered = steeredAt !== null && Date.now() - steeredAt < motion.steeredFlash && scene.agent.state === "running";

  let label = PHASE_LABEL[scene.phase] ?? scene.phase;
  let tone: "accent" | "danger" | "warn" | "ok" | "muted" = "accent";
  if (scene.final) {
    label = { merged: "Merged", rejected: "Rejected", killed: "Killed", max_iterations: "Max iterations" }[scene.final];
    tone = scene.final === "merged" ? "ok" : scene.final === "max_iterations" ? "warn" : "danger";
  } else if (steered) {
    label = "Steered";
    tone = "warn";
  } else if (scene.phase === "paused") {
    label = scene.gate.reason === "revert" ? "Paused — reverted its own work" : "Paused — out of scope";
    tone = "danger";
  } else if (scene.phase === "error") tone = "danger";
  else if (scene.phase === "intent" || scene.phase === "approve") tone = "warn";
  else if (scene.phase === "checking" || scene.phase === "fixing") tone = "muted";

  const styles = {
    accent: "bg-accent-soft text-accent-strong border-accent/25",
    danger: "bg-danger-soft text-danger border-danger/25 animate-pulse-ring",
    warn: "bg-warn-soft text-warn border-warn/25",
    ok: "bg-ok-soft text-ok border-ok/25",
    muted: "bg-sunken text-ink border-line",
  }[tone];
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold", styles)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function DriftMeter({ drift }: { drift: Drift }) {
  const score = Math.round(drift.score);
  const c = driftColor(drift.score);
  const chip = (label: string, value: string | null, on: boolean, tone: string) => (
    <span
      key={label}
      className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]"
      style={on ? { background: `${tone}14`, borderColor: `${tone}40`, color: tone } : { color: color.faint }}
    >
      {label}
      {value !== null && <b className="font-semibold">{value}</b>}
    </span>
  );
  return (
    <div className="px-4 pb-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Drift</span>
        <span className="font-mono text-lg font-semibold" style={{ color: c }}>
          {score}
          <span className="text-xs text-faint">/100</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(score, 100)}%`, background: c }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chip("scope", null, drift.scope_violation, color.danger)}
        {chip("revert", null, drift.revert, color.danger)}
        {chip("churn", String(drift.churn), drift.churn > 0, color.warn)}
        {chip("advisory", drift.advisory.toFixed(1), drift.advisory > 0, color.warn)}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Only <b>scope</b> and <b>revert</b> are facts that can pause the agent; churn and advisory only advise.
      </p>
    </div>
  );
}
