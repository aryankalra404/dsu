"use client";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import type { Building } from "@/lib/contracts";
import { color } from "@/lib/design";
import type { BuildingState } from "@/components/city/cityMath";

const RISE_MS = 700;

export function buildingColor(b: Building, s: BuildingState | undefined): string {
  switch (s?.touch) {
    case "wrote_out":
      return color.danger;
    case "wrote_in":
      return color.buildingTouched;
    default:
      return b.in_scope ? color.buildingScope : color.building;
  }
}

export function Buildings({ nodes, states, hovered, selected, dimmed, onHover, onSelect }: {
  nodes: Building[];
  states: Map<string, BuildingState>;
  hovered: string | null;
  selected: string | null;
  dimmed: Set<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const capacity = Math.max(64, Math.ceil(nodes.length / 64) * 64);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.72, metalness: 0.02 }), []);
  const born = useRef(performance.now());
  const rising = useRef(true);

  const write = (progress: number) => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const c = new Color();
    const hi = new Color("#ffffff");
    nodes.forEach((n, i) => {
      const h = Math.max(n.size[1] * progress, 0.0005);
      o.position.set(n.pos[0], n.pos[1], n.pos[2]);
      o.scale.set(n.size[0], h, n.size[2]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(buildingColor(n, states.get(n.id)));
      if (dimmed && !dimmed.has(n.id)) c.lerp(hi, 0.65);
      if (n.id === hovered && n.id !== selected) c.lerp(hi, 0.3);
      m.setColorAt(i, c);
    });
    m.count = nodes.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  };

  useLayoutEffect(() => {
    write(rising.current ? 0 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, states, hovered, selected, dimmed, capacity]);

  useFrame(() => {
    if (!rising.current) return;
    const t = Math.min((performance.now() - born.current) / RISE_MS, 1);
    write(1 - Math.pow(1 - t, 3));
    if (t >= 1) rising.current = false;
  });

  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId !== undefined && e.instanceId < nodes.length ? nodes[e.instanceId].id : null;

  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(idOf(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = idOf(e);
        if (id) onSelect(id);
      }}
    />
  );
}

/** Outline box around one building (selection / hover highlight). */
export function BuildingOutline({ b, tone, pad = 0.004 }: { b: Building; tone: string; pad?: number }) {
  const geo = useMemo(() => new BoxGeometry(b.size[0] + pad, b.size[1] + pad, b.size[2] + pad), [b.size, pad]);
  return (
    <lineSegments position={[b.pos[0], b.pos[1] + b.size[1] / 2, b.pos[2]]}>
      <edgesGeometry args={[geo]} />
      <lineBasicMaterial color={tone} linewidth={2} />
    </lineSegments>
  );
}
