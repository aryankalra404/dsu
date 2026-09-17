"use client";
import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { alpha, color } from "@/lib/design";
import { useRunStore } from "@/lib/store";

/** All edges in one LineSegments (1 px, DESIGN `edge-dim` @ 25 %). Positions are the server's, untouched. */
export function Edges() {
  const scene = useRunStore((s) => s.scene);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    if (!scene) return g;
    const pos = new Map(scene.graph.nodes.map((n) => [n.id, n.pos]));
    const verts: number[] = [];
    for (const e of scene.graph.edges) {
      const a = pos.get(e.src);
      const b = pos.get(e.dst);
      if (a && b) verts.push(...a, ...b);
    }
    g.setAttribute("position", new Float32BufferAttribute(verts, 3));
    return g;
  }, [scene]);
  if (!scene) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color.edgeDim} transparent opacity={alpha.edgeDim} depthWrite={false} />
    </lineSegments>
  );
}
