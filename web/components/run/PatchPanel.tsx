"use client";
import { useEffect, useState } from "react";
import { GitCompare } from "lucide-react";
import { api } from "@/lib/api";
import type { Scene } from "@/lib/contracts";
import { useRun } from "@/lib/store";
import { Badge, Empty, SectionTitle, Spinner, cx } from "@/components/ui";

export function PatchPanel({ scene }: { scene: Scene }) {
  const patches = useRun((s) => s.patches);
  const events = useRun((s) => s.events);
  const archived = useRun((s) => s.archived);
  const [agentDiff, setAgentDiff] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const writes = events.filter((e) => e.kind === "write").length;

  useEffect(() => {
    if (archived) return;
    let alive = true;
    api
      .agentDiff(scene.run_id)
      .then((d) => alive && setAgentDiff(d.diff))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [scene.run_id, writes, patches.length, archived]);

  return (
    <div className="pb-4">
      <SectionTitle right={<Badge tone="muted">iteration {scene.iteration}</Badge>}>Fixer patches</SectionTitle>
      {patches.length === 0 ? (
        <p className="px-4 text-xs text-muted">
          No Fixer patch yet. Failed claims (FAKE / DEAD / VULN) go to the Fixer for at most 3 iterations.
        </p>
      ) : (
        <div className="space-y-3 px-4">
          {[...patches].reverse().map((p) => (
            <div key={p.iteration} className="rounded-xl border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-sunken/60 px-3 py-2">
                <Badge tone="accent">iteration {p.iteration}</Badge>
                <Badge tone="muted">{p.source}</Badge>
                <span className="truncate font-mono text-[11px] text-muted">{p.files.join(", ")}</span>
              </div>
              {p.rationale && <p className="px-3 pt-2 text-xs text-ink">{p.rationale}</p>}
              <DiffView diff={p.diff} />
            </div>
          ))}
        </div>
      )}
      <SectionTitle>Agent&apos;s changes vs the original repo</SectionTitle>
      {archived ? (
        <p className="px-4 text-xs text-muted">Archived run: the workdir diff is not available after a core restart.</p>
      ) : err ? (
        <p className="px-4 text-xs text-danger">{err}</p>
      ) : agentDiff === null ? (
        <div className="px-4">
          <Spinner label="Computing diff…" />
        </div>
      ) : agentDiff.trim() === "" ? (
        <Empty icon={<GitCompare className="size-5" />} title="No changes yet" />
      ) : (
        <div className="mx-4 overflow-hidden rounded-xl border border-line">
          <DiffView diff={agentDiff} />
        </div>
      )}
    </div>
  );
}

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n").slice(0, 3000);
  return (
    <pre className="soc-diff soc-scroll max-h-[420px] overflow-auto py-1 font-mono text-[11px] leading-[1.55]">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            "px-3 whitespace-pre",
            l.startsWith("+++") || l.startsWith("---") ? "file" : l.startsWith("@@") ? "hunk" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "text-muted",
          )}
        >
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
