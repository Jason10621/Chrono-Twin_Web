"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sphere, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { vitalityColor } from "@/lib/chronoTwinModel";

/**
 * Chrono-Twin 3D 아바타
 * =====================
 * 사용자가 입력한 오늘의 습관(블루라이트·카페인·조명·수면부채) →
 * pipeline 과 동일한 계수로 계산한 vitality(0~1) 를 그대로 시각화한다.
 *
 *   vitality → 1 (건강)  : 매끈하고 밝은 청록색 구, 완만한 호흡, 활발한 에너지 입자
 *   vitality → 0 (심각)  : 일그러지고 어두운 붉은색 구, 불안정한 진동, 움츠러든 크기
 *
 * 장식이 아니라 데이터 인코딩: 색상=vitalityColor(), 왜곡도·속도·크기가 모두
 * chronoTwinModel.ts 의 동일한 vitality 값 하나에서 파생된다.
 */

function Core({ vitality }: { vitality: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => vitalityColor(vitality), [vitality]);

  const distort = 0.12 + (1 - vitality) * 0.55; // 나쁠수록 더 일그러짐
  const speed = 0.5 + (1 - vitality) * 2.4; // 나쁠수록 더 불안정하게 흔들림
  const targetScale = 0.78 + vitality * 0.34; // 나쁠수록 움츠러듦

  useFrame((state) => {
    const m = meshRef.current;
    if (!m) return;
    const t = state.clock.getElapsedTime();
    const breathe = 1 + Math.sin(t * (0.7 + (1 - vitality) * 0.5)) * 0.045 * (0.5 + vitality);
    const s = targetScale * breathe;
    m.scale.lerp(new THREE.Vector3(s, s, s), 0.08);
    m.rotation.y += 0.0025 + (1 - vitality) * 0.005;
    m.rotation.x = Math.sin(t * 0.3) * 0.08;
  });

  return (
    <Sphere ref={meshRef} args={[1, 96, 96]}>
      <MeshDistortMaterial
        color={color}
        distort={distort}
        speed={speed}
        roughness={0.3}
        metalness={0.15}
        emissive={color}
        emissiveIntensity={0.12 + vitality * 0.3}
      />
    </Sphere>
  );
}

function EnergyMotes({ vitality }: { vitality: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const count = Math.max(4, Math.round(6 + vitality * 14));
  const items = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ r: 1.55 + (i % 3) * 0.22, yOff: Math.sin(i * 1.7) * 0.7, phase: i })),
    [count]
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.getElapsedTime() * (0.12 + vitality * 0.4);
  });

  const color = vitalityColor(vitality);

  return (
    <group ref={groupRef}>
      {items.map((it, i) => {
        const angle = (i / items.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * it.r, it.yOff, Math.sin(angle) * it.r]}>
            <sphereGeometry args={[0.03 + vitality * 0.02, 8, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function ChronoTwinAvatar({ vitality }: { vitality: number }) {
  const v = Math.min(1, Math.max(0, vitality));
  return (
    <div className="relative w-full h-[380px] md:h-[440px] rounded-2xl overflow-hidden glass-panel">
      <Canvas camera={{ position: [0, 0, 4.6], fov: 42 }} dpr={[1, 1.8]}>
        <ambientLight intensity={0.55} />
        <pointLight position={[3, 3, 4]} intensity={1.5} color={vitalityColor(v)} />
        <pointLight position={[-3, -2, -3]} intensity={0.45} color="#4fa3e0" />
        <Core vitality={v} />
        <EnergyMotes vitality={v} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.55} />
      </Canvas>
      <div className="absolute top-3 left-4 text-[10px] font-mono tracking-widest text-white/40 uppercase pointer-events-none">
        Chrono-Twin · live
      </div>
    </div>
  );
}
