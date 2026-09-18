"use client";
import Link from "next/link";
import { History } from "lucide-react";
import { useHistory } from "@/components/shell/RecentRuns";
import { Badge, Card, Empty, Spinner } from "@/components/ui";
import { PhaseBadge, VerdictTally } from "@/components/run/bits";

export default function HistoryPage() {
  const { rows, error } = useHistory();
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-muted">Every supervised run, from the core&apos;s audit log.</p>
      <Card className="mt-6 overflow-hidden">
        {error ? (
          <Empty title="Can't reach the core">{error}</Empty>
        ) : !rows ? (
          <div className="p-6">
            <Spinner label="Loading…" />
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={<History className="size-6" />} title="No runs yet" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-sunken/60 text-left text-xs text-muted">
              <tr>
                {["Run", "Intent", "Verdicts", "Pauses", "Fixes", "Decision", "When"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const last = r.decisions.at(-1);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-sunken/40">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/runs/${r.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">
                        {r.id}
                      </Link>
                      <div className="mt-1">
                        <PhaseBadge phase={r.phase} final={r.final} />
                      </div>
                    </td>
                    <td className="max-w-[380px] px-4 py-3 align-top">
                      <p className="line-clamp-2">{r.intent}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{r.repo}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        <VerdictTally verdicts={r.verdicts} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.pauses.length ? (
                        <div className="space-y-1">
                          {r.pauses.map((p, i) => (
                            <Badge key={i} tone="danger" mono>
                              {p.reason.replace("_", " ")} · {p.path}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs">{r.iteration}</td>
                    <td className="px-4 py-3 align-top text-xs">
                      {last ? (
                        <span>
                          <b>{last.decision}</b> <span className="text-muted">by {last.by}</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-muted">
                      {new Date(r.created_at * 1000).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
