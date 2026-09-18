"use client";
import { motion as fm } from "framer-motion";
import { color, driftChipLabels, driftColor } from "@/lib/design";
import { useRunStore } from "@/lib/store";

/**
 * DESIGN.md: 0–100 bar, accent → warn > 40 → danger > 70, four chips labelled exactly scope · revert · churn · advisory.
 * Boolean chips are danger when true / node-dim when false; churn shows the count (warn > 0); advisory one decimal (warn > 0).
 */
export function DriftMeter() {
  const drift = useRunStore((s) => s.drift);
  const score = drift?.score ?? 0;
  const bar = driftColor(score);

  const chips: { label: (typeof driftChipLabels)[number]; text: string; on: boolean; tone: string }[] = [
    { label: "scope", text: drift?.scope_violation ? "violated" : "ok", on: !!drift?.scope_violation, tone: color.danger },
    { label: "revert", text: drift?.revert ? "yes" : "no", on: !!drift?.revert, tone: color.danger },
    { label: "churn", text: String(drift?.churn ?? 0), on: (drift?.churn ?? 0) > 0, tone: color.warn },
    { label: "advisory", text: (drift?.advisory ?? 0).toFixed(1), on: (drift?.advisory ?? 0) > 0, tone: color.warn },
  ];

  return (
    <div className="pointer-events-none flex items-center gap-3 px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">drift</span>
      <div className="relative h-1.5 w-40 overflow-hidden rounded-full" style={{ background: `${color.nodeDim}55` }}>
        <fm.div
          className="absolute inset-y-0 left-0 rounded-full"
          animate={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: bar }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          style={{ boxShadow: `0 0 10px ${bar}` }}
        />
      </div>
      <span className="w-8 font-mono text-xs tabular-nums" style={{ color: bar }}>
        {Math.round(score)}
      </span>
      <div className="flex gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className="rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none"
            style={{
              borderColor: c.on ? c.tone : `${color.nodeDim}88`,
              color: c.on ? c.tone : color.nodeDim,
              background: c.on ? `${c.tone}14` : "transparent",
            }}
          >
            {c.label} <span className="opacity-80">{c.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
