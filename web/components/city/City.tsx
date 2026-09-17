"use client";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { BoxGeometry } from "three";
import { OrbitControls } from "@react-three/drei";
import { color, geom } from "@/lib/design";
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
      <ambientLight intensity={0.35} />
      <directionalLight position={[1, 2, 1.5]} intensity={1.1} />
      <OrbitControls enableDamping dampingFactor={0.08} target={[0, 0, 0]} minDistance={0.3} maxDistance={4} />
      <group>
        <Edges />
        <ScopeDistrict />
        <Nodes />
        <Trail />
        <AgentDot />
      </group>
      {/* 0.8 m bounding cube, DESIGN.md geometry sanity reference. Barely visible on purpose. */}
      <lineSegments>
        <edgesGeometry args={[cube]} />
        <lineBasicMaterial color={color.edgeDim} transparent opacity={0.15} />
      </lineSegments>
    </Canvas>
  );
}
