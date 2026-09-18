"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import { color, geom } from "@/lib/design";
import { dotAnim } from "@/lib/dotAnim";
import { nodePos, useRunStore } from "@/lib/store";
import type { TrailItem } from "@/lib/contracts";

type Seg = { seq: number; a: [number, number, number]; b: [number, number, number]; item: TrailItem };

const IN_SCOPE_ALPHA = 0.6; // DESIGN.md: in-scope segments accent @ 60 %

/**
 * Trail through committed trail[] node positions. Segment i runs from item i-1's node to item i's node.
 * Out-of-scope segments `danger`; revert segments ×2 width and doubled; segments the dot hasn't reached yet
 * are not drawn, and the one it is moving along ends at the dot (that is the 400 ms draw-in).
 * Scrub truncates at scrubSeq. After `final: merged` the whole trail is `ok`.
 */
export function Trail() {
  const scene = useRunStore((s) => s.scene);
  const trail = useRunStore((s) => s.trail);
  const scrubSeq = useRunStore((s) => s.scrubSeq);
  const final = useRunStore((s) => s.final);
  const liveRef = useRef<Line2>(null);
  const liveSeg = useRef<Seg | null>(null);

  const segs = useMemo<Seg[]>(() => {
    if (!scene) return [];
    const out: Seg[] = [];
    let prev = nodePos(scene, scene.agent.node);
    // Start from the first trail node if the snapshot's agent node isn't where the trail begins.
    if (trail.length > 0) prev = nodePos(scene, trail[0].node) ?? prev;
    for (let i = 1; i < trail.length; i++) {
      const p = nodePos(scene, trail[i].node);
      if (!prev || !p) continue;
      const moved = prev[0] !== p[0] || prev[1] !== p[1] || prev[2] !== p[2];
      if (moved) out.push({ seq: trail[i].seq, a: prev, b: p, item: trail[i] });
      else if (trail[i].revert && out.length > 0) {
        // A revert is a write on the node the dot is already on: the segment that led here becomes the doubled one.
        const last = out[out.length - 1];
        out[out.length - 1] = { ...last, item: { ...last.item, revert: true } };
      }
      prev = p;
    }
    return out;
  }, [scene, trail]);

  useFrame(() => {
    // Live segment: follow the dot while it's moving; hidden otherwise.
    const line = liveRef.current;
    if (!line) return;
    const moving = scrubSeq === null ? dotAnim.movingSeq : null;
    const seg = moving === null ? null : (segs.find((s) => s.seq === moving) ?? null);
    liveSeg.current = seg;
    line.visible = seg !== null;
    if (seg) {
      line.geometry.setPositions([...seg.a, dotAnim.pos.x, dotAnim.pos.y, dotAnim.pos.z]);
      const mat = line.material;
      mat.color.set(segColor(seg.item, final));
      mat.opacity = segAlpha(seg.item);
      mat.linewidth = segWidth(seg.item);
    }
  });

  if (!scene) return null;
  const limit = scrubSeq ?? dotAnim.doneSeq;
  const drawn = segs.filter((s) => s.seq <= limit);

  return (
    <group>
      {drawn.map((s) => (
        <group key={s.seq}>
          <Line points={[s.a, s.b]} color={segColor(s.item, final)} transparent opacity={segAlpha(s.item)} lineWidth={segWidth(s.item)} worldUnits />
          {s.item.revert && (
            <Line
              points={[s.a, s.b]}
              position={[0, geom.trailWidth * 2, 0]}
              color={segColor(s.item, final)}
              transparent
              opacity={segAlpha(s.item)}
              lineWidth={segWidth(s.item)}
              worldUnits
            />
          )}
        </group>
      ))}
      <Line ref={liveRef} points={[[0, 0, 0], [0, 0, 0]]} color={color.accent} transparent opacity={IN_SCOPE_ALPHA} lineWidth={geom.trailWidth} worldUnits visible={false} />
    </group>
  );
}

function segColor(item: TrailItem, final: string | null): string {
  if (final === "merged") return color.ok;
  return item.in_scope ? color.accent : color.danger;
}
function segAlpha(item: TrailItem): number {
  return item.in_scope ? IN_SCOPE_ALPHA : 1;
}
function segWidth(item: TrailItem): number {
  return item.revert ? geom.trailWidth * geom.revertWidthScale : geom.trailWidth;
}
