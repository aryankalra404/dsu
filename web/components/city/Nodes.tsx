"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, Vector3 } from "three";
import { alpha, color, geom, nodeRadius } from "@/lib/design";
import { fanInMap, useRunStore } from "@/lib/store";
import type { SceneNode } from "@/lib/contracts";

const tmpM = new Matrix4();
const tmpV = new Vector3();
const UNIT = new Vector3(1, 1, 1);

/** One InstancedMesh per opacity class (per-instance alpha needs a custom shader; two meshes is cheaper). */
function NodeGroup({
  nodes,
  fanIn,
  inScope,
  onHover,
  onSelect,
}: {
  nodes: SceneNode[];
  fanIn: Map<string, number>;
  inScope: boolean;
  onHover: (n: SceneNode | null) => void;
  onSelect: (n: SceneNode) => void;
}) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    nodes.forEach((n, i) => {
      const r = nodeRadius(fanIn.get(n.id) ?? 0, n.in_scope);
      tmpM.compose(tmpV.fromArray(n.pos), mesh.quaternion, UNIT.clone().setScalar(r));
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [nodes, fanIn]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : (nodes[e.instanceId] ?? null);

  if (nodes.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, nodes.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(pick(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const n = pick(e);
        if (n) onSelect(n);
      }}
    >
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial
        color={inScope ? color.nodeScope : color.nodeDim}
        emissive={inScope ? new Color(color.nodeScope) : new Color(color.nodeDim)}
        emissiveIntensity={inScope ? 0.35 : 0}
        transparent
        opacity={inScope ? alpha.nodeScope : alpha.nodeDim}
        depthWrite={inScope}
      />
    </instancedMesh>
  );
}

export function Nodes() {
  const scene = useRunStore((s) => s.scene);
  const selected = useRunStore((s) => s.selected);
  const setSelected = useRunStore((s) => s.setSelected);
  const [hovered, setHovered] = useState<SceneNode | null>(null);

  const fanIn = useMemo(() => fanInMap(scene), [scene]);
  const scopeNodes = useMemo(() => scene?.graph.nodes.filter((n) => n.in_scope) ?? [], [scene]);
  const dimNodes = useMemo(() => scene?.graph.nodes.filter((n) => !n.in_scope) ?? [], [scene]);
  const selectedNode = useMemo(() => scene?.graph.nodes.find((n) => n.id === selected) ?? null, [scene, selected]);

  if (!scene) return null;
  const onSelect = (n: SceneNode) => setSelected(selected === n.id ? null : n.id);

  return (
    <group>
      <NodeGroup nodes={scopeNodes} fanIn={fanIn} inScope onHover={setHovered} onSelect={onSelect} />
      <NodeGroup nodes={dimNodes} fanIn={fanIn} inScope={false} onHover={setHovered} onSelect={onSelect} />
      {hovered && (
        <Html position={hovered.pos} center distanceFactor={1} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="rounded border border-border bg-background/90 px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-soc-text">
            {hovered.label} <span className="text-muted-foreground">{hovered.id}</span>
          </div>
        </Html>
      )}
      {selectedNode && <SelectedRing node={selectedNode} radius={nodeRadius(fanIn.get(selectedNode.id) ?? 0, selectedNode.in_scope)} />}
    </group>
  );
}

/** DESIGN.md: selected ring radius 1.8× node, accent, ~0.001 m. A thin torus; H12 may billboard it. */
function SelectedRing({ node, radius }: { node: SceneNode; radius: number }) {
  const r = radius * geom.selectedRingScale;
  return (
    <mesh position={node.pos}>
      <torusGeometry args={[r, 0.0006, 8, 48]} />
      <meshBasicMaterial color={color.accent} />
    </mesh>
  );
}
