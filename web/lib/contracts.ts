// MVP.md §6 contracts, v4 (any repo, code city). Field-for-field with core/scene/state.py and core/orchestrator.py.

export type ClaimType =
  | "stays_in_scope"
  | "no_churn"
  | "fetches_external"
  | "declares_capability"
  | "resists_probe"
  | "reasons_on_input";

export const CLAIM_TYPES: ClaimType[] = [
  "stays_in_scope",
  "no_churn",
  "fetches_external",
  "declares_capability",
  "resists_probe",
  "reasons_on_input",
];

export type ClaimSource = "llm" | "rules" | "ast" | "human" | "agent" | "auto";

export type VerdictLabel = "REAL" | "FAKE" | "DEAD" | "DRIFT" | "VULN" | "INCONCLUSIVE";

export interface VerdictHint {
  kind: "HARDCODED_DATA" | "KEYWORD_MATCH" | "SWALLOWED_ERROR" | "STATIC_RETURN" | (string & {});
  file: string;
  line: number;
  msg: string;
}

export interface Verdict {
  claim_id: string;
  verdict: VerdictLabel;
  iteration: number;
  rule: string;
  evidence: { exec_ids: string[]; http_count: number | null; traj_seqs: number[]; outputs_distinct: number | null };
  hints: VerdictHint[];
}

export interface Claim {
  id: string;
  type: ClaimType;
  text: string;
  target: string | null;
  axis: string | null;
  source: ClaimSource;
  confirmed: boolean;
  verdict?: Verdict;
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
  path?: string;
  content_hash?: string;
  prev_hash?: string | null;
  region?: [number, number];
  revert?: boolean;
  fact?: "scope_violation" | "revert" | null;
  cmd?: string;
  exit?: number;
  host?: string;
  status?: number | null;
  url?: string;
  exec_id?: string;
  mode?: ExecMode;
  reason?: string;
  text?: string;
  summary?: string;
  in_scope?: boolean;
  drift: Drift;
  node?: string | null;
}

export interface TraceHttp {
  ts: number;
  method: string;
  host: string;
  path: string;
  status: number | null;
}
export interface TraceCall {
  ts: number;
  fn: string;
  sink?: boolean;
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
  sandbox?: "docker" | "subprocess";
  sandbox_error?: boolean;
}

export type Vec3 = [number, number, number];

export interface Building {
  id: string; // repo-relative file path
  label: string;
  module: string; // directory it belongs to
  district: string; // district it stands in ("~new" for new construction)
  pos: Vec3; // base centre, metres
  size: Vec3; // width, height, depth
  loc: number;
  lang: string;
  in_scope: boolean;
}

export interface District {
  id: string;
  label: string;
  pos: Vec3;
  size: [number, number]; // width, depth
}

export interface Edge {
  src: string;
  dst: string;
  kind: "import" | (string & {});
}

export interface Graph {
  nodes: Building[];
  edges: Edge[];
  districts: District[];
  truncated: boolean;
}

export type AgentState = "idle" | "running" | "paused" | "done" | "killed";
export type Phase =
  | "extracting"
  | "intent"
  | "running"
  | "paused"
  | "checking"
  | "fixing"
  | "approve"
  | "final"
  | "error";
export type GateWhich = "intent" | "pause" | "approve";
export type FinalState = "merged" | "rejected" | "killed" | "max_iterations";

export interface Gate {
  which: GateWhich | null;
  resume_url: string | null;
  reason: string | null;
}

export interface TrailItem {
  seq: number;
  node: string | null;
  kind: EventKind;
  in_scope: boolean;
  revert: boolean;
}

export interface Cursor {
  client: string;
  kind: "head" | "hand_l" | "hand_r" | "mouse" | (string & {});
  pos: number[];
  rot?: number[];
}

export interface Scene {
  run_id: string;
  repo: string;
  intent: string;
  replay: string | null;
  probe_entry: string | null;
  happy_input: string | null;
  github_pr: string | null;
  phase: Phase;
  graph: Graph;
  scope: string[];
  scope_nodes: string[];
  agent: { node: string | null; state: AgentState; drift: number };
  drift: Drift;
  trail: TrailItem[];
  claims: Claim[];
  gate: Gate;
  iteration: number;
  cursors: Cursor[];
  scrub: number | null;
  final: FinalState | null;
  error: string | null;
  notes: string[];
}

export interface Patch {
  iteration: number;
  diff: string;
  rationale: string;
  source: "llm" | "recording" | "n8n" | (string & {});
  files: string[];
}

export interface Decision {
  which: GateWhich;
  decision: string;
  text?: string | null;
  by: string;
  at: number;
}

export interface Pause {
  seq: number | null;
  reason: string;
  path: string | null;
  at: number;
}

export interface RunDetail extends Scene {
  events: TrajectoryEvent[];
  traces: Trace[];
  verdicts: Verdict[];
  verdict_history: { iteration: number; verdicts: Verdict[] }[];
  patches: Patch[];
  decisions: Decision[];
  pauses: Pause[];
  summary: string | null;
  created_at: number;
  archived?: boolean;
}

export interface ExecSummary {
  exec_id: string;
  mode: ExecMode;
  input: string;
  running: boolean;
  exit?: number;
  output?: string;
  http_count?: number;
  calls_count?: number;
  sandbox?: string;
  error?: string | null;
  http: TraceHttp[];
  sinks: TraceCall[];
}

export type WsMessage =
  | { t: "run_created"; run: { run_id: string; repo: string; intent: string } }
  | { t: "scene"; scene: Scene }
  | { t: "phase"; phase: Phase }
  | { t: "claims"; claims: Claim[] }
  | { t: "graph_patch"; nodes: Building[]; edges: Record<string, Edge[]> }
  | { t: "traj_event"; event: TrajectoryEvent }
  | { t: "agent_state"; state: AgentState; reason?: string | null }
  | { t: "exec_start"; exec_id: string; mode: ExecMode; input: string }
  | { t: "trace_event"; exec_id: string; kind: "http" | "call"; item: TraceHttp | TraceCall }
  | {
      t: "exec_end";
      exec_id: string;
      output: string;
      exit: number;
      mode: ExecMode;
      sandbox: string;
      http_count: number;
      calls_count: number;
      error: string | null;
    }
  | { t: "verdicts"; verdicts: Verdict[]; iteration: number }
  | { t: "patch_proposed"; iteration: number; diff: string; rationale: string; source: string; files: string[] }
  | { t: "gate"; which: GateWhich | null; resume_url: string | null; reason?: string | null }
  | { t: "decision"; which: GateWhich; decision: string; text?: string | null; by: string }
  | { t: "cursors"; items: Cursor[] }
  | { t: "select"; node: string | null; by: string }
  | { t: "scrub"; seq: number | null; by: string }
  | { t: "final"; state: FinalState }
  | { t: "note"; text: string }
  | { t: "error"; message: string };

export type WsUpstream =
  | ({ t: "cursor" } & Cursor)
  | { t: "select"; node: string | null; by: string }
  | { t: "scrub"; seq: number | null; by: string };

export interface Recording {
  name: string;
  title: string;
  intent: string;
  repo: string;
  recorded_with: string | null;
  scope: string[];
  probe_entry: string | null;
}

export interface Flags {
  USE_LLM: boolean;
  USE_N8N: boolean;
  USE_SANDBOX: boolean;
  USE_BEECEPTOR: boolean;
  model: string | null;
  gates: "n8n" | "local";
  sandbox: "docker" | "subprocess";
}

export interface HistoryRow {
  id: string;
  created_at: number;
  updated_at: number;
  repo: string;
  intent: string;
  replay: string | null;
  phase: Phase;
  final: FinalState | null;
  iteration: number;
  claims: Claim[];
  verdicts: Verdict[];
  pauses: Pause[];
  decisions: Decision[];
}
