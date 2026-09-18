// MVP.md §6 — contracts are law. Field-for-field; do not add fields here, propose them in §6 first.

export type ClaimType =
  | "stays_in_scope"
  | "no_churn"
  | "fetches_external"
  | "declares_capability"
  | "resists_probe"
  | "reasons_on_input"; // §5, exactly six

export type ClaimSource = "llm" | "ast" | "human" | "agent" | "auto";

export interface Claim {
  id: string;
  type: ClaimType;
  text: string;
  target: string | null;
  axis: string | null;
  source: ClaimSource;
  confirmed: boolean;
  verdict?: Verdict; // "…Claim with optional verdict…" in the scene snapshot
}

export type EventKind = "read" | "write" | "cmd" | "http" | "exec" | "steer" | "pause" | "resume" | "done";
export type ExecMode = "happy" | "chaos" | "differential" | "probe";

export interface Drift {
  score: number;
  scope_violation: boolean;
  revert: boolean;
  churn: number;
  advisory: number;
}

export interface TrajectoryEvent {
  run_id: string;
  seq: number;
  ts_ms: number;
  kind: EventKind;
  path?: string; // read/write
  content_hash?: string; // write
  prev_hash?: string;
  region?: [number, number];
  cmd?: string; // cmd
  exit?: number;
  host?: string; // http
  status?: number;
  exec_id?: string; // exec
  mode?: ExecMode;
  in_scope?: boolean; // computed by core for read/write
  drift: Drift;
  node: string; // graph node id this event maps to (for the dot)
}

export interface TraceHttp {
  ts: number;
  method: string;
  host: string;
  path: string;
  status: number;
}
export interface TraceCall {
  ts: number;
  fn: string;
  arg_has_payload?: boolean;
}
export interface Trace {
  run_id: string;
  exec_id: string;
  mode: ExecMode;
  iteration: number;
  input: string;
  output: string;
  exit: number;
  duration_ms: number;
  http: TraceHttp[];
  calls: TraceCall[];
  defined: string[];
  stderr_tail: string;
}

export type VerdictLabel = "REAL" | "FAKE" | "DEAD" | "DRIFT" | "VULN" | "INCONCLUSIVE" | "PENDING";

export interface VerdictHint {
  kind: string;
  file: string;
  line: number;
  msg: string;
}
export interface Verdict {
  claim_id: string;
  verdict: VerdictLabel;
  iteration: number;
  rule: string;
  evidence: {
    exec_ids: string[];
    http_count: number | null;
    traj_seqs: number[];
    outputs_distinct: number | null;
  };
  hints: VerdictHint[];
}

// ---- Scene snapshot — GET /runs/{id}/scene ----------------------------------

export type Vec3 = [number, number, number];

export interface SceneNode {
  id: string;
  label: string;
  module: string;
  pos: Vec3; // metres, right-handed, Y up, origin at table centre, 0.8 m cube
  in_scope: boolean;
}
export interface SceneEdge {
  src: string;
  dst: string;
  kind: "import" | "call" | (string & {});
}
export type AgentState = "running" | "paused" | "done" | "killed";
export interface SceneAgent {
  node: string;
  state: AgentState;
  drift: number;
}
export interface TrailItem {
  seq: number;
  node: string;
  kind: EventKind;
  in_scope: boolean;
  revert: boolean;
}
export type GateWhich = "intent" | "pause" | "approve";
export interface Gate {
  which: GateWhich | null;
  resume_url: string;
}
export interface Cursor {
  client: string;
  kind: "head" | "mouse" | (string & {}); // §6 shows head + mouse; hands are sent by VR with their own kind strings
  pos: number[];
  rot?: number[];
}
export interface SceneSnapshot {
  graph: { nodes: SceneNode[]; edges: SceneEdge[] };
  scope_nodes: string[];
  agent: SceneAgent;
  trail: TrailItem[];
  claims: Claim[];
  gate: Gate;
  iteration: number;
  cursors: Cursor[];
}

// ---- WebSocket /ws/runs/{run_id}, server → clients --------------------------

export type FinalState = "merged" | "rejected" | "killed" | "max_iterations";
export type Decision = "continue" | "steer" | "kill" | "approve" | "reject";

export type WsMessage =
  | { t: "run_created"; run: Record<string, unknown> }
  | { t: "claims"; claims: Claim[] }
  | { t: "traj_event"; event: TrajectoryEvent }
  | { t: "agent_state"; state: AgentState; reason?: string }
  | { t: "exec_start"; exec_id: string; mode: ExecMode; input: string }
  | { t: "trace_event"; exec_id: string; kind: "http" | "call"; item: TraceHttp | TraceCall }
  | { t: "exec_end"; exec_id: string; output: string }
  | { t: "verdicts"; verdicts: Verdict[]; iteration: number }
  | { t: "patch_proposed"; iteration: number; diff: string; rationale: string }
  | { t: "gate"; which: GateWhich; resume_url: string }
  | { t: "decision"; which: GateWhich; decision: Decision; text?: string; by: string }
  | { t: "cursors"; items: Cursor[] }
  | { t: "select"; node: string; by: string }
  | { t: "scrub"; seq: number; by: string }
  | { t: "final"; state: FinalState };

// Clients → server over WS: presence only. Decisions go over HTTP.
export type WsUpstream =
  | ({ t: "cursor" } & Cursor)
  | { t: "select"; node: string }
  | { t: "scrub"; seq: number };

// ---- HTTP bodies --------------------------------------------------------------

export interface DecisionBody {
  which: GateWhich;
  decision: Decision;
  text?: string;
}
