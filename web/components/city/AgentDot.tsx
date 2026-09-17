"use client";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail as DreiTrail } from "@react-three/drei";
import { Color, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { color, geom, motion } from "@/lib/design";
import { dotAnim } from "@/lib/dotAnim";
import { nodePos, useRunStore } from "@/lib/store";

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

interface Move {
  seq: number;
  to: Vector3;
}

/**
 * The agent dot (DESIGN.md): radius 0.012 m, emissive accent, ~0.5 s tail. Moves node-to-node with a
 * 400 ms ease-out per event; events queue. Colour/behaviour by state: running accent · paused danger,
 * frozen, 1 Hz ring pulse · steered brief warn flash · done node-scope · killed danger fade · merged hidden.
 */
export function AgentDot() {
  const scene = useRunStore((s) => s.scene);
  const trail = useRunStore((s) => s.trail);
  const agent = useRunStore((s) => s.agent);
  const scrubSeq = useRunStore((s) => s.scrubSeq);
  const steeredAt = useRunStore((s) => s.steeredAt);
  const final = useRunStore((s) => s.final);

  const group = useRef<Group>(null);
  const dot = useRef<Mesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const ring = useRef<Mesh>(null);
  const queue = useRef<Move[]>([]);
  const current = useRef<{ from: Vector3; to: Vector3; seq: number; t0: number } | null>(null);
  const seenSeq = useRef(0);

  // Place the dot on the snapshot's agent node when the scene arrives.
  useEffect(() => {
    if (!scene) return;
    const p = nodePos(scene, scene.agent.node);
    if (p) dotAnim.pos.fromArray(p);
    const last = scene.trail[scene.trail.length - 1];
    seenSeq.current = last?.seq ?? 0;
    dotAnim.doneSeq = seenSeq.current;
    dotAnim.movingSeq = null;
    queue.current = [];
    current.current = null;
  }, [scene]);

  // Enqueue every newly committed trail item (state commits instantly; only this visual lags).
  useEffect(() => {
    if (!scene) return;
    for (const item of trail) {
      if (item.seq <= seenSeq.current) continue;
      const p = nodePos(scene, item.node);
      if (p) queue.current.push({ seq: item.seq, to: new Vector3().fromArray(p) });
      seenSeq.current = item.seq;
    }
  }, [trail, scene]);

  useFrame(({ clock }) => {
    const now = performance.now();

    if (scrubSeq !== null && scene) {
      // Scrub: jump to the node at seq, no animation, queue paused.
      const item = [...trail].reverse().find((t) => t.seq <= scrubSeq);
      const p = item ? nodePos(scene, item.node) : nodePos(scene, scene.agent.node);
      if (p) dotAnim.pos.fromArray(p);
      dotAnim.doneSeq = item?.seq ?? 0;
      dotAnim.movingSeq = null;
    } else if (agent.state !== "paused") {
      if (!current.current && queue.current.length > 0) {
        const next = queue.current.shift()!;
        current.current = { from: dotAnim.pos.clone(), to: next.to, seq: next.seq, t0: now };
        dotAnim.movingSeq = next.seq;
      }
      const c = current.current;
      if (c) {
        const p = Math.min(1, (now - c.t0) / motion.dotMove);
        dotAnim.pos.lerpVectors(c.from, c.to, easeOut(p));
        if (p >= 1) {
          dotAnim.doneSeq = c.seq;
          dotAnim.movingSeq = null;
          current.current = null;
        }
      }
    }

    if (group.current) group.current.position.copy(dotAnim.pos);

    // Colour and ring by state.
    const m = mat.current;
    if (m) {
      let c: string = color.accent;
      let opacity = 1;
      if (agent.state === "paused") c = color.danger;
      else if (agent.state === "done") c = color.nodeScope;
      else if (agent.state === "killed") {
        c = color.danger;
        opacity = 0.25;
      }
      if (steeredAt && now - steeredAt < motion.steeredFlash && agent.state === "running") c = color.warn;
      m.color.set(c);
      m.emissive = new Color(c);
      m.opacity = opacity;
      m.transparent = opacity < 1;
    }
    if (ring.current) {
      const pulse = agent.state === "paused" ? 1 + 0.6 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2 * Math.PI)) : 0;
      ring.current.visible = pulse > 0;
      ring.current.scale.setScalar(pulse || 1);
    }
    if (group.current) group.current.visible = final !== "merged" && final !== "rejected";
  });

  if (!scene) return null;
  return (
    <group ref={group}>
      <DreiTrail width={geom.agentDotRadius * 3} length={4} decay={2} color={color.accent} attenuation={(t) => t * t}>
        <mesh ref={dot}>
          <sphereGeometry args={[geom.agentDotRadius, 24, 16]} />
          <meshStandardMaterial ref={mat} color={color.accent} emissive={new Color(color.accent)} emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      </DreiTrail>
      <mesh ref={ring} visible={false}>
        <torusGeometry args={[geom.agentDotRadius * 1.8, 0.0008, 8, 48]} />
        <meshBasicMaterial color={color.danger} />
      </mesh>
    </group>
  );
}
