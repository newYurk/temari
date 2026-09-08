import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Ball } from "./ball";
import { useTemari, type Mode } from "./store";

const FOV = 36;
const BALL_R = 1.08;
const FIT_MARGIN = 1.14;

function framingDistance(width: number, height: number) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const halfW = halfH * (width / Math.max(height, 1));
  return (BALL_R * FIT_MARGIN) / Math.min(halfW, halfH);
}

function viewLift(width: number, height: number, mode: Mode) {
  if (mode !== "title") return 0;
  const portrait = height > width * 1.15;
  return height * (portrait ? 0.06 : 0.03);
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
    () => framingDistance(size.width, size.height),
    [size.height, size.width],
  );

  useLayoutEffect(() => {
    camera.fov = FOV;
    camera.near = 0.1;
    camera.far = Math.max(40, dist * 4);
    const lift = viewLift(size.width, size.height, mode);
    if (lift === 0) {
      camera.clearViewOffset();
    } else {
      camera.setViewOffset(size.width, size.height, 0, lift, size.width, size.height);
    }
    camera.updateProjectionMatrix();
  }, [camera, dist, mode, size.height, size.width]);

  useLayoutEffect(() => {
    const dir = new THREE.Vector3(0, 0.06, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [camera, dist, viewNonce]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enablePan={false}
      enableRotate={autoRotate}
      enableZoom={!autoRotate}
      enableDamping
      dampingFactor={0.08}
      minDistance={Math.min(2.15, dist * 0.55)}
      maxDistance={dist}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      autoRotate={autoRotate && !reduce}
      autoRotateSpeed={0.42}
      rotateSpeed={0.72}
      zoomSpeed={0.7}
    />
  );
}

export function TemariScene() {
  return (
    <Canvas
      className="absolute inset-0 z-0 touch-none"
      camera={{ position: [0, 0.2, 3.6], fov: FOV, near: 0.1, far: 60 }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor("#0c0b09", 1);
        scene.background = new THREE.Color("#0c0b09");
      }}
    >
      <ambientLight intensity={0.3} color="#cfc6b8" />
      <directionalLight position={[3.1, 4.2, 2.1]} intensity={1.42} color="#fff3e4" />
      <directionalLight position={[-2.6, 0.5, -2.6]} intensity={0.26} color="#8a96a8" />
      <Ball />
      <CameraRig />
    </Canvas>
  );
}
