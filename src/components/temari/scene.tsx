import { Component, type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Ball } from "./ball";
import { useTemari, type Mode } from "./store";

const FOV = 32;
const BALL_R = 1.05;
const FIT_MARGIN = 1.16;

function framingDistance(width: number, height: number, mode: Mode) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const halfW = halfH * (width / Math.max(height, 1));
  const margin = mode === "studio" ? 1.46 : FIT_MARGIN;
  return (BALL_R * margin) / Math.min(halfW, halfH);
}

function aimY(width: number, height: number, mode: Mode) {
  const portrait = height > width * 1.15;
  if (mode === "title") return portrait ? 0.06 : 0;
  return portrait ? -0.12 : -0.04;
}

function CameraRig() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const mode = useTemari((s) => s.mode);
  const viewNonce = useTemari((s) => s.viewNonce);
  const autoRotate = mode === "title";
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
  } | null>(null);

  const dist = useMemo(
    () => framingDistance(size.width, size.height, mode),
    [mode, size.height, size.width],
  );

  useLayoutEffect(() => {
    camera.fov = FOV;
    camera.near = 0.1;
    camera.far = Math.max(40, dist * 4);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, dist, size.height, size.width]);

  useLayoutEffect(() => {
    const y = aimY(size.width, size.height, mode);
    const dir = new THREE.Vector3(0, 0.08, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.position.y += 0.12;
    camera.up.set(0, 1, 0);
    camera.lookAt(0, y, 0);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, y, 0);
      controls.update();
    }
  }, [camera, dist, mode, size.height, size.width, viewNonce]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enablePan={false}
      enableRotate={autoRotate}
      enableZoom={!autoRotate}
      enableDamping
      dampingFactor={0.08}
      minDistance={dist * 0.42}
      maxDistance={dist * 2.35}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      autoRotate={autoRotate && !reduce}
      autoRotateSpeed={0.42}
      rotateSpeed={0.72}
      zoomSpeed={1.05}
    />
  );
}

class SceneGuard extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  render() {
    if (this.state.dead) return null;
    return this.props.children;
  }
}

export function TemariScene() {
  return (
    <SceneGuard>
    <Canvas
      className="absolute inset-0 z-[8] touch-none"
      camera={{ position: [0, 0.2, 3.6], fov: FOV, near: 0.1, far: 60 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor("#ece8e1", 1);
        scene.background = new THREE.Color("#ece8e1");
      }}
    >
      <hemisphereLight color="#f4efe6" groundColor="#c4b8a4" intensity={0.72} />
      <ambientLight intensity={0.42} color="#f0e6d6" />
      <directionalLight position={[3.2, 4.4, 2.4]} intensity={1.18} color="#fff6ea" />
      <directionalLight position={[-2.8, 0.8, -1.8]} intensity={0.34} color="#9aab9c" />
      <Ball />
      <CameraRig />
    </Canvas>
    </SceneGuard>
  );
}
