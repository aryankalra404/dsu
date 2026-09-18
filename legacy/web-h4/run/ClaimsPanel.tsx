"use client";
import { useMemo } from "react";
import { motion as fm } from "framer-motion";
import { color, verdictColor, type VerdictLabel } from "@/lib/design";
import { useRunStore } from "@/lib/store";
import type { Claim, ClaimSource } from "@/lib/contracts";

const GROUPS: { key: string; title: string; sources: ClaimSource[] }[] = [
  { key: "intent", title: "Confirmed intent", sources: ["llm", "human"] },
  { key: "agent", title: "What the agent said", sources: ["agent"] },
  { key: "auto", title: "Auto", sources: ["auto", "ast"] },
];

const TYPE_SHORT: Record<Claim["type"], string> = {
  stays_in_scope: "scope",
  no_churn: "churn",
  fetches_external: "http",
  declares_capability: "defined",
  resists_probe: "probe",
  reasons_on_input: "differential",
};

/** Left column (DESIGN.md → Layout parity). Click → focus node; verdict badge once available; PENDING until then. */
export function ClaimsPanel() {
  const claims = useRunStore((s) => s.claims);
  const drift = useRunStore((s) => s.drift);
  const selected = useRunStore((s) => s.selected);
  const setSelected = useRunStore((s) => s.setSelected);
  const scene = useRunStore((s) => s.scene);
  const scopeNodes = scene?.scope_nodes;

  const grouped = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: claims.filter((c) => g.sources.includes(c.source)) })).filter((g) => g.items.length > 0),
    [claims],
  );

  if (claims.length === 0) {
    return <Empty>No claims yet — they appear once the intent is extracted.</Empty>;
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {grouped.map((g) => (
        <section key={g.key}>
          <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.title}</h3>
          <ul className="flex flex-col gap-1">
            {g.items.map((c) => {
              // Live verdict for the two trajectory-backed claims before the end-of-run verdicts arrive.
              const live: VerdictLabel | null =
                c.verdict?.verdict ??
                (c.type === "stays_in_scope" && drift?.scope_violation ? "DRIFT" : null) ??
                (c.type === "no_churn" && drift?.revert ? "DRIFT" : null);
              const label: VerdictLabel = live ?? "PENDING";
              const tone = verdictColor[label];
              const focus = c.type === "stays_in_scope" ? (scopeNodes?.[0] ?? null) : null;
              const active = focus !== null && focus === selected;
              return (
                <fm.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => focus && setSelected(active ? null : focus)}
                  className={`group rounded border px-2 py-1.5 text-xs ${focus ? "cursor-pointer" : ""}`}
                  style={{
                    borderColor: active ? color.accent : label === "PENDING" ? `${color.nodeDim}66` : `${tone}55`,
                    background: label === "PENDING" ? "transparent" : `${tone}0d`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="rounded px-1 font-mono text-[9px] uppercase" style={{ background: `${color.nodeDim}55`, color: color.text }}>
                      {TYPE_SHORT[c.type]}
                    </span>
                    <span className="ml-auto rounded px-1.5 py-px font-mono text-[9px] font-semibold tracking-wider" style={{ color: tone, border: `1px solid ${tone}88`, boxShadow: label === "PENDING" ? "none" : `0 0 8px ${tone}44` }}>
                      {label}
                    </span>
                  </div>
                  <p className="mt-1 leading-snug" style={{ color: color.text }}>{c.text}</p>
                  {(c.target || c.axis) && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {c.target ? `target ${c.target}` : ""}{c.target && c.axis ? " · " : ""}{c.axis ? `axis ${c.axis}` : ""}
                    </p>
                  )}
                  {c.verdict && <p className="mt-1 font-mono text-[10px]" style={{ color: tone }}>{c.verdict.rule}</p>}
                </fm.li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</div>;
}
