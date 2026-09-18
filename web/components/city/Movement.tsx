"use client";
// Everything that moves: the trail of arcs over the rooftops, the agent dot, claim satellites, import arcs, ghosts.
import { Billboard, Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { AgentState, Building, Claim, Cursor, Edge, FinalState, TrailItem } from "@/lib/contracts";
import { color, geom, motion, verdictColor } from "@/lib/design";
import { arcPoints, easeOutCubic, pointOnArc, roof } from "@/components/city/cityMath";

type ById = Map<string, Building>;

// ------------------------------------------------------------------ trail

export function Trail({ stops, byId, final }: { stops: TrailItem[]; byId: ById; final: FinalState | null }) {
  const { normal, revert } = useMemo(() => {
    const build = (wantRevert: boolean) => {
      const pts: Vector3[] = [];
      const cols: Color[] = [];
      for (let i = 1; i < stops.length; i++) {
        const a = byId.get(stops[i - 1].node!);
        const b = byId.get(stops[i].node!);
        if (!a || !b || stops[i].revert !== wantRevert) continue;
        const out = !stops[i].in_scope;
        const c = new Color(out ? color.danger : final === "merged" ? color.ok : color.accent);
        const arc = arcPoints(roof(a), roof(b), 18);
        for (let k = 1; k < arc.length; k++) {
          pts.push(arc[k - 1], arc[k]);
          cols.push(c, c);
        }
      }
      return pts.length ? { pts, cols } : null;
    };
    return { normal: build(false), revert: build(true) };
  }, [stops, byId, final]);

  return (
    <group>
      {normal && <Line segments points={normal.pts} vertexColors={normal.cols} lineWidth={2.6} transparent opacity={0.9} />}
      {revert && <Line segments points={revert.pts} vertexColors={revert.cols} lineWidth={6} dashed dashSize={0.012} gapSize={0.006} />}
      {stops.map((s) => {
        const b = s.node ? byId.get(s.node) : undefined;
        if (!b) return null;
        const p = roof(b, 0.002);
        return (
          <mesh key={s.seq} position={p}>
            <sphereGeometry args={[0.0032, 10, 10]} />
            <meshBasicMaterial color={s.in_scope ? (final === "merged" ? color.ok : color.accent) : color.danger} />
          </mesh>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ agent dot

export function AgentDot({ node, byId, state, label, scrubbing }: {
  node: string | null;
  byId: ById;
  state: AgentState;
  label: string | null;
  scrubbing: boolean;
}) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  const pos = useRef<Vector3 | null>(null);
  const queue = useRef<Vector3[]>([]);
  const leg = useRef<{ from: Vector3; to: Vector3; t0: number } | null>(null);

  useEffect(() => {
    const b = node ? byId.get(node) : undefined;
    if (!b) return;
    const target = roof(b);
    if (!pos.current || scrubbing) {
      pos.current = target.clone();
      queue.current = [];
      leg.current = null;
      return;
    }
    const last = queue.current.at(-1) ?? leg.current?.to ?? pos.current;
    if (!last.equals(target)) queue.current.push(target);
  }, [node, byId, scrubbing]);

  useFrame(({ clock }) => {
    const now = performance.now();
    if (!leg.current && queue.current.length && pos.current) {
      // stay close to real time: if events pile up, skip to the last few
      if (queue.current.length > 4) queue.current = queue.current.slice(-2);
      leg.current = { from: pos.current.clone(), to: queue.current.shift()!, t0: now };
    }
    if (leg.current) {
      const t = Math.min((now - leg.current.t0) / motion.dotMove, 1);
      pos.current = pointOnArc(leg.current.from, leg.current.to, easeOutCubic(t));
      if (t >= 1) leg.current = null;
    }
    if (group.current && pos.current) group.current.position.copy(pos.current);
    const paused = state === "paused";
    if (ring.current) {
      const k = paused ? (clock.elapsedTime % 1) : (clock.elapsedTime * 0.6) % 1;
      ring.current.scale.setScalar(1 + k * (paused ? 1.6 : 0.9));
      (ring.current.material as MeshBasicMaterial).opacity = (1 - k) * (paused ? 0.7 : 0.35);
    }
    if (core.current) {
      const m = core.current.material as MeshStandardMaterial;
      const target = state === "killed" ? 0 : 1;
      m.opacity += (target - m.opacity) * 0.08;
    }
  });

  if (!node || !byId.get(node)) return null;
  const tone = state === "paused" || state === "killed" ? color.danger : state === "done" ? color.faint : color.accent;
  return (
    <group ref={group}>
      <mesh ref={core} castShadow>
        <sphereGeometry args={[geom.agentDotRadius, 24, 24]} />
        <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.55} transparent opacity={1} />
      </mesh>
      <Billboard>
        <mesh ref={ring}>
          <ringGeometry args={[geom.agentDotRadius * 1.25, geom.agentDotRadius * 1.6, 40]} />
          <meshBasicMaterial color={tone} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      </Billboard>
      <pointLight color={tone} intensity={0.25} distance={0.25} />
      {label && (
        <Html position={[0, geom.agentDotRadius * 2.6, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 10]}>
          <div
            className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white shadow"
            style={{ background: tone }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ claim satellites

export function Satellites({ claims, scopeNodes }: { claims: Claim[]; scopeNodes: Building[] }) {
  const group = useRef<Group>(null);
  const centre = useMemo(() => {
    if (!scopeNodes.length) return null;
    const xs = scopeNodes.map((b) => b.pos[0]);
    const zs = scopeNodes.map((b) => b.pos[2]);
    const top = Math.max(...scopeNodes.map((b) => b.size[1]));
    const r = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 0.05;
    return { x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2, y: top + 0.07, r };
  }, [scopeNodes]);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * ((0.5 * 2 * Math.PI) / 60); // 0.5 rpm
  });
  if (!centre || !claims.length) return null;
  return (
    <group ref={group} position={[centre.x, centre.y, centre.z]}>
      {claims.map((c, i) => {
        const a = (i / claims.length) * Math.PI * 2;
        return <Satellite key={c.id} pos={[Math.cos(a) * centre.r, 0, Math.sin(a) * centre.r]} verdict={c.verdict?.verdict} />;
      })}
    </group>
  );
}

function Satellite({ pos, verdict }: { pos: [number, number, number]; verdict?: string }) {
  const mesh = useRef<Mesh>(null);
  const popAt = useRef<number | null>(null);
  useEffect(() => {
    if (verdict) popAt.current = performance.now();
  }, [verdict]);
  useFrame(() => {
    if (!mesh.current) return;
    let s = 1;
    if (popAt.current !== null) {
      const t = (performance.now() - popAt.current) / motion.satellitePop;
      s = t >= 1 ? 1 : 1 + 0.4 * Math.sin(Math.PI * t);
      if (t >= 1) popAt.current = null;
    }
    mesh.current.scale.setScalar(s);
    mesh.current.rotation.x += 0.01;
  });
  const c = verdictColor(verdict);
  return (
    <mesh ref={mesh} position={pos} castShadow>
      <icosahedronGeometry args={[geom.satelliteRadius, 0]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={verdict ? 0.35 : 0} flatShading />
    </mesh>
  );
}

// ------------------------------------------------------------------ imports

export function Imports({ edges, byId, focus, all }: { edges: Edge[]; byId: ById; focus: string | null; all: boolean }) {
  const lines = useMemo(() => {
    const pick = all ? edges : focus ? edges.filter((e) => e.src === focus || e.dst === focus) : [];
    const pts: Vector3[] = [];
    for (const e of pick.slice(0, 1500)) {
      const a = byId.get(e.src);
      const b = byId.get(e.dst);
      if (!a || !b) continue;
      const arc = arcPoints(roof(a, 0.001), roof(b, 0.001), 12);
      for (let k = 1; k < arc.length; k++) pts.push(arc[k - 1], arc[k]);
    }
    return pts;
  }, [edges, byId, focus, all]);
  if (!lines.length) return null;
  return <Line segments points={lines} color={focus && !all ? "#6B7A90" : color.edge} lineWidth={1.1} transparent opacity={focus && !all ? 0.85 : 0.45} />;
}

// ------------------------------------------------------------------ presence

export function Ghosts({ cursors, self }: { cursors: Cursor[]; self: string }) {
  return (
    <group>
      {cursors
        .filter((c) => c.client !== self && c.pos?.length === 3)
        .map((c) => (
          <group key={`${c.client}-${c.kind}`} position={[c.pos[0], c.pos[1], c.pos[2]]}>
            <mesh>
              {c.kind === "head" ? <capsuleGeometry args={[0.03, 0.06, 4, 12]} /> : <sphereGeometry args={[c.kind === "mouse" ? 0.012 : 0.01, 16, 16]} />}
              <meshBasicMaterial color={color.ghost} transparent opacity={0.2} wireframe={c.kind === "head"} />
            </mesh>
            {c.kind !== "hand_l" && c.kind !== "hand_r" && (
              <Html position={[0, 0.03, 0]} center style={{ pointerEvents: "none" }}>
                <div className="rounded bg-ink/70 px-1 font-mono text-[9px] text-white">{c.client}</div>
              </Html>
            )}
          </group>
        ))}
    </group>
  );
}
