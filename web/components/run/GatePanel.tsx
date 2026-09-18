"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Cog, Info, Plus, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Claim, Scene } from "@/lib/contracts";
import { STEER_PRESETS } from "@/lib/design";
import { useRun } from "@/lib/store";
import { pathInScope } from "@/lib/glob";
import { Badge, Button, Field, Spinner, cx, inputClass } from "@/components/ui";

export interface Draft {
  claims: Claim[];
  scope: string[];
  probe: string;
  happy: string;
}

export function useGateActions(scene: Scene | null, draft: Draft | null) {
  const clientId = useRun((s) => s.clientId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steerOpen, setSteerOpen] = useState(false);
  const [steerText, setSteerText] = useState("");

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const id = scene?.run_id ?? "";
  const which = scene?.gate.which ?? null;
  const decide = (decision: string, text?: string) =>
    run(decision, () => api.decision(id, { which: which!, decision, text, by: clientId }));

  return {
    busy,
    error,
    steerOpen,
    setSteerOpen,
    steerText,
    setSteerText,
    confirm: () =>
      draft &&
      which === "intent" &&
      run("confirm", () =>
        api.confirm(id, {
          claims: draft.claims,
          scope: draft.scope,
          probe_entry: draft.probe || null,
          happy_input: draft.happy || null,
          by: clientId,
        }),
      ),
    cont: () => which === "pause" && decide("continue"),
    steer: (text: string) => which === "pause" && text.trim() && decide("steer", text.trim()).then(() => setSteerOpen(false)),
    kill: () => which === "pause" && decide("kill"),
    approve: () => which === "approve" && decide("approve"),
    reject: () => which === "approve" && decide("reject"),
  };
}

export type GateActions = ReturnType<typeof useGateActions>;

/** Keyboard (MVP.md §9): Space continue, S steer, K kill, A approve, R reject, C confirm. */
export function useGateKeys(scene: Scene | null, a: GateActions) {
  const ref = useRef(a);
  ref.current = a;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const which = scene?.gate.which;
      const k = e.key.toLowerCase();
      if (which === "intent" && k === "c") ref.current.confirm();
      if (which === "pause" && k === " ") {
        e.preventDefault();
        ref.current.cont();
      }
      if (which === "pause" && k === "s") {
        e.preventDefault();
        ref.current.setSteerOpen(true);
      }
      if (which === "pause" && k === "k") ref.current.kill();
      if (which === "approve" && k === "a") ref.current.approve();
      if (which === "approve" && k === "r") ref.current.reject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene?.gate.which]);
}

export function GatePanel({ scene, draft, setDraft, actions }: {
  scene: Scene;
  draft: Draft | null;
  setDraft: (d: Draft) => void;
  actions: GateActions;
}) {
  const which = scene.gate.which;
  return (
    <div className="space-y-4 p-4">
      {which === "intent" && draft && <IntentGate scene={scene} draft={draft} setDraft={setDraft} a={actions} />}
      {which === "pause" && <PauseGate scene={scene} a={actions} />}
      {which === "approve" && <ApproveGate scene={scene} a={actions} />}
      {!which && <Status scene={scene} />}
      {actions.error && (
        <p className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{actions.error}</p>
      )}
      <Notes notes={scene.notes} />
    </div>
  );
}

function IntentGate({ scene, draft, setDraft, a }: { scene: Scene; draft: Draft; setDraft: (d: Draft) => void; a: GateActions }) {
  const [glob, setGlob] = useState("");
  const inScope = scene.graph.nodes.filter((n) => pathInScope(n.id, draft.scope)).length;
  const addGlob = () => {
    const g = glob.trim();
    if (g && !draft.scope.includes(g)) setDraft({ ...draft, scope: [...draft.scope, g] });
    setGlob("");
  };
  return (
    <>
      <div>
        <h3 className="text-[15px] font-semibold">Review claims &amp; scope</h3>
        <p className="mt-0.5 text-xs text-muted">HITL #1 — the agent starts only after you confirm. The lit district previews your scope live.</p>
      </div>
      <Field label="Write scope" hint={`${inScope} of ${scene.graph.nodes.length} files in scope. Globs are repo-relative; dir/** means everything under dir.`}>
        <div className="flex flex-wrap gap-1.5">
          {draft.scope.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent-soft px-2 py-1 font-mono text-xs text-accent-strong">
              {g}
              <button onClick={() => setDraft({ ...draft, scope: draft.scope.filter((x) => x !== g) })} className="opacity-60 hover:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {!draft.scope.length && <span className="text-xs text-danger">Add at least one glob.</span>}
        </div>
        {draft.scope.length > 0 && inScope === 0 && (
          <span className="text-xs text-warn">
            No existing file matches yet — fine for a new feature folder. Files the agent creates there will light up.
          </span>
        )}
        <div className="flex gap-1.5">
          <input
            className={cx(inputClass, "font-mono text-xs")}
            placeholder="src/feature/**"
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGlob()}
          />
          <Button size="md" onClick={addGlob}>
            <Plus className="size-4" />
          </Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Probe entrypoint" hint="module:function(str)">
          <input className={cx(inputClass, "font-mono text-xs")} placeholder="optional" value={draft.probe} onChange={(e) => setDraft({ ...draft, probe: e.target.value })} />
        </Field>
        <Field label="Happy input" hint="normal input">
          <input className={cx(inputClass, "text-xs")} placeholder="optional" value={draft.happy} onChange={(e) => setDraft({ ...draft, happy: e.target.value })} />
        </Field>
      </div>
      <Button variant="primary" size="lg" className="w-full" kbd="C" loading={a.busy === "confirm"} disabled={!draft.scope.length || !draft.claims.length} onClick={() => a.confirm()}>
        Confirm claims &amp; start
      </Button>
    </>
  );
}

function PauseGate({ scene, a }: { scene: Scene; a: GateActions }) {
  const events = useRun((s) => s.events);
  const trigger = [...events].reverse().find((e) => e.fact);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (a.steerOpen) inputRef.current?.focus();
  }, [a.steerOpen]);
  return (
    <>
      <div className="rounded-xl border border-danger/30 bg-danger-soft p-4">
        <div className="flex items-center gap-2 font-semibold text-danger">
          <AlertTriangle className="size-4" />
          {scene.gate.reason === "revert" ? "Paused — the agent reverted its own work" : "Paused — out of scope"}
        </div>
        {trigger && (
          <p className="mt-2 text-sm text-ink">
            The agent wrote <span className="font-mono font-semibold">{trigger.path}</span>{" "}
            <span className="text-muted">(seq {trigger.seq})</span>
            {trigger.fact === "scope_violation" ? `, outside ${scene.scope.join(", ")}.` : ", restoring an earlier version."}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">It is blocked before its next tool call until you decide.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="primary" kbd="Space" loading={a.busy === "continue"} onClick={() => a.cont()}>
          Continue
        </Button>
        <Button kbd="S" onClick={() => a.setSteerOpen(!a.steerOpen)} className={cx(a.steerOpen && "border-warn text-warn")}>
          Steer
        </Button>
        <Button variant="danger" kbd="K" loading={a.busy === "kill"} onClick={() => a.kill()}>
          Kill
        </Button>
      </div>
      {a.steerOpen && (
        <div className="space-y-2 rounded-xl border border-warn/30 bg-warn-soft/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {STEER_PRESETS.map((p) => (
              <button key={p} onClick={() => a.setSteerText(p)} className="rounded-md border border-warn/30 bg-surface px-2 py-1 text-xs hover:border-warn">
                {p}
              </button>
            ))}
          </div>
          <textarea
            ref={inputRef}
            className={cx(inputClass, "min-h-[64px] text-sm")}
            placeholder="Message injected into the agent's conversation…"
            value={a.steerText}
            onChange={(e) => a.setSteerText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && a.steer(a.steerText)}
          />
          <Button variant="primary" className="w-full" loading={a.busy === "steer"} disabled={!a.steerText.trim()} onClick={() => a.steer(a.steerText)}>
            Send steer &amp; resume
          </Button>
        </div>
      )}
    </>
  );
}

function ApproveGate({ scene, a }: { scene: Scene; a: GateActions }) {
  const vs = scene.claims.map((c) => c.verdict?.verdict).filter(Boolean) as string[];
  const real = vs.filter((v) => v === "REAL").length;
  const bad = vs.filter((v) => ["FAKE", "DEAD", "DRIFT", "VULN"].includes(v)).length;
  return (
    <>
      <div className="rounded-xl border border-line bg-sunken/60 p-4">
        <h3 className="text-[15px] font-semibold">Ready for your decision</h3>
        <p className="mt-0.5 text-xs text-muted">HITL #2 — approve to merge, reject to discard.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="ok">{real} real</Badge>
          {bad > 0 && <Badge tone="danger">{bad} failed</Badge>}
          {vs.length - real - bad > 0 && <Badge tone="warn">{vs.length - real - bad} inconclusive</Badge>}
          <Badge tone="muted">{scene.iteration} fix iteration{scene.iteration === 1 ? "" : "s"}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ok" size="lg" kbd="A" loading={a.busy === "approve"} onClick={() => a.approve()}>
          <CheckCircle2 className="size-4" /> Approve
        </Button>
        <Button variant="danger" size="lg" kbd="R" loading={a.busy === "reject"} onClick={() => a.reject()}>
          <CircleSlash className="size-4" /> Reject
        </Button>
      </div>
    </>
  );
}

function Status({ scene }: { scene: Scene }) {
  const execs = useRun((s) => s.execs);
  const events = useRun((s) => s.events);
  const running = execs.filter((e) => e.running);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (scene.phase === "error")
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
        <p className="font-semibold text-danger">The run hit an error</p>
        <p className="mt-1 font-mono text-xs break-words text-ink">{scene.error}</p>
      </div>
    );
  if (scene.phase === "final") {
    const tone = scene.final === "merged" ? "ok" : "danger";
    return (
      <div className="space-y-3">
        <div className={cx("rounded-xl border p-4", tone === "ok" ? "border-ok/30 bg-ok-soft" : "border-danger/30 bg-danger-soft")}>
          <p className={cx("font-semibold", tone === "ok" ? "text-ok" : "text-danger")}>
            {scene.final === "merged" ? "Approved and merged" : scene.final === "killed" ? "Agent killed" : `Run ${scene.final}`}
          </p>
          <p className="mt-1 text-xs text-muted">The decision is in the audit log (History).</p>
        </div>
        {!scene.replay && (
          <Button
            size="sm"
            loading={saving}
            onClick={async () => {
              const name = prompt("Recording name (letters, digits, - _ .)", `run-${scene.run_id}`);
              if (!name) return;
              setSaving(true);
              try {
                await api.saveRecording(scene.run_id, name);
                setSaved(name);
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            <Save className="size-3.5" /> Save as recording
          </Button>
        )}
        {saved && <p className="text-xs text-ok">Saved as “{saved}” — replayable offline.</p>}
      </div>
    );
  }
  const lines: Record<string, string> = {
    extracting: "Reading the intent and mapping the repo…",
    running: `The agent is working — ${events.length} events so far. It will be paused automatically if it writes outside scope or reverts its own work.`,
    checking: running.length ? `Running ${running[0].mode} execution ${running[0].exec_id} in the sandbox…` : "Computing verdicts from the trajectory and sandbox traces…",
    fixing: "The Fixer is preparing a patch for the failed claims…",
  };
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-sunken/60 p-4">
      {scene.phase === "running" ? <span className="mt-1 size-2.5 shrink-0 animate-pulse rounded-full bg-accent" /> : scene.phase === "fixing" ? <Cog className="mt-0.5 size-4 animate-spin text-muted" /> : <Spinner />}
      <p className="text-sm text-ink">{lines[scene.phase] ?? scene.phase}</p>
    </div>
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">About this run</p>
      {notes.map((n) => (
        <p key={n} className="flex gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-faint" />
          {n}
        </p>
      ))}
    </div>
  );
}
