"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EdgesGeometry, LineBasicMaterial, MeshBasicMaterial, Vector3 } from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { alpha, color, geom, motion } from "@/lib/design";
import { useRunStore } from "@/lib/store";

/**
 * DESIGN.md: convex hull around scope_nodes, padded 0.03 m, fill accent @ 6 %, edge accent @ 35 %,
 * breathing ±20 % alpha over 4 s. Padding is done by hulling each node's ±pad axis points, which also
 * keeps the hull 3-D when there are fewer than four scope nodes.
 */
export function ScopeDistrict() {
  const scene = useRunStore((s) => s.scene);
  const fillRef = useRef<MeshBasicMaterial>(null);
  const edgeRef = useRef<LineBasicMaterial>(null);

  const hull = useMemo(() => {
    if (!scene) return null;
    const ids = new Set(scene.scope_nodes);
    const pts: Vector3[] = [];
    const p = geom.districtPad;
    for (const n of scene.graph.nodes) {
      if (!ids.has(n.id)) continue;
      const [x, y, z] = n.pos;
      pts.push(
        new Vector3(x + p, y, z), new Vector3(x - p, y, z),
        new Vector3(x, y + p, z), new Vector3(x, y - p, z),
        new Vector3(x, y, z + p), new Vector3(x, y, z - p),
      );
    }
    if (pts.length === 0) return null;
    const g = new ConvexGeometry(pts);
    return { fill: g, edges: new EdgesGeometry(g, 12) };
  }, [scene]);

  useFrame(({ clock }) => {
    const k = 1 + 0.2 * Math.sin((clock.elapsedTime * 1000 * 2 * Math.PI) / motion.districtBreath);
    if (fillRef.current) fillRef.current.opacity = alpha.districtFill * k;
    if (edgeRef.current) edgeRef.current.opacity = alpha.districtEdge * k;
  });

  if (!hull) return null;
  return (
    <group>
      <mesh geometry={hull.fill}>
        <meshBasicMaterial ref={fillRef} color={color.accent} transparent opacity={alpha.districtFill} depthWrite={false} />
      </mesh>
      <lineSegments geometry={hull.edges}>
        <lineBasicMaterial color={color.accent} transparent opacity={alpha.districtEdge} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
