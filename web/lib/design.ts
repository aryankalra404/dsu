// DESIGN.md palette and geometry as code. Web and R3F read colours from here;
// VR copies the same hex values. Do not add a colour that is not in DESIGN.md.

export const color = {
  bg: "#0B0F14",
  nodeDim: "#3A4250",
  nodeScope: "#9FB3C8",
  edgeDim: "#2A313C",
  accent: "#39D0FF",
  danger: "#FF3B5C",
  ok: "#3DFF9A",
  warn: "#FFB43A",
  ghost: "#FFFFFF",
  text: "#E6EDF3",
} as const;

export const alpha = {
  nodeDim: 0.35,
  nodeScope: 0.85,
  edgeDim: 0.45,
  label: 0.7,
  ghost: 0.2,
  districtFill: 0.06,
  districtEdge: 0.35,
} as const;

// Metres. The web canvas renders the same 0.8 m cube the headset shows.
export const geom = {
  cube: 0.8,
  nodeRadiusBase: 0.006,
  nodeRadiusFanIn: 0.004,
  inScopeScale: 1.2,
  edgeWidthPx: 1,
  agentDotRadius: 0.012,
  trailWidth: 0.002,
  revertWidthScale: 2,
  districtPad: 0.03,
  satelliteRadius: 0.008,
  selectedRingScale: 1.8,
} as const;

// Milliseconds.
// DESIGN.md → Atmosphere (web).
export const atmosphere = {
  bloomThreshold: 0.55,
  bloomIntensity: 0.9,
  bloomRadius: 0.6,
  fogNear: 1.2,
  fogFar: 3.5,
  gridCell: 0.05,
  gridSection: 0.25,
  gridFade: 1.6,
  gridY: -0.4,
  idleOrbitSecondsPerRev: 90,
} as const;

export const motion = {
  dotMove: 400,
  trailDraw: 400,
  satellitePop: 300,
  badgeFade: 200,
  cameraFocus: 600,
  steeredFlash: 2000,
  districtBreath: 4000,
  trailToOk: 1000,
} as const;

/** DESIGN.md node radius: 0.006 + 0.004 * clamp(fan_in / 10, 0, 1), in-scope +20 %. */
export function nodeRadius(fanIn: number, inScope: boolean): number {
  const t = Math.min(Math.max(fanIn / 10, 0), 1);
  const r = geom.nodeRadiusBase + geom.nodeRadiusFanIn * t;
  return inScope ? r * geom.inScopeScale : r;
}

/** Drift bar colour: accent → warn above 40 → danger above 70. */
export function driftColor(score: number): string {
  if (score > 70) return color.danger;
  if (score > 40) return color.warn;
  return color.accent;
}

export const driftChipLabels = ["scope", "revert", "churn", "advisory"] as const;

export const verdictLabels = ["REAL", "FAKE", "DEAD", "DRIFT", "VULN", "INCONCLUSIVE", "PENDING"] as const;
export type VerdictLabel = (typeof verdictLabels)[number];
export const verdictColor: Record<VerdictLabel, string> = {
  REAL: color.ok,
  FAKE: color.danger,
  DEAD: color.danger,
  DRIFT: color.danger,
  VULN: color.danger,
  INCONCLUSIVE: color.warn,
  PENDING: color.nodeScope,
};

export const gateLabels = ["Confirm claims", "Continue", "Steer", "Kill", "Approve", "Reject"] as const;
