// Single zustand store. Every WsMessage is reduced here, instantly (DESIGN.md → Motion:
// state commits the moment an event arrives; only the dot's visual position lags).
import { create } from "zustand";
import type {
  AgentState,
  Claim,
  Cursor,
  Drift,
  FinalState,
  Gate,
  SceneSnapshot,
  TrailItem,
  TrajectoryEvent,
  Verdict,
  WsMessage,
} from "@/lib/contracts";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type WsStatus = "idle" | "connecting" | "open" | "closed";
export type Source = "core" | "local";

export interface Agent {
  node: string | null;
  state: AgentState;
  reason: string | null;
  drift: number;
}

export interface RunState {
  runId: string | null;
  source: Source;
  sceneStatus: LoadStatus;
  sceneError: string | null;
  wsStatus: WsStatus;
  scene: SceneSnapshot | null;
  events: TrajectoryEvent[];
  agent: Agent;
  trail: TrailItem[];
  drift: Drift | null;
  claims: Claim[];
  verdicts: Verdict[];
  gate: Gate | null;
  cursors: Cursor[];
  selected: string | null;
  selectedBy: string | null;
  scrubSeq: number | null;
  scrubBy: string | null;
  steeredAt: number | null; // ms timestamp of the last steer decision (DESIGN "Steered" 2 s pill)
  final: FinalState | null;
  patch: { iteration: number; diff: string; rationale: string } | null;
}

export interface RunActions {
  reset: (runId: string, source: Source) => void;
  setSceneStatus: (status: LoadStatus, error?: string) => void;
  setWsStatus: (status: WsStatus) => void;
  setScene: (scene: SceneSnapshot) => void;
  apply: (msg: WsMessage) => void;
  setScrub: (seq: number | null) => void;
  setSelected: (node: string | null) => void;
}

const initialAgent: Agent = { node: null, state: "running", reason: null, drift: 0 };

const initial: RunState = {
  runId: null,
  source: "core",
  sceneStatus: "idle",
  sceneError: null,
  wsStatus: "idle",
  scene: null,
  events: [],
  agent: initialAgent,
  trail: [],
  drift: null,
  claims: [],
  verdicts: [],
  gate: null,
  cursors: [],
  selected: null,
  selectedBy: null,
  scrubSeq: null,
  scrubBy: null,
  steeredAt: null,
  final: null,
  patch: null,
};

/** Trail item from a live event. in_scope falls back to the node's flag when core omits it (non read/write kinds). */
function trailItemFrom(ev: TrajectoryEvent, scene: SceneSnapshot | null): TrailItem {
  const nodeInScope = scene?.graph.nodes.find((n) => n.id === ev.node)?.in_scope ?? true;
  return {
    seq: ev.seq,
    node: ev.node,
    kind: ev.kind,
    in_scope: ev.in_scope ?? nodeInScope,
    revert: ev.drift?.revert ?? false,
  };
}

function stateFromKind(kind: TrajectoryEvent["kind"], current: AgentState): AgentState {
  switch (kind) {
    case "pause":
      return "paused";
    case "resume":
    case "steer":
      return "running";
    case "done":
      return "done";
    default:
      return current;
  }
}

export const useRunStore = create<RunState & RunActions>()((set, get) => ({
  ...initial,

  reset: (runId, source) => set({ ...initial, runId, source }),

  setSceneStatus: (sceneStatus, sceneError) => set({ sceneStatus, sceneError: sceneError ?? null }),

  setWsStatus: (wsStatus) => set({ wsStatus }),

  setScene: (scene) =>
    set({
      scene,
      sceneStatus: "ready",
      sceneError: null,
      trail: scene.trail,
      claims: scene.claims,
      gate: scene.gate,
      cursors: scene.cursors,
      agent: { node: scene.agent.node, state: scene.agent.state, reason: null, drift: scene.agent.drift },
    }),

  apply: (msg) => {
    const s = get();
    switch (msg.t) {
      case "traj_event": {
        const ev = msg.event;
        // Idempotent on seq so a reconnect replaying the same events doesn't double the trail.
        if (s.events.some((e) => e.seq === ev.seq)) return;
        set({
          events: [...s.events, ev],
          trail: [...s.trail, trailItemFrom(ev, s.scene)],
          drift: ev.drift,
          agent: {
            ...s.agent,
            node: ev.node,
            drift: ev.drift?.score ?? s.agent.drift,
            state: stateFromKind(ev.kind, s.agent.state),
          },
        });
        return;
      }
      case "agent_state":
        set({ agent: { ...s.agent, state: msg.state, reason: msg.reason ?? null } });
        return;
      case "claims":
        set({ claims: msg.claims });
        return;
      case "verdicts": {
        const byClaim = new Map(msg.verdicts.map((v) => [v.claim_id, v]));
        set({
          verdicts: msg.verdicts,
          claims: s.claims.map((c) => (byClaim.has(c.id) ? { ...c, verdict: byClaim.get(c.id) } : c)),
        });
        return;
      }
      case "gate":
        set({ gate: { which: msg.which, resume_url: msg.resume_url } });
        return;
      case "decision":
        set({
          gate: null,
          steeredAt: msg.decision === "steer" ? Date.now() : s.steeredAt,
          agent: msg.decision === "kill" ? { ...s.agent, state: "killed" } : s.agent,
        });
        return;
      case "patch_proposed":
        set({ patch: { iteration: msg.iteration, diff: msg.diff, rationale: msg.rationale } });
        return;
      case "cursors":
        set({ cursors: msg.items });
        return;
      case "select":
        set({ selected: msg.node, selectedBy: msg.by });
        return;
      case "scrub":
        set({ scrubSeq: msg.seq, scrubBy: msg.by });
        return;
      case "final":
        set({ final: msg.state, agent: msg.state === "killed" ? { ...s.agent, state: "killed" } : s.agent });
        return;
      case "run_created":
      case "exec_start":
      case "trace_event":
      case "exec_end":
        // H12+: evidence panel. Accepted, not yet rendered.
        return;
      default:
        // Unknown `t` is ignored, never fatal (§6).
        return;
    }
  },

  setScrub: (scrubSeq) => set({ scrubSeq, scrubBy: scrubSeq === null ? null : "web-1" }),
  setSelected: (selected) => set({ selected, selectedBy: selected === null ? null : "web-1" }),
}));

/** Position lookup shared by every city component. Positions come from the server only. */
export function nodePos(scene: SceneSnapshot | null, id: string): [number, number, number] | null {
  return scene?.graph.nodes.find((n) => n.id === id)?.pos ?? null;
}

/** DESIGN.md: fan_in = number of edges whose dst is the node. */
export function fanInMap(scene: SceneSnapshot | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of scene?.graph.edges ?? []) m.set(e.dst, (m.get(e.dst) ?? 0) + 1);
  return m;
}
