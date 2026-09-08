import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { arcsToStitches, getWrapBuffer, pinHit, toVec3 } from "./craft";
import { polePositions, regionIndex } from "./division";
import { createGuideGeometry } from "./guides";
import { PALETTES } from "./palettes";
import {
  generateMotif,
  hitKikuSlot,
  stitchesForSlot,
  stitchesFromSewn,
  type MotifId,
  type Stitch,
} from "./patterns";
import { PUZZLES } from "./puzzles";
import { createTemariMaterial, syncTemariMaterial } from "./shader";
import { createMotifGeometry } from "./stitches";
import { useTemari } from "./store";

const pointer = { x: 0, y: 0, down: false, dragged: false };
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _feed = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);

const DAMP = 0.46;
const WIND_MIN = 0.55;
const LIVE_MAX = 360;

function ThreadLayer({
  stitches,
  colors,
  opacity = 1,
}: {
  stitches: Stitch[];
  colors: [string, string, string, string];
  opacity?: number;
}) {
  const geos = useMemo(() => {
    return [0, 1, 2, 3].map((i) => createMotifGeometry(stitches, i));
  }, [stitches]);

  useEffect(() => {
    return () => {
      for (const geo of geos) geo?.dispose();
    };
  }, [geos]);

  return (
    <group>
      {geos.map((geo, i) =>
        geo ? (
          <mesh key={i} geometry={geo}>
            <meshStandardMaterial
              color={colors[i]}
              roughness={0.46}
              metalness={0.08}
              transparent={opacity < 1}
              opacity={opacity}
              depthWrite={opacity >= 1}
            />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function LiveThread() {
  const obj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LIVE_MAX * 3), 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: "#8f3d32",
      transparent: true,
      opacity: 0.92,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }, []);
  const wrap = getWrapBuffer();

  useEffect(() => {
    return () => {
      obj.geometry.dispose();
      (obj.material as THREE.LineBasicMaterial).dispose();
    };
  }, [obj]);

  useFrame(() => {
    const pts = wrap.live;
    const geo = obj.geometry;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    const n = Math.min(pts.length, LIVE_MAX);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      attr.setXYZ(i, p.x * 1.02, p.y * 1.02, p.z * 1.02);
    }
    attr.needsUpdate = true;
    geo.setDrawRange(0, n);
    (obj.material as THREE.LineBasicMaterial).color.set(wrap.liveColor);
  });

  return <primitive object={obj} />;
}

export function Ball() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const guidesMat = useRef<THREE.MeshStandardMaterial>(null);
  const beadMat = useRef<THREE.MeshStandardMaterial>(null);
  const beads = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const shafts = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const needle = useRef<THREE.Mesh>(null);
  const omega = useRef(new THREE.Vector3());
  const spinning = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0, t: 0, id: -1 });
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const mode = useTemari((s) => s.mode);
  const division = useTemari((s) => s.division);
  const paletteId = useTemari((s) => s.paletteId);
  const motif = useTemari((s) => s.motif);
  const craft = useTemari((s) => s.craft);
  const fills = useTemari((s) => s.fills);
  const sewn = useTemari((s) => s.sewn);
  const pins = useTemari((s) => s.pins);
  const pinArcs = useTemari((s) => s.pinArcs);
  const activePin = useTemari((s) => s.activePin);
  const hover = useTemari((s) => s.hover);
  const hoverSlot = useTemari((s) => s.hoverSlot);
  const selectedColor = useTemari((s) => s.selectedColor);
  const peeking = useTemari((s) => s.peeking);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const viewNonce = useTemari((s) => s.viewNonce);
  const wrapUndoNonce = useTemari((s) => s.wrapUndoNonce);
  const wrapResetNonce = useTemari((s) => s.wrapResetNonce);
  const paint = useTemari((s) => s.paint);
  const sew = useTemari((s) => s.sew);
  const placePin = useTemari((s) => s.placePin);
  const setHover = useTemari((s) => s.setHover);
  const setHoverSlot = useTemari((s) => s.setHoverSlot);
  const setWrapCount = useTemari((s) => s.setWrapCount);

  const material = useMemo(() => createTemariMaterial(), []);
  const guideGeo = useMemo(() => createGuideGeometry(division), [division]);
  const poles = useMemo(() => polePositions(division), [division]);
  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const target = mode === "kata" && puzzle ? puzzle.target : [];
  const wrap = getWrapBuffer();

  const preset: MotifId =
    mode === "title" ? "kiku" : mode === "studio" && motif !== "kiku" && motif !== "none" ? motif : "none";
  const presetStitches = useMemo(() => generateMotif(division, preset), [division, preset]);
  const sewnStitches = useMemo(
    () => (mode === "studio" ? stitchesFromSewn(division, sewn) : []),
    [division, mode, sewn],
  );
  const pinStitches = useMemo(
    () => (mode === "studio" ? arcsToStitches(pinArcs) : []),
    [mode, pinArcs],
  );
  const ghostStitches = useMemo(() => {
    if (mode !== "studio" || craft !== "stitch" || !hoverSlot) return [];
    return stitchesForSlot(division, hoverSlot, selectedColor);
  }, [craft, division, hoverSlot, mode, selectedColor]);

  useEffect(() => {
    matRef.current = material;
    return () => {
      material.dispose();
    };
  }, [material]);

  useEffect(() => {
    return () => {
      guideGeo.dispose();
    };
  }, [guideGeo]);

  useLayoutEffect(() => {
    const mesh = beads.current;
    if (!mesh) return;
    poles.forEach((p, i) => {
      dummy.position.set(p[0] * 1.01, p[1] * 1.01, p[2] * 1.01);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = poles.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, poles]);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.quaternion.identity();
    omega.current.set(0, 0, 0);
  }, [viewNonce]);

  useEffect(() => {
    if (wrapResetNonce === 0) {
      wrap.reset();
      return;
    }
    wrap.reset();
    setWrapCount(0);
  }, [setWrapCount, wrap, wrapResetNonce]);

  useEffect(() => {
    if (wrapUndoNonce === 0) return;
    wrap.undo();
    setWrapCount(wrap.strandCount);
  }, [setWrapCount, wrap, wrapUndoNonce]);

  useLayoutEffect(() => {
    const shaft = shafts.current;
    const head = heads.current;
    if (!shaft || !head) return;
    pins.forEach((pin, i) => {
      const n = _local.set(pin.p[0], pin.p[1], pin.p[2]).normalize();
      dummy.position.copy(n).multiplyScalar(1.015);
      dummy.quaternion.setFromUnitVectors(Y_UP, n);
      dummy.scale.setScalar(i === activePin ? 1.28 : 1);
      dummy.updateMatrix();
      shaft.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(n).multiplyScalar(1.055);
      dummy.scale.setScalar(i === activePin ? 1.28 : 1);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
    });
    shaft.count = pins.length;
    head.count = pins.length;
    shaft.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }, [activePin, dummy, pins]);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (useTemari.getState().mode === "title") return;
      if (e.button !== 0) return;
      spinning.current = true;
      lastPtr.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      omega.current.set(0, 0, 0);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.down = true;
      pointer.dragged = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* already */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!spinning.current || lastPtr.current.id !== e.pointerId) return;
      const dx = e.clientX - lastPtr.current.x;
      const dy = e.clientY - lastPtr.current.y;
      if (Math.hypot(dx, dy) > 7) pointer.dragged = true;
      const now = performance.now();
      const dt = Math.max(0.008, (now - lastPtr.current.t) / 1000);
      const k = 2.7 / Math.max(size.height, 1);
      const rx = dx * k;
      const ry = dy * k;
      const g = group.current;
      if (g && (rx !== 0 || ry !== 0)) {
        _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        _axis.copy(_up).multiplyScalar(rx).addScaledVector(_right, ry);
        const ang = _axis.length();
        if (ang > 1e-6) {
          _axis.normalize();
          _q.setFromAxisAngle(_axis, ang);
          g.quaternion.premultiply(_q);
          omega.current.copy(_axis).multiplyScalar(ang / dt);
        }
      }
      lastPtr.current = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      if (lastPtr.current.id !== e.pointerId) return;
      spinning.current = false;
      pointer.down = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already */
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [camera, gl, size.height]);

  useEffect(() => {
    const probe = {
      omega: () => omega.current.length(),
      wraps: () => wrap.strandCount,
      pins: () => useTemari.getState().pins.length,
      qy: () => group.current?.quaternion.y ?? 0,
    };
    (window as Window & { __temari?: typeof probe }).__temari = probe;
  }, [wrap]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    const g = group.current;
    const spd = omega.current.length();
    if (g && !spinning.current && spd > 0.0007) {
      _axis.copy(omega.current).normalize();
      _q.setFromAxisAngle(_axis, spd * d);
      g.quaternion.premultiply(_q);
      omega.current.multiplyScalar(Math.exp(-DAMP * d));
    } else if (!spinning.current && spd <= 0.0007) {
      omega.current.set(0, 0, 0);
    }

    const state = useTemari.getState();
    const winding =
      state.mode === "studio" &&
      state.craft === "wind" &&
      (spinning.current || spd > WIND_MIN);
    if (winding && g) {
      _feed.copy(camera.position).normalize();
      _inv.copy(g.quaternion).invert();
      _feed.applyQuaternion(_inv);
      const hex = PALETTES[state.paletteId].colors[state.selectedColor] ?? "#8f3d32";
      wrap.addPoint(_feed, state.selectedColor, hex);
      if (wrap.strandCount !== state.wrapCount) setWrapCount(wrap.strandCount);
    }

    const tip = needle.current;
    if (tip) {
      const last = wrap.live[wrap.live.length - 1];
      tip.visible = state.mode === "studio" && state.craft === "wind" && !!last;
      if (last) {
        tip.position.set(last.x * 1.028, last.y * 1.028, last.z * 1.028);
        const m = tip.material;
        if (m instanceof THREE.MeshStandardMaterial) m.color.set(wrap.liveColor);
      }
    }

    syncTemariMaterial(material, {
      division,
      paletteId,
      fills,
      target,
      hover: mode === "kata" ? hover : -1,
      peeking: mode === "kata" && peeking,
      camera: camera.position,
      wrap: wrap.texture,
      wrapOn: wrap.strandCount > 0 || wrap.live.length > 1,
    });
    if (guidesMat.current) guidesMat.current.color.set(palette.thread);
    if (beadMat.current) beadMat.current.color.set(palette.thread);
  });

  const canWork = mode !== "title";
  const threadHex = palette.colors[selectedColor] ?? palette.thread;

  const localFromEvent = (e: THREE.Intersection) => {
    _local.copy(e.point);
    group.current?.worldToLocal(_local);
    return toVec3(_local);
  };

  return (
    <group ref={group}>
      <mesh
        onPointerMove={(e) => {
          if (!canWork || pointer.dragged) {
            if (hover !== -1) setHover(-1);
            if (hoverSlot) setHoverSlot(null);
            return;
          }
          const p = localFromEvent(e);
          if (mode === "kata") {
            setHover(regionIndex(p[0], p[1], p[2], division));
            return;
          }
          if (craft === "stitch") setHoverSlot(hitKikuSlot(p[0], p[1], p[2], division));
          else if (craft === "pin") {
            const hit = pinHit(p, pins);
            setHoverSlot(null);
            if (hit < 0 && hover !== -1) setHover(-1);
          }
        }}
        onPointerUp={(e) => {
          const dragged = pointer.dragged;
          pointer.down = false;
          pointer.dragged = false;
          if (!canWork || dragged || e.button !== 0) return;
          e.stopPropagation();
          const p = localFromEvent(e);
          if (mode === "kata") {
            paint(regionIndex(p[0], p[1], p[2], division));
            return;
          }
          if (craft === "pin") {
            placePin(p);
            return;
          }
          if (craft !== "stitch") return;
          const slot = hitKikuSlot(p[0], p[1], p[2], division);
          if (slot) sew(slot);
        }}
        onPointerOut={() => {
          if (hover !== -1) setHover(-1);
          if (hoverSlot) setHoverSlot(null);
        }}
      >
        <sphereGeometry args={[0.992, 96, 64]} />
        <primitive object={material} attach="material" />
      </mesh>

      <mesh geometry={guideGeo}>
        <meshStandardMaterial
          ref={guidesMat}
          color={palette.thread}
          roughness={0.48}
          metalness={0.12}
        />
      </mesh>

      {presetStitches.length > 0 ? (
        <ThreadLayer stitches={presetStitches} colors={palette.colors} />
      ) : null}
      {sewnStitches.length > 0 ? (
        <ThreadLayer stitches={sewnStitches} colors={palette.colors} />
      ) : null}
      {pinStitches.length > 0 ? (
        <ThreadLayer stitches={pinStitches} colors={palette.colors} />
      ) : null}
      {ghostStitches.length > 0 ? (
        <ThreadLayer stitches={ghostStitches} colors={palette.colors} opacity={0.42} />
      ) : null}

      {mode === "studio" ? <LiveThread /> : null}

      <mesh ref={needle} visible={false}>
        <sphereGeometry args={[0.018, 12, 10]} />
        <meshStandardMaterial color={threadHex} roughness={0.38} metalness={0.14} />
      </mesh>

      <instancedMesh ref={beads} args={[undefined, undefined, 12]} frustumCulled={false}>
        <sphereGeometry args={[0.032, 16, 12]} />
        <meshStandardMaterial
          ref={beadMat}
          color={palette.thread}
          roughness={0.42}
          metalness={0.16}
        />
      </instancedMesh>

      <instancedMesh
        ref={shafts}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
        visible={pins.length > 0}
        count={pins.length}
      >
        <cylinderGeometry args={[0.007, 0.007, 0.068, 8]} />
        <meshStandardMaterial color={palette.thread} roughness={0.4} metalness={0.22} />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
        visible={pins.length > 0}
        count={pins.length}
      >
        <sphereGeometry args={[0.02, 12, 10]} />
        <meshStandardMaterial color={threadHex} roughness={0.36} metalness={0.12} />
      </instancedMesh>
    </group>
  );
}
