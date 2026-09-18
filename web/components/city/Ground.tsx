"use client";
// The ground: a white base slab, district blocks (directories) with labels, and the lit scope district.
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh, MeshBasicMaterial } from "three";
import type { Building, District } from "@/lib/contracts";
import { color, motion } from "@/lib/design";

const SLAB = 0.004;
const LABEL_MAX = 16;

export function Ground({ districts, nodes }: { districts: District[]; nodes: Building[] }) {
  const occupied = useMemo(() => new Set(nodes.map((n) => n.district)), [nodes]);
  const labelled = useMemo(
    () =>
      districts
        .filter((d) => occupied.has(d.id))
        .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])
        .slice(0, LABEL_MAX)
        .map((d) => d.id),
    [districts, occupied],
  );
  return (
    <group>
      {/* base platform */}
      <mesh position={[0, -0.01, 0]} receiveShadow>
        <boxGeometry args={[0.86, 0.02, 0.86]} />
        <meshStandardMaterial color={color.ground} roughness={0.95} />
      </mesh>
      {districts.map((d) => {
        const isNew = d.id === "~new";
        if (isNew && !occupied.has(d.id)) return null;
        return (
          <mesh key={d.id} position={[d.pos[0], SLAB / 2, d.pos[2]]} receiveShadow>
            <boxGeometry args={[d.size[0], SLAB, d.size[1]]} />
            <meshStandardMaterial color={isNew ? color.districtNew : color.district} roughness={0.9} />
          </mesh>
        );
      })}
      {districts
        .filter((d) => labelled.includes(d.id))
        .map((d) => (
          <Html
            key={`l-${d.id}`}
            position={[d.pos[0] - d.size[0] / 2 + 0.006, SLAB + 0.001, d.pos[2] + d.size[1] / 2 - 0.006]}
            style={{ pointerEvents: "none" }}
            zIndexRange={[5, 0]}
          >
            <div className="-translate-y-full truncate rounded bg-white/80 px-1 font-mono text-[10px] leading-4 whitespace-nowrap text-muted backdrop-blur-sm">
              {d.label}
            </div>
          </Html>
        ))}
    </group>
  );
}

/** The lit district: one glowing plate per directory that holds in-scope buildings, breathing slowly. */
export function ScopeDistrict({ nodes, scope }: { nodes: Building[]; scope: Set<string> }) {
  const groups = useMemo(() => {
    const by = new Map<string, Building[]>();
    for (const n of nodes) if (scope.has(n.id)) by.set(n.district, [...(by.get(n.district) ?? []), n]);
    return [...by.values()].map((bs) => {
      const pad = 0.014;
      const xs = bs.flatMap((b) => [b.pos[0] - b.size[0] / 2, b.pos[0] + b.size[0] / 2]);
      const zs = bs.flatMap((b) => [b.pos[2] - b.size[2] / 2, b.pos[2] + b.size[2] / 2]);
      const [x0, x1, z0, z1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
      return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
    });
  }, [nodes, scope]);
  const fills = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin((clock.elapsedTime * 2 * Math.PI * 1000) / motion.districtBreath);
    for (const m of fills.current) if (m) (m.material as MeshBasicMaterial).opacity = 0.22 + 0.12 * k;
  });
  return (
    <group>
      {groups.map((g, i) => (
        <group key={i} position={[g.x, SLAB + 0.0012, g.z]}>
          <mesh ref={(m) => void (fills.current[i] = m)} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[g.w, g.d]} />
            <meshBasicMaterial color={color.accent} transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <ScopeOutline w={g.w} d={g.d} />
        </group>
      ))}
    </group>
  );
}

function ScopeOutline({ w, d }: { w: number; d: number }) {
  const pts = useMemo(() => {
    const [x, z] = [w / 2, d / 2];
    return new Float32Array([-x, 0, -z, x, 0, -z, x, 0, -z, x, 0, z, x, 0, z, -x, 0, z, -x, 0, z, -x, 0, -z]);
  }, [w, d]);
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pts, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color.accent} />
    </lineSegments>
  );
}
