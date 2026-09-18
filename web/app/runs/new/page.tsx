"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderGit2, PlayCircle, Radio } from "lucide-react";
import { api } from "@/lib/api";
import type { Flags, Recording } from "@/lib/contracts";
import { Badge, Button, Card, Field, cx, inputClass } from "@/components/ui";

type Mode = "live" | "replay";

export default function NewRun() {
  const router = useRouter();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [recs, setRecs] = useState<Recording[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [repo, setRepo] = useState("");
  const [intent, setIntent] = useState("");
  const [replay, setReplay] = useState<string | null>(null);
  const [probeEntry, setProbeEntry] = useState("");
  const [happyInput, setHappyInput] = useState("");
  const [pr, setPr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.flags(), api.recordings()])
      .then(([f, r]) => {
        setFlags(f);
        setRecs(r);
        setMode(f.USE_LLM ? "live" : "replay");
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const pick = (r: Recording) => {
    setReplay(r.name);
    setIntent(r.intent);
    setRepo(r.repo);
    setProbeEntry(r.probe_entry ?? "");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await api.createRun({
        repo: mode === "live" ? repo : "",
        intent,
        replay: mode === "replay" ? replay : null,
        probe_entry: probeEntry || null,
        happy_input: happyInput || null,
        github_pr: pr || null,
      });
      router.push(`/runs/${run_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const canSubmit = mode === "live" ? !!repo.trim() && !!intent.trim() && !!flags?.USE_LLM : !!replay;

  return (
    <main className="mx-auto max-w-[920px] px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Supervise a run</h1>
      <p className="mt-1 text-sm text-muted">
        Point Spatial SOC at a repository and describe the task. You&apos;ll review the claims and scope before the agent
        starts.
      </p>
      {loadError && (
        <p className="mt-4 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{loadError}</p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={mode === "live"}
          onClick={() => setMode("live")}
          icon={<Radio className="size-5" />}
          title="Live agent"
          body="A real LLM agent works on your repo inside the harness."
          badge={flags && !flags.USE_LLM ? <Badge tone="warn">needs USE_LLM=true</Badge> : flags ? <Badge tone="accent">{flags.model}</Badge> : null}
        />
        <ModeCard
          active={mode === "replay"}
          onClick={() => setMode("replay")}
          icon={<PlayCircle className="size-5" />}
          title="Replay a recording"
          body="Offline: a recorded agent's moves, re-executed for real through the harness, checks and gates."
          badge={<Badge tone="muted">{recs.length} recording{recs.length === 1 ? "" : "s"}</Badge>}
        />
      </div>

      <Card className="mt-5 space-y-5 p-6">
        {mode === "replay" ? (
          <div className="space-y-2">
            <span className="text-[13px] font-medium">Recording</span>
            {recs.length === 0 && <p className="text-sm text-muted">No recordings found in core/fixtures/runs.</p>}
            <div className="grid gap-2">
              {recs.map((r) => (
                <button
                  key={r.name}
                  onClick={() => pick(r)}
                  className={cx(
                    "rounded-xl border p-3 text-left transition",
                    replay === r.name ? "border-accent bg-accent-soft/60 ring-3 ring-accent/10" : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{r.title}</span>
                    {r.recorded_with && <Badge tone="muted">recorded with {r.recorded_with}</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{r.intent}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Field label="Repository" hint="A folder on the core machine, or a git URL (cloned with --depth 1).">
            <div className="relative">
              <FolderGit2 className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" />
              <input
                className={cx(inputClass, "pl-9 font-mono")}
                placeholder="C:\\code\\my-service   or   https://github.com/org/repo.git"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
            </div>
          </Field>
        )}

        <Field label="Intent" hint={mode === "replay" ? "The recorded intent. The agent's moves are fixed by the recording." : "Say what to build and where it may write, e.g. “…only under src/payments”."}>
          <textarea
            className={cx(inputClass, "min-h-[96px] resize-y leading-relaxed")}
            placeholder="Add rate limiting to the /login endpoint in src/auth, with tests. Don't touch anything else."
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            readOnly={mode === "replay"}
          />
        </Field>

        <details className="group rounded-xl border border-line bg-sunken/50 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">Execution options (optional)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Probe entrypoint" hint="module:function taking one string. Enables the exploit probes.">
              <input className={cx(inputClass, "font-mono")} placeholder="app:run" value={probeEntry} onChange={(e) => setProbeEntry(e.target.value)} />
            </Field>
            <Field label="Happy-path input" hint="A normal input for the entrypoint.">
              <input className={inputClass} placeholder="I am a student earning 15000" value={happyInput} onChange={(e) => setHappyInput(e.target.value)} />
            </Field>
            <Field label="GitHub PR" hint="owner/repo#123 — verdict posted there on approval (needs GITHUB_TOKEN).">
              <input className={cx(inputClass, "font-mono")} placeholder="acme/api#42" value={pr} onChange={(e) => setPr(e.target.value)} />
            </Field>
          </div>
        </details>

        {error && <p className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {mode === "live" && flags && !flags.USE_LLM && (
            <span className="text-xs text-muted">Set USE_LLM=true and OPENAI_API_KEY in .env, then restart the core.</span>
          )}
          <Button variant="primary" size="lg" disabled={!canSubmit} loading={busy} onClick={submit}>
            Extract claims
          </Button>
        </div>
      </Card>
    </main>
  );
}

function ModeCard({ active, onClick, icon, title, body, badge }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-2xl border bg-surface p-4 text-left shadow-[var(--shadow-card)] transition",
        active ? "border-accent ring-3 ring-accent/10" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cx("grid size-9 place-items-center rounded-lg", active ? "bg-accent text-white" : "bg-sunken text-muted")}>{icon}</span>
        {badge}
      </div>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{body}</p>
    </button>
  );
}
