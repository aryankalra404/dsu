import Link from "next/link";
import { ArrowRight, Eye, FileSearch, PauseCircle, ShieldCheck } from "lucide-react";
import { RecentRuns } from "@/components/shell/RecentRuns";

const STEPS = [
  {
    icon: FileSearch,
    title: "Intent → claims",
    body: "Point it at any repo with a one-line task. It proposes checkable claims and a write scope; you edit and confirm them.",
  },
  {
    icon: Eye,
    title: "Watch it live",
    body: "Your repo becomes a 3D city. The agent is a dot moving across the rooftops; your scope is the lit district.",
  },
  {
    icon: PauseCircle,
    title: "Pause on facts",
    body: "The moment it writes outside scope or reverts its own work, it is paused before its next tool call. Continue, steer or kill.",
  },
  {
    icon: ShieldCheck,
    title: "Verdicts from evidence",
    body: "Every claim is ticked or crossed by a deterministic rule over the trajectory and sandbox traces. The LLM never judges.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-20">
      <section className="grid gap-10 pt-16 pb-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-accent" /> Real-time supervision for coding agents
          </p>
          <h1 className="text-[44px] leading-[1.08] font-semibold tracking-tight text-ink">
            See your coding agent <span className="text-accent">leave scope</span> — and stop it before its next move.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            Spatial SOC records every file read, write, command and HTTP call as a trajectory, maps it onto your
            codebase, pauses the agent on facts, and checks every claim it makes against evidence.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/runs/new"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-strong"
            >
              Supervise a run <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/history"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-5 text-[15px] font-medium hover:bg-sunken"
            >
              Past runs
            </Link>
          </div>
          <p className="mt-6 max-w-xl rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-ink">
            <b>Bounded claim.</b> Spatial SOC proves when an agent drifted, faked a capability, or claimed something it
            didn&apos;t do. It does not prove the agent&apos;s code is correct.
          </p>
        </div>
        <HeroCity />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                <s.icon className="size-4" />
              </span>
              <span className="font-mono text-xs text-faint">0{i + 1}</span>
            </div>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Recent runs</h2>
        <RecentRuns limit={6} />
      </section>
    </main>
  );
}

/** A static isometric illustration of the idea (not data): a lit district, a trail leaving it. */
function HeroCity() {
  const blocks: [number, number, number, boolean][] = [
    [0, 0, 34, true], [1, 0, 52, true], [0, 1, 26, true], [1, 1, 40, true],
    [3, 0, 22, false], [4, 0, 44, false], [3, 1, 30, false], [4, 1, 18, false],
    [0, 3, 20, false], [1, 3, 36, false], [3, 3, 58, false], [4, 3, 26, false],
  ];
  const iso = (x: number, y: number) => [160 + (x - y) * 30, 90 + (x + y) * 17] as const;
  return (
    <div className="relative rounded-3xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <svg viewBox="0 0 320 260" className="w-full">
        <polygon points={`${iso(-0.6, -0.6)} ${iso(2.2, -0.6)} ${iso(2.2, 2.2)} ${iso(-0.6, 2.2)}`} fill="#E7EEFF" stroke="#2F6BFF" strokeOpacity="0.35" />
        {blocks
          .slice()
          .sort((a, b) => a[0] + a[1] - (b[0] + b[1]))
          .map(([x, y, h, scope], i) => {
            const [cx, cy] = iso(x + 0.5, y + 0.5);
            const w = 22, d = 12.5;
            const top = scope ? "#A9C1FF" : x === 3 && y === 3 ? "#F4A3A6" : "#E3E8EF";
            const left = scope ? "#8FAAF5" : x === 3 && y === 3 ? "#E98A8E" : "#CFD6E1";
            const right = scope ? "#7C99EA" : x === 3 && y === 3 ? "#DD777C" : "#BFC8D5";
            return (
              <g key={i}>
                <polygon points={`${cx - w},${cy} ${cx},${cy + d} ${cx},${cy + d - h} ${cx - w},${cy - h}`} fill={left} />
                <polygon points={`${cx + w},${cy} ${cx},${cy + d} ${cx},${cy + d - h} ${cx + w},${cy - h}`} fill={right} />
                <polygon points={`${cx - w},${cy - h} ${cx},${cy - h - d} ${cx + w},${cy - h} ${cx},${cy + d - h}`} fill={top} />
              </g>
            );
          })}
        <path d={`M ${iso(0.5, 0.5)[0]} ${iso(0.5, 0.5)[1] - 62} Q 200 20 ${iso(3.5, 3.5)[0]} ${iso(3.5, 3.5)[1] - 76}`} fill="none" stroke="#E5484D" strokeWidth="2.5" strokeDasharray="5 4" />
        <path d={`M ${iso(1.5, 0.5)[0]} ${iso(1.5, 0.5)[1] - 70} Q 150 30 ${iso(0.5, 0.5)[0]} ${iso(0.5, 0.5)[1] - 62}`} fill="none" stroke="#2F6BFF" strokeWidth="2.5" />
        <circle cx={iso(3.5, 3.5)[0]} cy={iso(3.5, 3.5)[1] - 76} r="7" fill="#E5484D" />
        <circle cx={iso(3.5, 3.5)[0]} cy={iso(3.5, 3.5)[1] - 76} r="12" fill="none" stroke="#E5484D" strokeOpacity="0.4" strokeWidth="2" />
      </svg>
      <div className="absolute top-6 right-6 rounded-lg border border-danger/25 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
        Paused — out of scope
      </div>
    </div>
  );
}
