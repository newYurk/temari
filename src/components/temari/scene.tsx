import { Component, type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Ball } from "./ball";
import { useTemari, type Mode } from "./store";

const FOV = 32;
const BALL_R = 1.05;
const FIT_MARGIN = 1.16;
/** Just off the pearl — the pole weave can fill the view. */
const SURFACE_CLOSE = 1.16;
export type InspectionView = 'pole' | 'close' | 'side';
type Inspection = { view: InspectionView; focus: readonly [number, number, number] };

function framingDistance(width: number, height: number, mode: Mode) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const halfW = halfH * (width / Math.max(height, 1));
  // The dock no longer lies over the ball, so the workshop can show it larger.
  const margin = mode === "studio" ? 1.2 : FIT_MARGIN;
  return (BALL_R * margin) / Math.min(halfW, halfH);
}

function aimY(_width: number, _height: number, _mode: Mode) {
  return 0;
}

function CameraRig({ inspection }: { inspection?: Inspection }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const storedMode = useTemari((s) => s.mode);
  const mode = inspection ? 'studio' : storedMode;
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
    camera.near = 0.05;
    camera.far = Math.max(40, dist * 4);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, dist, size.height, size.width]);

  useLayoutEffect(() => {
    const y = aimY(size.width, size.height, mode);
    const dir = new THREE.Vector3(0, 0.08, 1).normalize();
    const target = new THREE.Vector3(0, y, 0);
    camera.position.copy(dir.multiplyScalar(dist)); camera.up.set(0, 1, 0);
    if (inspection) {
      const focus = new THREE.Vector3(...inspection.focus);
      camera.up.set(0, 0, -1);
      if (inspection.view === 'pole') camera.position.set(0, dist, .02);
      else {
        target.copy(focus);
        camera.position.copy(focus).multiplyScalar(inspection.view === 'close' ? 1.7 : 1.15);
        if (inspection.view === 'side') camera.position.x += .7;
      }
    }
    camera.lookAt(target);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
  }, [camera, dist, mode, size.height, size.width, viewNonce, inspection?.view, inspection?.focus]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enablePan={false}
      enableRotate={autoRotate || !!inspection}
      enableZoom={!autoRotate}
      enableDamping
      dampingFactor={0.08}
      minDistance={inspection ? .12 : SURFACE_CLOSE}
      maxDistance={dist * 2.35}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      autoRotate={autoRotate && !reduce}
      autoRotateSpeed={0.42}
      rotateSpeed={0.72}
      zoomSpeed={1.4}
    />
  );
}

class SceneGuard extends Component<{ children: ReactNode; onError?: (message: string) => void }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error.message);
  }
  render() {
    if (this.state.dead) return null;
    return this.props.children;
  }
}

export function TemariScene({ children, inspection, onError }: {
  children?: ReactNode; inspection?: Inspection; onError?: (message: string) => void;
} = {}) {
  return (
    <SceneGuard onError={onError}>
    <Canvas
      className="absolute inset-0 z-[8] touch-none"
      camera={{ position: [0, 0.2, 3.6], fov: FOV, near: 0.05, far: 60 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl, scene }) => {
        // Transparent: the page colour (light or night theme) shows around the ball.
        gl.setClearColor("#000000", 0);
        scene.background = null;
      }}
    >
      <hemisphereLight color="#f4efe6" groundColor="#c4b8a4" intensity={0.72} />
      <ambientLight intensity={0.42} color="#f0e6d6" />
      <directionalLight position={[3.2, 4.4, 2.4]} intensity={1.18} color="#fff6ea" />
      <directionalLight position={[-2.8, 0.8, -1.8]} intensity={0.34} color="#9aab9c" />
      {children ?? <Ball />}
      <CameraRig inspection={inspection} />
    </Canvas>
    </SceneGuard>
  );
}
