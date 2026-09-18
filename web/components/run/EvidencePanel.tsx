"use client";
import { useState } from "react";
import { ChevronDown, FlaskConical, ScrollText } from "lucide-react";
import type { Claim, ExecSummary, Scene, TrajectoryEvent } from "@/lib/contracts";
import { useRun } from "@/lib/store";
import { sendUpstream } from "@/lib/useRun";
import { Badge, Empty, SectionTitle, Spinner, cx } from "@/components/ui";
import { ClaimTypeBadge, VerdictBadge } from "@/components/run/bits";

export function jumpTo(seq: number, node?: string | null) {
  const s = useRun.getState();
  s.setScrub(seq);
  sendUpstream({ t: "scrub", seq, by: s.clientId });
  if (node) {
    s.select(node);
    sendUpstream({ t: "select", node, by: s.clientId });
  }
}

export function EvidencePanel({ scene, claim }: { scene: Scene; claim: Claim | null }) {
  const execs = useRun((s) => s.execs);
  const events = useRun((s) => s.events);
  const selected = useRun((s) => s.selected);
  return (
    <div className="pb-4">
      {claim && <ClaimEvidence claim={claim} events={events} execs={execs} />}
      <SectionTitle right={<span className="font-mono text-[11px] text-faint">{execs.length}</span>}>Sandbox executions</SectionTitle>
      {execs.length === 0 ? (
        <Empty icon={<FlaskConical className="size-5" />} title="No executions yet">
          After the agent finishes, the repo&apos;s tests and the exploit probes run here under the shim.
        </Empty>
      ) : (
        <div className="space-y-2 px-4">
          {execs.map((x) => (
            <ExecCard key={x.exec_id} x={x} />
          ))}
        </div>
      )}
      <SectionTitle
        right={
          selected ? (
            <button className="font-mono text-[11px] text-accent" onClick={() => useRun.getState().select(null)}>
              {selected.split("/").pop()} ✕
            </button>
          ) : (
            <span className="font-mono text-[11px] text-faint">{events.length}</span>
          )
        }
      >
        Trajectory
      </SectionTitle>
      <TrajectoryTable events={selected ? events.filter((e) => e.path === selected || e.node === selected) : events} scope={scene.scope} />
    </div>
  );
}

function ClaimEvidence({ claim, events, execs }: { claim: Claim; events: TrajectoryEvent[]; execs: ExecSummary[] }) {
  const v = claim.verdict;
  const seqs = new Set(v?.evidence.traj_seqs ?? []);
  const execIds = new Set(v?.evidence.exec_ids ?? []);
  return (
    <div className="mx-4 mt-4 rounded-xl border border-line bg-sunken/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <ClaimTypeBadge type={claim.type} />
        <VerdictBadge verdict={v?.verdict} />
      </div>
      <p className="mt-2 text-sm font-medium">{claim.text}</p>
      {v ? (
        <>
          <p className="mt-2 rounded-lg bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink">{v.rule}</p>
          {seqs.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {events
                .filter((e) => seqs.has(e.seq))
                .map((e) => (
                  <button key={e.seq} onClick={() => jumpTo(e.seq, e.node)} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] hover:border-accent">
                    seq {e.seq} · {e.path ?? e.cmd}
                  </button>
                ))}
            </div>
          )}
          {execIds.size > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              executions: {execs.filter((x) => execIds.has(x.exec_id)).map((x) => `${x.exec_id} (${x.mode})`).join(", ")}
            </p>
          )}
          {v.hints.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] font-semibold text-muted">Advisory hints (never verdicts)</p>
              {v.hints.map((h, i) => (
                <p key={i} className="rounded-md border border-warn/25 bg-warn-soft px-2 py-1 text-[11px]">
                  <b className="font-mono">{h.kind}</b> <span className="font-mono text-muted">{h.file}:{h.line}</span> — {h.msg}
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">No verdict yet — verdicts arrive after the sandbox executions.</p>
      )}
    </div>
  );
}

function ExecCard({ x }: { x: ExecSummary }) {
  const [open, setOpen] = useState(false);
  const hit = x.sinks.filter((s) => s.arg_has_payload);
  return (
    <div className={cx("rounded-xl border bg-surface", hit.length ? "border-danger/40" : "border-line")}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="font-mono text-[11px] text-faint">{x.exec_id}</span>
        <Badge tone={x.mode === "probe" ? "warn" : x.mode === "chaos" ? "muted" : "accent"}>{x.mode}</Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">{x.input}</span>
        {x.running ? (
          <Spinner />
        ) : (
          <>
            <Badge tone="muted" mono>{x.http_count ?? x.http.length} http</Badge>
            {hit.length > 0 && <Badge tone="danger" mono>sink hit</Badge>}
            <Badge tone={x.exit === 0 ? "ok" : "danger"} mono>exit {x.exit}</Badge>
          </>
        )}
        <ChevronDown className={cx("size-3.5 text-faint transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2 text-[11px]">
          {x.sinks.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted">Sink calls</p>
              {x.sinks.map((s, i) => (
                <p key={i} className={cx("font-mono", s.arg_has_payload ? "font-semibold text-danger" : "text-muted")}>
                  {s.arg_has_payload ? "▶ " : "  "}
                  {s.fn} {s.arg_has_payload ? "— payload reached the sink unescaped" : "— clean"}
                </p>
              ))}
            </div>
          )}
          {x.http.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted">HTTP (rewritten to the honeypot)</p>
              {x.http.map((h, i) => (
                <p key={i} className="font-mono text-ink">
                  {h.method} {h.host}
                  {h.path} → {h.status ?? "error"}
                </p>
              ))}
            </div>
          )}
          {x.error && <pre className="max-h-40 overflow-auto rounded bg-danger-soft p-2 whitespace-pre-wrap text-danger">{x.error}</pre>}
          {x.output && <pre className="soc-scroll max-h-48 overflow-auto rounded bg-sunken p-2 whitespace-pre-wrap text-ink">{x.output}</pre>}
          {x.sandbox && <p className="text-faint">sandbox: {x.sandbox} · {x.calls_count ?? "?"} traced calls</p>}
        </div>
      )}
    </div>
  );
}

function TrajectoryTable({ events, scope }: { events: TrajectoryEvent[]; scope: string[] }) {
  const scrub = useRun((s) => s.scrub);
  if (!events.length)
    return (
      <Empty icon={<ScrollText className="size-5" />} title="No events">
        Every tool call the agent makes appears here{scope.length ? "" : " once it starts"}.
      </Empty>
    );
  return (
    <div className="mx-4 overflow-hidden rounded-xl border border-line">
      <table className="w-full text-[11px]">
        <tbody>
          {[...events].reverse().map((e) => (
            <tr
              key={e.seq}
              onClick={() => jumpTo(e.seq, e.node)}
              className={cx(
                "cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60",
                scrub === e.seq && "bg-accent-soft/60",
                e.fact && "bg-danger-soft/60",
              )}
            >
              <td className="w-10 px-2 py-1.5 font-mono text-faint">{e.seq}</td>
              <td className="w-14 px-1 py-1.5">
                <span className={cx("font-mono font-semibold", kindTone(e))}>{e.kind}</span>
              </td>
              <td className="max-w-0 truncate px-1 py-1.5 font-mono text-ink" title={detail(e)}>
                {detail(e)}
              </td>
              <td className="w-16 px-2 py-1.5 text-right">
                {e.fact ? (
                  <Badge tone="danger">{e.fact === "revert" ? "revert" : "out"}</Badge>
                ) : e.in_scope === false ? (
                  <span className="text-faint">outside</span>
                ) : e.kind === "cmd" ? (
                  <span className={e.exit === 0 ? "text-ok" : "text-danger"}>exit {e.exit}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function kindTone(e: TrajectoryEvent) {
  if (e.kind === "write") return e.in_scope === false ? "text-danger" : "text-accent";
  if (e.kind === "pause" || e.kind === "steer") return "text-warn";
  return "text-muted";
}

function detail(e: TrajectoryEvent): string {
  switch (e.kind) {
    case "read":
    case "write":
      return e.path ?? "";
    case "cmd":
      return e.cmd ?? "";
    case "http":
      return `${e.host} → ${e.status ?? "error"}`;
    case "exec":
      return `${e.exec_id} ${e.mode}`;
    case "pause":
      return `paused: ${e.reason?.replace("_", " ")}`;
    case "steer":
      return `“${e.text}”`;
    case "done":
      return (e.summary ?? "").split("\n")[0];
    default:
      return "";
  }
}
