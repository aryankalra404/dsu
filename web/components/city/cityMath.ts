// Pure helpers shared by the city components. Positions always come from the server (graph.nodes[].pos/size);
// nothing here lays anything out.
import { Vector3 } from "three";
import type { Building, TrailItem, TrajectoryEvent } from "@/lib/contracts";
import { geom } from "@/lib/design";

export type Touch = "none" | "read" | "wrote_in" | "wrote_out";

export interface BuildingState {
  touch: Touch;
  reads: number;
  writes: number;
}

/** What the agent has done to each building, up to (and including) seq `until` (null = live). */
export function buildingStates(events: TrajectoryEvent[], until: number | null): Map<string, BuildingState> {
  const m = new Map<string, BuildingState>();
  for (const e of events) {
    if (until !== null && e.seq > until) break;
    if ((e.kind !== "read" && e.kind !== "write") || !e.path) continue;
    const s = m.get(e.path) ?? { touch: "none" as Touch, reads: 0, writes: 0 };
    if (e.kind === "read") {
      s.reads += 1;
      if (s.touch === "none") s.touch = "read";
    } else {
      s.writes += 1;
      if (s.touch !== "wrote_out") s.touch = e.in_scope === false ? "wrote_out" : "wrote_in";
    }
    m.set(e.path, s);
  }
  return m;
}

export function roof(b: Building, lift: number = geom.dotHover): Vector3 {
  return new Vector3(b.pos[0], b.pos[1] + b.size[1] + lift, b.pos[2]);
}

/** Quadratic arc between two roofs, rising with distance. */
export function arcPoints(a: Vector3, b: Vector3, n = 20): Vector3[] {
  const dist = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + geom.trailArc * 0.4 + dist * 0.22;
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      new Vector3(
        u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
        u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
        u * u * a.z + 2 * u * t * mid.z + t * t * b.z,
      ),
    );
  }
  return out;
}

export function pointOnArc(a: Vector3, b: Vector3, t: number): Vector3 {
  const dist = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + geom.trailArc * 0.4 + dist * 0.22;
  const u = 1 - t;
  return new Vector3(
    u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
    u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
    u * u * a.z + 2 * u * t * mid.z + t * t * b.z,
  );
}

/** Trail items up to the scrub position, with consecutive visits to the same building collapsed. */
export function visibleTrail(trail: TrailItem[], until: number | null): TrailItem[] {
  const out: TrailItem[] = [];
  for (const t of trail) {
    if (until !== null && t.seq > until) break;
    if (!t.node) continue;
    const last = out[out.length - 1];
    if (last && last.node === t.node) {
      // keep the stronger signal (an out-of-scope or revert visit) on the collapsed stop
      if (!t.in_scope || t.revert) out[out.length - 1] = { ...t, in_scope: last.in_scope && t.in_scope, revert: last.revert || t.revert };
      continue;
    }
    out.push(t);
  }
  return out;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
