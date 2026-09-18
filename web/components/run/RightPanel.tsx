"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { color, gateLabels } from "@/lib/design";
import { useRunStore } from "@/lib/store";
import { postDecision } from "@/lib/api";
import type { Decision, GateWhich } from "@/lib/contracts";

/** Right column: Evidence · Patch · Gate (DESIGN.md → Layout parity). Gate is context-sensitive and live. */
export function RightPanel({ runId }: { runId: string }) {
  const gate = useRunStore((s) => s.gate);
  const [tab, setTab] = useState("gate");
  // Jump to the Gate tab whenever a gate opens — that is the moment the human is needed.
  useEffect(() => {
    if (gate?.which) setTab("gate");
  }, [gate?.which]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <TabsList className="m-2 grid grid-cols-3">
        <TabsTrigger value="evidence">Evidence</TabsTrigger>
        <TabsTrigger value="patch">Patch</TabsTrigger>
        <TabsTrigger value="gate" className="relative">
          Gate
          {gate?.which && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: color.danger, boxShadow: `0 0 6px ${color.danger}` }} />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="evidence" className="min-h-0 flex-1"><EvidenceTab /></TabsContent>
      <TabsContent value="patch" className="min-h-0 flex-1"><PatchTab /></TabsContent>
      <TabsContent value="gate" className="min-h-0 flex-1"><GateTab runId={runId} /></TabsContent>
    </Tabs>
  );
}

function EvidenceTab() {
  const events = useRunStore((s) => s.events);
  const selected = useRunStore((s) => s.selected);
  const rows = [...events].reverse().filter((e) => !selected || e.node === selected).slice(0, 40);
  if (events.length === 0) return <Empty>No events yet. The trajectory appears here as the agent works.</Empty>;
  return (
    <div className="h-full overflow-y-auto px-2 pb-2">
      <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        trajectory{selected ? ` · ${selected}` : ""} · newest first
      </p>
      <table className="w-full font-mono text-[11px]">
        <tbody>
          {rows.map((e) => {
            const bad = e.in_scope === false && e.kind === "write";
            return (
              <tr key={e.seq} className="border-t" style={{ borderColor: `${color.nodeDim}44` }}>
                <td className="w-8 py-1 pr-1 text-right text-muted-foreground">{e.seq}</td>
                <td className="w-12 py-1 pr-1" style={{ color: bad ? color.danger : e.kind === "write" ? color.accent : color.nodeScope }}>{e.kind}</td>
                <td className="truncate py-1" style={{ color: bad ? color.danger : color.text, maxWidth: 180 }}>
                  {e.path ?? e.cmd ?? e.host ?? e.mode ?? ""}
                  {e.exit !== undefined && <span className="text-muted-foreground"> → {e.exit}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PatchTab() {
  const patch = useRunStore((s) => s.patch);
  if (!patch) return <Empty>No patch proposed yet. The Fixer&apos;s diff and rationale land here after verdicts.</Empty>;
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">iteration {patch.iteration}</p>
      <p className="text-xs" style={{ color: color.text }}>{patch.rationale}</p>
      <pre className="overflow-x-auto rounded border p-2 font-mono text-[10px] leading-snug" style={{ borderColor: `${color.nodeDim}66` }}>
        {patch.diff.split("\n").map((l, i) => (
          <div key={i} style={{ color: l.startsWith("+") ? color.ok : l.startsWith("-") ? color.danger : color.nodeScope }}>{l}</div>
        ))}
      </pre>
    </div>
  );
}

const GATE_BUTTONS: Record<GateWhich, { label: (typeof gateLabels)[number]; decision: Decision; tone: string; key: string }[]> = {
  intent: [{ label: "Confirm claims", decision: "continue", tone: color.accent, key: "C" }],
  pause: [
    { label: "Continue", decision: "continue", tone: color.accent, key: "Space" },
    { label: "Steer", decision: "steer", tone: color.warn, key: "S" },
    { label: "Kill", decision: "kill", tone: color.danger, key: "K" },
  ],
  approve: [
    { label: "Approve", decision: "approve", tone: color.ok, key: "A" },
    { label: "Reject", decision: "reject", tone: color.danger, key: "R" },
  ],
};

const STEER_PRESETS = ["stay in scope", "add the tests first", "stop refactoring"];

function GateTab({ runId }: { runId: string }) {
  const gate = useRunStore((s) => s.gate);
  const agent = useRunStore((s) => s.agent);
  const source = useRunStore((s) => s.source);
  const apply = useRunStore((s) => s.apply);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const which = gate?.which ?? null;

  const decide = async (decision: Decision) => {
    if (!which || busy) return;
    setBusy(decision);
    setErr(null);
    const text = decision === "steer" ? steer || STEER_PRESETS[0] : undefined;
    try {
      if (source === "core") await postDecision(runId, { which, decision, text });
      // Local fixture: no server; reflect the decision locally so the demo loop still reads right.
      else apply({ t: "decision", which, decision, text, by: "web-1" });
      if (decision === "kill") apply({ t: "final", state: "killed" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setSteer("");
    }
  };

  // Keyboard: Space continue · S steer · K kill · A approve · R reject · C confirm · Esc clears focus (handled in RunView).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!which || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key === " " ? "Space" : e.key.toUpperCase();
      const b = GATE_BUTTONS[which].find((x) => x.key === k);
      if (b) { e.preventDefault(); void decide(b.decision); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which, steer, busy]);

  if (!which) {
    return (
      <Empty>
        <span>No gate open.</span>
        <span className="mt-1 block text-[11px]">
          {agent.state === "running" ? "The agent is running. This tab lights up when n8n pauses it or the run needs approval." : "Waiting for the next checkpoint."}
        </span>
      </Empty>
    );
  }

  const title = which === "intent" ? "Confirm the claims and scope" : which === "pause" ? `Agent paused — ${agent.reason === "scope_violation" ? "it wrote outside scope" : agent.reason ?? "checkpoint"}` : "Run finished — approve or reject";

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="rounded border p-2" style={{ borderColor: `${color.danger}66`, background: `${color.danger}0d` }}>
        <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: color.danger }}>human in the loop</p>
        <p className="mt-1 text-xs" style={{ color: color.text }}>{title}</p>
      </div>
      {which === "pause" && (
        <div className="flex flex-col gap-1.5">
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder={STEER_PRESETS[0]}
            className="w-full rounded border bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
            style={{ borderColor: `${color.nodeDim}88`, color: color.text }}
          />
          <div className="flex flex-wrap gap-1">
            {STEER_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setSteer(p)} className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: `${color.nodeDim}88`, color: color.nodeScope }}>{p}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {GATE_BUTTONS[which].map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(b.decision)}
            className="flex items-center justify-between rounded border px-3 py-2 text-left text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ borderColor: `${b.tone}88`, color: b.tone, background: `${b.tone}14`, boxShadow: `0 0 12px ${b.tone}22` }}
          >
            {busy === b.decision ? "…" : b.label}
            <kbd className="rounded border px-1 font-mono text-[10px] opacity-70" style={{ borderColor: `${b.tone}66` }}>{b.key}</kbd>
          </button>
        ))}
      </div>
      {err && <p className="font-mono text-[11px]" style={{ color: color.danger }}>{err}</p>}
      {source === "local" && <p className="font-mono text-[10px] text-muted-foreground">local fixture — decisions apply in-page only</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</div>;
}
