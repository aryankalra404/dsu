"use client";
import type { FinalState, Phase, Verdict } from "@/lib/contracts";
import { CLAIM_TYPE_LABEL, PHASE_LABEL, VERDICT_TONE } from "@/lib/design";
import { Badge } from "@/components/ui";

export function VerdictBadge({ verdict }: { verdict?: string }) {
  const v = verdict ?? "PENDING";
  return (
    <Badge tone={VERDICT_TONE[v] ?? "muted"} mono>
      {v}
    </Badge>
  );
}

export function ClaimTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone="neutral" className="font-medium">
      {CLAIM_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

const FINAL_TONE: Record<FinalState, "ok" | "danger" | "warn"> = {
  merged: "ok",
  rejected: "danger",
  killed: "danger",
  max_iterations: "warn",
};

export function PhaseBadge({ phase, final }: { phase: Phase; final: FinalState | null }) {
  if (final) return <Badge tone={FINAL_TONE[final]}>{final === "merged" ? "Merged" : final.replace("_", " ")}</Badge>;
  const tone = phase === "paused" || phase === "error" ? "danger" : phase === "intent" || phase === "approve" ? "warn" : "accent";
  return <Badge tone={tone}>{PHASE_LABEL[phase] ?? phase}</Badge>;
}

export function VerdictTally({ verdicts }: { verdicts: Verdict[] }) {
  if (!verdicts.length) return <Badge tone="muted">no verdicts yet</Badge>;
  const real = verdicts.filter((v) => v.verdict === "REAL").length;
  const bad = verdicts.filter((v) => ["FAKE", "DEAD", "DRIFT", "VULN"].includes(v.verdict)).length;
  const inc = verdicts.length - real - bad;
  return (
    <>
      <Badge tone="ok">{real} real</Badge>
      {bad > 0 && <Badge tone="danger">{bad} failed</Badge>}
      {inc > 0 && <Badge tone="warn">{inc} inconclusive</Badge>}
    </>
  );
}
