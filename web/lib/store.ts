"use client";
// One zustand store per open run. The server is authoritative: the page loads GET /runs/{id} once, then every
// WS message is reduced here the moment it arrives (only the agent dot's *visual* position lags, in the city).
import { create } from "zustand";
import type {
  Building,
  Edge,
  ExecSummary,
  Patch,
  RunDetail,
  Scene,
  TrailItem,
  TrajectoryEvent,
  WsMessage,
} from "@/lib/contracts";

export type WsStatus = "idle" | "connecting" | "open" | "closed";

function newClientId(): string {
  return `web-${Math.random().toString(36).slice(2, 6)}`;
}

export interface RunStore {
  runId: string | null;
  clientId: string;
  status: "idle" | "loading" | "ready" | "error";
  loadError: string | null;
  wsStatus: WsStatus;
  scene: Scene | null;
  graphVersion: number;
  events: TrajectoryEvent[];
  execs: ExecSummary[];
  patches: Patch[];
  decisions: RunDetail["decisions"];
  pauses: RunDetail["pauses"];
  summary: string | null;
  archived: boolean;
  selected: string | null;
  selectedBy: string | null;
  hovered: string | null;
  scrub: number | null;
  scrubBy: string | null;
  steeredAt: number | null;
  lastError: string | null;

  reset: (runId: string) => void;
  setLoadError: (message: string) => void;
  load: (d: RunDetail) => void;
  setWs: (s: WsStatus) => void;
  apply: (m: WsMessage) => void;
  select: (node: string | null, by?: string) => void;
  hover: (node: string | null) => void;
  setScrub: (seq: number | null, by?: string) => void;
}

function trailItem(e: TrajectoryEvent): TrailItem {
  return { seq: e.seq, node: e.node ?? null, kind: e.kind, in_scope: e.in_scope ?? true, revert: !!e.revert };
}

function execsFromTraces(d: RunDetail): ExecSummary[] {
  return d.traces.map((t) => ({
    exec_id: t.exec_id,
    mode: t.mode,
    input: t.input,
    running: false,
    exit: t.exit,
    output: t.output,
    http_count: t.http.length,
    calls_count: t.calls.length,
    sandbox: t.sandbox,
    error: t.sandbox_error ? t.stderr_tail : null,
    http: t.http,
    sinks: t.calls.filter((c) => c.sink),
  }));
}

const empty = {
  status: "idle" as const,
  loadError: null,
  wsStatus: "idle" as const,
  scene: null,
  graphVersion: 0,
  events: [],
  execs: [],
  patches: [],
  decisions: [],
  pauses: [],
  summary: null,
  archived: false,
  selected: null,
  selectedBy: null,
  hovered: null,
  scrub: null,
  scrubBy: null,
  steeredAt: null,
  lastError: null,
};

export const useRun = create<RunStore>()((set, get) => ({
  runId: null,
  clientId: newClientId(),
  ...empty,

  reset: (runId) => set({ ...empty, runId, status: "loading" }),
  setLoadError: (message) => set({ status: "error", loadError: message }),
  setWs: (wsStatus) => set({ wsStatus }),

  load: (d) => {
    const { events, patches, decisions, pauses, summary, archived } = d;
    const scene: Scene = {
      run_id: d.run_id, repo: d.repo, intent: d.intent, replay: d.replay, probe_entry: d.probe_entry,
      happy_input: d.happy_input, github_pr: d.github_pr, phase: d.phase, graph: d.graph, scope: d.scope,
      scope_nodes: d.scope_nodes, agent: d.agent, drift: d.drift, trail: d.trail, claims: d.claims, gate: d.gate,
      iteration: d.iteration, cursors: d.cursors, scrub: d.scrub, final: d.final, error: d.error, notes: d.notes,
    };
    set({
      status: "ready",
      scene,
      graphVersion: get().graphVersion + 1,
      events,
      execs: execsFromTraces(d),
      patches,
      decisions,
      pauses,
      summary,
      archived: !!archived,
      scrub: d.scrub,
    });
  },

  apply: (m) => {
    const s = get();
    const scene = s.scene;
    switch (m.t) {
      case "scene":
        set({ scene: m.scene, graphVersion: s.graphVersion + 1 });
        return;
      case "phase":
        if (scene) set({ scene: { ...scene, phase: m.phase } });
        return;
      case "claims":
        if (scene) set({ scene: { ...scene, claims: m.claims } });
        return;
      case "graph_patch": {
        if (!scene) return;
        const byId = new Map<string, Building>(scene.graph.nodes.map((n) => [n.id, n]));
        for (const n of m.nodes) byId.set(n.id, n);
        let edges: Edge[] = scene.graph.edges;
        const replaced = Object.keys(m.edges);
        if (replaced.length) {
          edges = edges.filter((e) => !replaced.includes(e.src)).concat(...replaced.map((k) => m.edges[k]));
        }
        const nodes = [...byId.values()];
        const scope_nodes = nodes.filter((n) => n.in_scope).map((n) => n.id);
        set({
          scene: { ...scene, graph: { ...scene.graph, nodes, edges }, scope_nodes },
          graphVersion: s.graphVersion + 1,
        });
        return;
      }
      case "traj_event": {
        const e = m.event;
        if (s.events.some((x) => x.seq === e.seq)) return; // idempotent across reconnects
        const events = [...s.events, e];
        if (!scene) {
          set({ events });
          return;
        }
        const trail = ["read", "write", "cmd", "http", "exec"].includes(e.kind) ? [...scene.trail, trailItem(e)] : scene.trail;
        set({
          events,
          scene: {
            ...scene,
            trail,
            drift: e.drift ?? scene.drift,
            agent: { ...scene.agent, node: e.node ?? scene.agent.node, drift: e.drift?.score ?? scene.agent.drift },
          },
        });
        return;
      }
      case "agent_state":
        if (scene) set({ scene: { ...scene, agent: { ...scene.agent, state: m.state } } });
        if (m.reason === "steered") set({ steeredAt: Date.now() });
        return;
      case "gate":
        if (scene) set({ scene: { ...scene, gate: { which: m.which, resume_url: m.resume_url, reason: m.reason ?? null } } });
        return;
      case "decision":
        set({
          decisions: [...s.decisions, { which: m.which, decision: m.decision, text: m.text, by: m.by, at: Date.now() / 1000 }],
        });
        return;
      case "exec_start":
        set({
          execs: [
            ...s.execs.filter((x) => x.exec_id !== m.exec_id),
            { exec_id: m.exec_id, mode: m.mode, input: m.input, running: true, http: [], sinks: [] },
          ],
        });
        return;
      case "trace_event":
        set({
          execs: s.execs.map((x) =>
            x.exec_id !== m.exec_id
              ? x
              : m.kind === "http"
                ? { ...x, http: [...x.http, m.item as ExecSummary["http"][number]] }
                : { ...x, sinks: [...x.sinks, m.item as ExecSummary["sinks"][number]] },
          ),
        });
        return;
      case "exec_end":
        set({
          execs: s.execs.map((x) =>
            x.exec_id !== m.exec_id
              ? x
              : {
                  ...x,
                  running: false,
                  exit: m.exit,
                  output: m.output,
                  http_count: m.http_count,
                  calls_count: m.calls_count,
                  sandbox: m.sandbox,
                  error: m.error,
                },
          ),
        });
        return;
      case "verdicts": {
        if (!scene) return;
        const by = new Map(m.verdicts.map((v) => [v.claim_id, v]));
        set({
          scene: {
            ...scene,
            iteration: m.iteration,
            claims: scene.claims.map((c) => (by.has(c.id) ? { ...c, verdict: by.get(c.id) } : c)),
          },
        });
        return;
      }
      case "patch_proposed":
        set({
          patches: [
            ...s.patches.filter((p) => p.iteration !== m.iteration),
            { iteration: m.iteration, diff: m.diff, rationale: m.rationale, source: m.source, files: m.files },
          ],
        });
        return;
      case "cursors":
        if (scene) set({ scene: { ...scene, cursors: m.items } });
        return;
      case "select":
        if (m.by !== s.clientId) set({ selected: m.node, selectedBy: m.by });
        return;
      case "scrub":
        if (m.by !== s.clientId) set({ scrub: m.seq, scrubBy: m.by });
        return;
      case "final":
        if (scene) set({ scene: { ...scene, final: m.state, phase: "final" } });
        return;
      case "note":
        if (scene && !scene.notes.includes(m.text)) set({ scene: { ...scene, notes: [...scene.notes, m.text] } });
        return;
      case "error":
        set({ lastError: m.message, scene: scene ? { ...scene, error: m.message, phase: "error" } : scene });
        return;
      default:
        return; // unknown `t`: ignored, never fatal (§6)
    }
  },

  select: (node, by) => set({ selected: node, selectedBy: by ?? get().clientId }),
  hover: (hovered) => set({ hovered }),
  setScrub: (scrub, by) => set({ scrub, scrubBy: by ?? get().clientId }),
}));

/** fan_in per building (DESIGN.md): number of import edges whose dst is the building. */
export function fanIn(scene: Scene | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of scene?.graph.edges ?? []) m.set(e.dst, (m.get(e.dst) ?? 0) + 1);
  return m;
}
