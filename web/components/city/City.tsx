"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Box3, BoxGeometry, Vector3 } from "three";
import { Grid, OrbitControls } from "@react-three/drei";
import type { ComponentRef } from "react";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { atmosphere, color, geom } from "@/lib/design";
import { useRunStore } from "@/lib/store";
import { Nodes } from "@/components/city/Nodes";
import { Edges } from "@/components/city/Edges";
import { ScopeDistrict } from "@/components/city/ScopeDistrict";
import { AgentDot } from "@/components/city/AgentDot";
import { Trail } from "@/components/city/Trail";

/** The R3F city. Units are metres, same 0.8 m cube the headset shows; positions come from the server only. */
export function City() {
  const cube = useMemo(() => new BoxGeometry(geom.cube, geom.cube, geom.cube), []);
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0.9, 0.55, 1.1], fov: 40, near: 0.01, far: 20 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor(color.bg, 1)}
    >
      <fog attach="fog" args={[color.bg, atmosphere.fogNear, atmosphere.fogFar]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[1, 2, 1.5]} intensity={1.0} />
      <Controls />
      <group>
        <Edges />
        <ScopeDistrict />
        <Nodes />
        <Trail />
        <AgentDot />
      </group>
      {/* DESIGN.md → Atmosphere: floor grid in edge-dim at the bottom of the cube. */}
      <Grid
        position={[0, atmosphere.gridY, 0]}
        args={[4, 4]}
        cellSize={atmosphere.gridCell}
        cellThickness={0.6}
        cellColor={color.edgeDim}
        sectionSize={atmosphere.gridSection}
        sectionThickness={1}
        sectionColor={color.edgeDim}
        fadeDistance={atmosphere.gridFade}
        fadeStrength={1.5}
        infiniteGrid
      />
      {/* 0.8 m bounding cube, DESIGN.md geometry sanity reference. Barely visible on purpose. */}
      <lineSegments>
        <edgesGeometry args={[cube]} />
        <lineBasicMaterial color={color.edgeDim} transparent opacity={0.2} />
      </lineSegments>
      <EffectComposer multisampling={4}>
        <Bloom
          luminanceThreshold={atmosphere.bloomThreshold}
          luminanceSmoothing={0.2}
          intensity={atmosphere.bloomIntensity}
          radius={atmosphere.bloomRadius}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * OrbitControls + DESIGN.md camera rules: auto-frame the node bounding box once per scene, idle-orbit
 * slowly until the user touches the canvas, `F` focuses the selected node (600 ms), no other auto moves.
 */
function Controls() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const scene = useRunStore((s) => s.scene);
  const selected = useRunStore((s) => s.selected);
  const touched = useRef(false);
  const focusTarget = useRef<Vector3 | null>(null);

  // Auto-frame once per scene.
  useEffect(() => {
    if (!scene || !controls.current) return;
    const box = new Box3();
    for (const n of scene.graph.nodes) box.expandByPoint(new Vector3().fromArray(n.pos));
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length() || geom.cube;
    const dist = Math.max(0.55, size * 0.95);
    controls.current.target.copy(center);
    camera.position.set(center.x + dist * 0.75, center.y + dist * 0.45, center.z + dist * 0.9);
    camera.lookAt(center);
    controls.current.update();
  }, [scene, camera]);

  // F → focus selected node (DESIGN motion.cameraFocus). Only the target eases; distance stays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || !scene || !selected) return;
      const n = scene.graph.nodes.find((x) => x.id === selected);
      if (n) focusTarget.current = new Vector3().fromArray(n.pos);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, selected]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    let raf = 0;
    const tick = () => {
      if (focusTarget.current) {
        c.target.lerp(focusTarget.current, 0.12);
        if (c.target.distanceTo(focusTarget.current) < 0.0005) focusTarget.current = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.3}
      maxDistance={4}
      autoRotate={!touched.current}
      autoRotateSpeed={(60 / atmosphere.idleOrbitSecondsPerRev) * 2} // drei: 2.0 == 30 s/rev
      onStart={() => {
        if (!touched.current && controls.current) {
          touched.current = true;
          controls.current.autoRotate = false;
        }
      }}
    />
  );
}
