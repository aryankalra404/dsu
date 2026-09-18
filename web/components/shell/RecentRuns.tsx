"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import type { HistoryRow } from "@/lib/contracts";
import { Badge, Card, Empty, Spinner } from "@/components/ui";
import { PhaseBadge, VerdictTally } from "@/components/run/bits";

export function useHistory() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.runs().then(setRows).catch((e) => setError(e.message));
  }, []);
  return { rows, error };
}

export function RecentRuns({ limit }: { limit: number }) {
  const { rows, error } = useHistory();
  if (error)
    return (
      <Card>
        <Empty title="Can't reach the core">{error}</Empty>
      </Card>
    );
  if (!rows)
    return (
      <Card className="p-6">
        <Spinner label="Loading runs…" />
      </Card>
    );
  if (!rows.length)
    return (
      <Card>
        <Empty icon={<History className="size-6" />} title="No runs yet">
          Start one from <Link className="text-accent underline" href="/runs/new">New run</Link>.
        </Empty>
      </Card>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.slice(0, limit).map((r) => (
        <Link key={r.id} href={`/runs/${r.id}`}>
          <Card className="h-full p-4 transition hover:border-line-strong hover:shadow-[var(--shadow-pop)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-faint">{r.id}</span>
              <PhaseBadge phase={r.phase} final={r.final} />
            </div>
            <p className="line-clamp-2 text-sm font-medium text-ink">{r.intent}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted" title={r.repo}>
              {r.repo}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <VerdictTally verdicts={r.verdicts} />
              {r.pauses.length > 0 && <Badge tone="danger">{r.pauses.length} pause{r.pauses.length > 1 ? "s" : ""}</Badge>}
              {r.replay && <Badge tone="muted">replay</Badge>}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
