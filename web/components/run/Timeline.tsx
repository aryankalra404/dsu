"use client";
import { useMemo } from "react";
import { color } from "@/lib/design";
import { useRunStore } from "@/lib/store";
import type { WsUpstream } from "@/lib/contracts";

/**
 * Timeline scrubber under the canvas (DESIGN.md → Motion → Scrub). Dragging sets scrubSeq locally and shares it
 * upstream so VR looks at the same moment; "Live" clears. Ticks: red where the event was out of scope.
 */
export function Timeline({ send }: { send: (m: WsUpstream) => void }) {
  const events = useRunStore((s) => s.events);
  const trail = useRunStore((s) => s.trail);
  const scrubSeq = useRunStore((s) => s.scrubSeq);
  const scrubBy = useRunStore((s) => s.scrubBy);
  const setScrub = useRunStore((s) => s.setScrub);

  // Range spans the snapshot trail and live events, so a client that joins mid-run still gets a full axis.
  const { min, max } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const e of events) { lo = Math.min(lo, e.seq); hi = Math.max(hi, e.seq); }
    for (const t of trail) { lo = Math.min(lo, t.seq); hi = Math.max(hi, t.seq); }
    if (!Number.isFinite(lo)) return { min: 0, max: 0 };
    return { min: lo, max: hi };
  }, [events, trail]);

  const value = scrubSeq ?? max;
  const live = scrubSeq === null;
  const current = useMemo(() => events.find((e) => e.seq === value), [events, value]);

  const onChange = (seq: number) => {
    const s = seq >= max ? null : seq;
    setScrub(s);
    if (s !== null) send({ t: "scrub", seq: s });
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={() => { setScrub(null); }}
        className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
        style={{
          borderColor: live ? color.accent : `${color.nodeDim}88`,
          color: live ? color.accent : color.nodeDim,
          boxShadow: live ? `0 0 8px ${color.accent}55` : "none",
        }}
      >
        {live ? "● live" : "live"}
      </button>
      <div className="relative flex-1">
        {/* out-of-scope ticks */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden">
          {trail.map((t) =>
            !t.in_scope && max > min && t.seq >= min && t.seq <= max ? (
              <span
                key={t.seq}
                className="absolute top-0 h-3 w-px"
                style={{ left: `${((t.seq - min) / (max - min)) * 100}%`, background: color.danger, opacity: 0.8 }}
              />
            ) : null,
          )}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={events.length === 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="soc-range relative w-full"
          style={{ ["--soc-range-color" as string]: live ? color.accent : color.warn }}
          aria-label="timeline"
        />
      </div>
      <span className="w-36 truncate font-mono text-[11px] text-muted-foreground">
        seq {value}
        {current ? ` · ${current.kind}${current.path ? " " + current.path : current.cmd ? " " + current.cmd : ""}` : ""}
      </span>
      {!live && scrubBy && scrubBy !== "web-1" && (
        <span className="font-mono text-[10px]" style={{ color: color.warn }}>scrubbed by {scrubBy}</span>
      )}
    </div>
  );
}
