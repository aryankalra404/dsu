// DESIGN.md (v4, light) as code. The CSS mirror lives in app/globals.css; VR copies the same hex values.
// Do not add a colour that is not in DESIGN.md.

export const color = {
  bg: "#F4F6FA",
  surface: "#FFFFFF",
  sunken: "#EEF1F6",
  line: "#E2E7EF",
  text: "#0F172A",
  muted: "#5B6777",
  faint: "#94A0B2",
  accent: "#2F6BFF",
  accentSoft: "#E7EEFF",
  danger: "#E5484D",
  dangerSoft: "#FDECEC",
  ok: "#16A34A",
  okSoft: "#E6F6EC",
  warn: "#D97706",
  warnSoft: "#FDF3E4",
  // city
  ground: "#FFFFFF",
  district: "#EDF1F7",
  districtNew: "#F5F2EA",
  building: "#D9DFE8",
  buildingScope: "#A9C1FF",
  buildingTouched: "#2F6BFF",
  buildingDamaged: "#F4A3A6",
  edge: "#B7C2D3",
  ghost: "#0F172A",
} as const;

export const motion = {
  dotMove: 400,
  trailDraw: 400,
  satellitePop: 300,
  cameraFocus: 600,
  steeredFlash: 2000,
  districtBreath: 4000,
  idleOrbitSecondsPerRev: 90,
} as const;

export const geom = {
  agentDotRadius: 0.011,
  dotHover: 0.03, // how far above a roof the dot flies
  trailArc: 0.06, // extra height of a trail arc between two roofs
  satelliteRadius: 0.008,
} as const;

/** Drift bar: accent -> warn above 40 -> danger above 70. */
export function driftColor(score: number): string {
  if (score > 70) return color.danger;
  if (score > 40) return color.warn;
  return color.accent;
}

export const VERDICT_TONE: Record<string, "ok" | "danger" | "warn" | "muted"> = {
  REAL: "ok",
  FAKE: "danger",
  DEAD: "danger",
  DRIFT: "danger",
  VULN: "danger",
  INCONCLUSIVE: "warn",
  PENDING: "muted",
};

export const verdictColor = (v: string | undefined) => {
  const tone = VERDICT_TONE[v ?? "PENDING"] ?? "muted";
  return tone === "ok" ? color.ok : tone === "danger" ? color.danger : tone === "warn" ? color.warn : color.faint;
};

export const CLAIM_TYPE_LABEL: Record<string, string> = {
  stays_in_scope: "scope",
  no_churn: "churn",
  fetches_external: "external call",
  declares_capability: "capability",
  resists_probe: "probe",
  reasons_on_input: "reasons",
};

export const GATE_LABELS = ["Confirm claims", "Continue", "Steer", "Kill", "Approve", "Reject"] as const;

export const STEER_PRESETS = ["Stay inside the confirmed scope.", "Add the tests first.", "Stop refactoring unrelated code."];

export const PHASE_LABEL: Record<string, string> = {
  extracting: "Reading the intent",
  intent: "Waiting for claim review",
  running: "Running",
  paused: "Paused — out of scope",
  checking: "Done — checking claims",
  fixing: "Fixer at work",
  approve: "Waiting for approval",
  final: "Finished",
  error: "Error",
};
