"use client";
import { useEffect, useState } from "react";
import { color, motion } from "@/lib/design";
import { useRunStore } from "@/lib/store";

/** DESIGN.md → States: identical wording and colour on both clients. */
export function StatePill() {
  const agent = useRunStore((s) => s.agent);
  const steeredAt = useRunStore((s) => s.steeredAt);
  const final = useRunStore((s) => s.final);
  const [, tick] = useState(0);

  // Re-render when the 2 s "Steered" window ends.
  useEffect(() => {
    if (!steeredAt) return;
    const t = setTimeout(() => tick((n) => n + 1), motion.steeredFlash + 20);
    return () => clearTimeout(t);
  }, [steeredAt]);

  let text = "Running";
  let tone: string = color.accent;
  const steered = steeredAt !== null && Date.now() - steeredAt < motion.steeredFlash && agent.state === "running";

  if (final === "merged") [text, tone] = ["Merged", color.ok];
  else if (final === "rejected") [text, tone] = ["Rejected", color.danger];
  else if (final === "max_iterations") [text, tone] = ["Needs a human", color.warn];
  else if (agent.state === "killed") [text, tone] = ["Killed", color.danger];
  else if (agent.state === "paused") [text, tone] = [`Paused — ${reasonText(agent.reason)}`, color.danger];
  else if (agent.state === "done") [text, tone] = ["Done — checking claims", color.text];
  else if (steered) [text, tone] = ["Steered", color.warn];

  const pulse = agent.state === "paused";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none"
      style={{ borderColor: `${tone}66`, color: tone, background: `${tone}12` }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
      />
      {text}
      {agent.node && <span className="text-muted-foreground">@ {agent.node}</span>}
    </span>
  );
}

function reasonText(r: string | null): string {
  if (r === "scope_violation") return "out of scope";
  if (r === "revert") return "reverted its own work";
  return r ?? "gate";
}
