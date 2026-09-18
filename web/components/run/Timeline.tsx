"use client";
// seq-axis scrubber under the city. Scrub position is shared with every client (VR follows) via WS `scrub`.
import { Radio } from "lucide-react";
import { useMemo } from "react";
import { color } from "@/lib/design";
import { useRun } from "@/lib/store";
import { sendUpstream } from "@/lib/useRun";
import { cx } from "@/components/ui";

export function Timeline() {
  const events = useRun((s) => s.events);
  const scrub = useRun((s) => s.scrub);
  const scrubBy = useRun((s) => s.scrubBy);
  const clientId = useRun((s) => s.clientId);
  const max = events.at(-1)?.seq ?? 0;

  const ticks = useMemo(
    () =>
      events
        .map((e) => {
          if (e.fact) return { seq: e.seq, c: color.danger, h: 14 };
          if (e.kind === "pause") return { seq: e.seq, c: color.danger, h: 18 };
          if (e.kind === "steer") return { seq: e.seq, c: color.warn, h: 14 };
          if (e.kind === "write") return { seq: e.seq, c: e.in_scope === false ? color.danger : color.accent, h: 9 };
          if (e.kind === "exec") return { seq: e.seq, c: color.muted, h: 7 };
          return { seq: e.seq, c: e.in_scope === false ? "#F4A3A6" : "#C7D2E3", h: 5 };
        }),
    [events],
  );

  const set = (seq: number | null) => {
    useRun.getState().setScrub(seq);
    sendUpstream({ t: "scrub", seq, by: clientId });
  };
  const at = scrub ?? max;
  const current = events.find((e) => e.seq === at);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={() => set(null)}
        disabled={scrub === null}
        className={cx(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition",
          scrub === null ? "border-accent/25 bg-accent-soft text-accent-strong" : "border-line bg-surface text-muted hover:text-ink",
        )}
      >
        <Radio className="size-3.5" /> Live
      </button>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-[8px] bottom-[13px] h-5">
          {max > 0 &&
            ticks.map((t) => (
              <span
                key={t.seq}
                className="absolute bottom-0 w-[2px] -translate-x-1/2 rounded-full"
                style={{ left: `${((t.seq - 1) / Math.max(max - 1, 1)) * 100}%`, height: t.h, background: t.c }}
              />
            ))}
        </div>
        <input
          type="range"
          className="soc-range relative mt-4"
          min={1}
          max={Math.max(max, 1)}
          value={Math.max(at, 1)}
          disabled={max === 0}
          style={{ ["--soc-thumb" as string]: scrub === null ? color.accent : color.text }}
          onChange={(e) => set(Number(e.target.value))}
        />
      </div>
      <div className="w-[190px] shrink-0 text-right font-mono text-[11px] leading-tight text-muted">
        {max === 0 ? (
          "no events yet"
        ) : (
          <>
            <div className="text-ink">
              t = seq {at} <span className="text-faint">/ {max}</span>
            </div>
            <div className="truncate" title={current?.path ?? current?.cmd ?? ""}>
              {current ? `${current.kind} ${current.path ?? current.cmd ?? current.host ?? ""}` : ""}
              {scrub !== null && scrubBy && scrubBy !== clientId ? ` · by ${scrubBy}` : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
