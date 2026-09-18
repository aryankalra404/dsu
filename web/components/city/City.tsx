"use client";
// The code city (MVP.md §9 centre column). Directories are districts, files are buildings (height = lines of code),
// the lit plate is the confirmed scope, the dot is the agent, arcs over the roofs are its trajectory.
// Every position comes from the server; this component only renders and reports presence.
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ComponentRef } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, Vector3 } from "three";
import { Layers, Maximize2 } from "lucide-react";
import type { Building } from "@/lib/contracts";
import { color, motion } from "@/lib/design";
import { useRun } from "@/lib/store";
import { sendUpstream } from "@/lib/useRun";
import { pathInScope } from "@/lib/glob";
import { buildingStates, roof, visibleTrail } from "@/components/city/cityMath";
import { BuildingOutline, Buildings } from "@/components/city/Buildings";
import { Ground, ScopeDistrict } from "@/components/city/Ground";
import { AgentDot, Ghosts, Imports, Satellites, Trail } from "@/components/city/Movement";
import { cx } from "@/components/ui";

type Controls = ComponentRef<typeof OrbitControls>;

export function City({ previewScope }: { previewScope?: string[] | null }) {
  const scene = useRun((s) => s.scene);
  const events = useRun((s) => s.events);
  const scrub = useRun((s) => s.scrub);
  const selected = useRun((s) => s.selected);
  const hovered = useRun((s) => s.hovered);
  const clientId = useRun((s) => s.clientId);
  const graphVersion = useRun((s) => s.graphVersion);
  const [allImports, setAllImports] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const nodes = useMemo(() => {
    const ns = scene?.graph.nodes ?? [];
    if (!previewScope) return ns;
    return ns.map((n) => ({ ...n, in_scope: pathInScope(n.id, previewScope) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion, previewScope, scene?.graph.nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const scope = useMemo(() => new Set(nodes.filter((n) => n.in_scope).map((n) => n.id)), [nodes]);
  const states = useMemo(() => buildingStates(events, scrub), [events, scrub]);
  const stops = useMemo(() => visibleTrail(scene?.trail ?? [], scrub), [scene?.trail, scrub]);

  const dotNode = scrub !== null ? (stops.at(-1)?.node ?? null) : (scene?.agent.node ?? null);
  const focus = selected ?? hovered;
  const dimmed = useMemo(() => {
    if (!focus || allImports) return null;
    const s = new Set<string>([focus]);
    for (const e of scene?.graph.edges ?? []) {
      if (e.src === focus) s.add(e.dst);
      if (e.dst === focus) s.add(e.src);
    }
    return s.size > 1 ? s : null;
  }, [focus, allImports, scene?.graph.edges]);

  if (!scene) return null;
  const hoveredB = hovered ? byId.get(hovered) : undefined;
  const selectedB = selected ? byId.get(selected) : undefined;

  const select = (id: string | null) => {
    useRun.getState().select(id);
    sendUpstream({ t: "select", node: id, by: clientId });
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#F9FBFE_0%,#EEF2F8_100%)]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0.72, 0.62, 0.86], fov: 36, near: 0.005, far: 30 }}
        onPointerMissed={() => select(null)}
      >
        <fog attach="fog" args={["#EEF2F8", 2.2, 5]} />
        <hemisphereLight args={["#ffffff", "#dfe5ee", 1.05]} />
        <directionalLight
          position={[0.55, 1.25, 0.35]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-0.6}
          shadow-camera-right={0.6}
          shadow-camera-top={0.6}
          shadow-camera-bottom={-0.6}
          shadow-camera-near={0.1}
          shadow-camera-far={3}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-0.8, 0.6, -0.5]} intensity={0.35} />
        <CameraRig nodes={nodes} selected={selectedB ?? null} frameKey={frameKey} />

        <Ground districts={scene.graph.districts} nodes={nodes} />
        <ScopeDistrict nodes={nodes} scope={scope} />
        <Buildings
          nodes={nodes}
          states={states}
          hovered={hovered}
          selected={selected}
          dimmed={dimmed}
          onHover={(id) => useRun.getState().hover(id)}
          onSelect={(id) => select(id)}
        />
        {selectedB && <BuildingOutline b={selectedB} tone={color.accent} />}
        {hoveredB && hoveredB.id !== selected && <BuildingOutline b={hoveredB} tone={color.muted} />}
        <Imports edges={scene.graph.edges} byId={byId} focus={focus} all={allImports} />
        <Trail stops={stops} byId={byId} final={scene.final} />
        <AgentDot
          node={dotNode}
          byId={byId}
          state={scene.agent.state}
          label={dotNode && scene.agent.state !== "idle" ? dotNode : null}
          scrubbing={scrub !== null}
        />
        <Satellites claims={scene.claims} scopeNodes={nodes.filter((n) => n.in_scope)} />
        <Ghosts cursors={scene.cursors} self={clientId} />
        <PresencePlane clientId={clientId} onClear={() => select(null)} />
        {hoveredB && <Tooltip b={hoveredB} reads={states.get(hoveredB.id)?.reads ?? 0} writes={states.get(hoveredB.id)?.writes ?? 0} />}
        <ContactShadows position={[0, -0.0205, 0]} scale={1.4} blur={2.6} opacity={0.35} far={0.3} />
      </Canvas>

      {nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">This repo has no files to map.</div>
      )}
      <Legend />
      <div className="absolute top-3 right-3 flex gap-1.5">
        <ToolButton active={allImports} onClick={() => setAllImports((v) => !v)} title="Show all import edges">
          <Layers className="size-3.5" /> imports
        </ToolButton>
        <ToolButton onClick={() => setFrameKey((k) => k + 1)} title="Re-frame the city">
          <Maximize2 className="size-3.5" />
        </ToolButton>
      </div>
      {scene.graph.truncated && (
        <div className="absolute top-3 left-3 rounded-md border border-warn/25 bg-warn-soft px-2 py-1 text-[11px] text-warn">
          large repo: showing the first files only
        </div>
      )}
    </div>
  );
}

function ToolButton({ active, onClick, title, children }: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium shadow-sm backdrop-blur transition",
        active ? "border-accent/30 bg-accent-soft text-accent-strong" : "border-line bg-white/80 text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Legend() {
  const items: [string, string][] = [
    [color.building, "file"],
    [color.buildingScope, "in scope"],
    [color.buildingTouched, "agent wrote (in scope)"],
    [color.danger, "agent wrote (out of scope)"],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white/85 px-2.5 py-1.5 text-[11px] text-muted shadow-sm backdrop-blur">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: c }} />
          {l}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ background: color.accent }} /> agent
      </span>
      <span className="text-faint">height = lines of code</span>
    </div>
  );
}

function Tooltip({ b, reads, writes }: { b: Building; reads: number; writes: number }) {
  return (
    <Html position={roof(b, 0.012)} center style={{ pointerEvents: "none" }} zIndexRange={[30, 20]}>
      <div className="-translate-y-6 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-[var(--shadow-pop)]">
        <div className="font-mono font-semibold text-ink">{b.id}</div>
        <div className="mt-0.5 flex gap-2 text-muted">
          <span>{b.loc} loc</span>
          <span>{b.lang}</span>
          <span className={b.in_scope ? "text-accent" : ""}>{b.in_scope ? "in scope" : "out of scope"}</span>
          {reads + writes > 0 && (
            <span>
              {reads}r · {writes}w
            </span>
          )}
        </div>
      </div>
    </Html>
  );
}

/** Auto-frame once per load (and on demand), idle orbit until touched, F focuses the selection, Esc clears. */
function CameraRig({ nodes, selected, frameKey }: { nodes: Building[]; selected: Building | null; frameKey: number }) {
  const controls = useRef<Controls>(null);
  const camera = useThree((s) => s.camera);
  const touched = useRef(false);
  const framed = useRef(-1);
  const focusTo = useRef<{ from: Vector3; to: Vector3; t0: number } | null>(null);

  useEffect(() => {
    if (!controls.current || !nodes.length || framed.current === frameKey) return;
    framed.current = frameKey;
    const box = new Box3();
    for (const n of nodes) {
      box.expandByPoint(new Vector3(n.pos[0] - n.size[0] / 2, 0, n.pos[2] - n.size[2] / 2));
      box.expandByPoint(new Vector3(n.pos[0] + n.size[0] / 2, n.size[1], n.pos[2] + n.size[2] / 2));
    }
    const c = box.getCenter(new Vector3());
    const r = Math.max(box.getSize(new Vector3()).length(), 0.3);
    controls.current.target.set(c.x, 0.02, c.z);
    camera.position.set(c.x + r * 0.78, r * 0.72, c.z + r * 0.95);
    controls.current.update();
  }, [nodes, camera, frameKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key.toLowerCase() === "f" && selected && controls.current) {
        focusTo.current = { from: controls.current.target.clone(), to: roof(selected, 0), t0: performance.now() };
      }
      if (e.key === "Escape") {
        useRun.getState().select(null);
        useRun.getState().setScrub(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const f = focusTo.current;
      if (f && controls.current) {
        const t = Math.min((performance.now() - f.t0) / motion.cameraFocus, 1);
        controls.current.target.lerpVectors(f.from, f.to, 1 - Math.pow(1 - t, 3));
        controls.current.update();
        if (t >= 1) focusTo.current = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.15}
      maxDistance={3}
      maxPolarAngle={Math.PI * 0.46}
      autoRotate={!touched.current}
      autoRotateSpeed={(60 / motion.idleOrbitSecondsPerRev) * 2 * 0.5}
      onStart={() => {
        touched.current = true;
        if (controls.current) controls.current.autoRotate = false;
      }}
    />
  );
}

/** Invisible ground plane that reports this client's pointer to the other clients (<= 20 Hz). */
function PresencePlane({ clientId, onClear }: { clientId: string; onClear: () => void }) {
  const last = useRef(0);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0.0001, 0]}
      onClick={onClear}
      onPointerMove={(e) => {
        const now = performance.now();
        if (now - last.current < 50) return;
        last.current = now;
        sendUpstream({ t: "cursor", client: clientId, kind: "mouse", pos: [e.point.x, e.point.y + 0.01, e.point.z] });
      }}
    >
      <planeGeometry args={[1.2, 1.2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
