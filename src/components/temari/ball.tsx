import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { arcsToStitches, getWrapBuffer, pinHit, MariWinder, strokePx, toVec3 } from "./craft";
import { gridNodes, polePositions, regionIndex, snapToNode } from "./division";
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
import { createMotifGeometry, getYarnTexture } from "./stitches";
import { useTemari } from "./store";
import * as feel from "./feel";
import { DEFAULT_KIND, threadMetalness, threadRoughness } from "./thread";

const pointer = { x: 0, y: 0, down: false, dragged: false };
const gesture = { aimed: false };
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _feed = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _binormal = new THREE.Vector3();
const _tPrev = new THREE.Vector3();
const _axisT = new THREE.Vector3();
const _left = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);

const DAMP = 0.46;
const YARN_MAX = 9000;

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
  const yarn = useMemo(() => getYarnTexture(), []);

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
              map={yarn}
              color={colors[i]}
              roughness={threadRoughness(DEFAULT_KIND.stitch)}
              metalness={threadMetalness(DEFAULT_KIND.stitch)}
              transparent
              opacity={opacity}
              depthWrite={opacity >= 1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function LiveThread() {
  const obj = useMemo(() => {
    const n = YARN_MAX;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = new Uint32Array(Math.max(1, n - 1) * 6);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }, []);
  const wrap = getWrapBuffer();
  const _col = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    return () => {
      obj.geometry.dispose();
      (obj.material as THREE.MeshBasicMaterial).dispose();
    };
  }, [obj]);

  useFrame(() => {
    const strands = wrap.yarn();
    const geo = obj.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    const idx = geo.getIndex() as THREE.BufferAttribute;
    const half = Math.max(0.012, (wrap.strokeWidth / 768) * Math.PI * 0.4);
    let total = 0;
    for (const s of strands) total += s.points.length;
    let skip = 0;
    if (total > YARN_MAX) {
      let acc = 0;
      const extra = total - YARN_MAX;
      for (const s of strands) {
        if (acc + s.points.length <= extra) {
          acc += s.points.length;
          skip++;
        } else break;
      }
    }
    let v = 0;
    let ii = 0;
    for (let s = skip; s < strands.length; s++) {
      const pts = strands[s]?.points;
      if (!pts || pts.length < 2) continue;
      const room = YARN_MAX - v / 2;
      if (room < 2) break;
      const n = Math.min(pts.length, room);
      const start = pts.length - n;
      _col.set(strands[s]?.hex ?? "#8f3d32");
      const v0 = v;
      const lift = 1.012 + (s - skip) * 0.00035;
      for (let i = 0; i < n; i++) {
        const p = pts[start + i];
        if (!p) continue;
        const prev = pts[start + Math.max(0, i - 1)] ?? p;
        const next = pts[start + Math.min(n - 1, i + 1)] ?? p;
        _feed.copy(next).sub(prev);
        if (_feed.lengthSq() < 1e-12) {
          _local.copy(p).normalize();
          _feed.crossVectors(_local, _binormal.lengthSq() > 0.5 ? _binormal : Y_UP);
        }
        _feed.normalize();
        _local.copy(p).normalize();
        if (i === 0) {
          _right.crossVectors(_feed, _local);
          if (_right.lengthSq() < 1e-10) _right.set(0, 1, 0).cross(_feed);
          _right.normalize();
          _binormal.copy(_right);
          _tPrev.copy(_feed);
        } else {
          _axisT.crossVectors(_tPrev, _feed);
          if (_axisT.lengthSq() > 1e-12) {
            const ang = Math.acos(Math.min(1, Math.max(-1, _tPrev.dot(_feed))));
            _binormal.applyAxisAngle(_axisT.normalize(), ang);
          }
          _binormal.addScaledVector(_feed, -_binormal.dot(_feed)).normalize();
          _right.copy(_binormal);
          _tPrev.copy(_feed);
        }
        _left.copy(_local).addScaledVector(_right, half).normalize().multiplyScalar(lift);
        _rgt.copy(_local).addScaledVector(_right, -half).normalize().multiplyScalar(lift);
        const vi = v / 2;
        pos.setXYZ(vi * 2, _left.x, _left.y, _left.z);
        pos.setXYZ(vi * 2 + 1, _rgt.x, _rgt.y, _rgt.z);
        nrm.setXYZ(vi * 2, _local.x, _local.y, _local.z);
        nrm.setXYZ(vi * 2 + 1, _local.x, _local.y, _local.z);
        col.setXYZ(vi * 2, _col.r, _col.g, _col.b);
        col.setXYZ(vi * 2 + 1, _col.r, _col.g, _col.b);
        v += 2;
      }
      const used = (v - v0) / 2;
      for (let i = 0; i < used - 1; i++) {
        const a = v0 + i * 2;
        idx.setX(ii, a);
        idx.setX(ii + 1, a + 1);
        idx.setX(ii + 2, a + 2);
        idx.setX(ii + 3, a + 1);
        idx.setX(ii + 4, a + 3);
        idx.setX(ii + 5, a + 2);
        ii += 6;
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    col.needsUpdate = true;
    idx.needsUpdate = true;
    geo.setDrawRange(0, ii);
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
  const knots = useRef<THREE.InstancedMesh>(null);
  const omega = useRef(new THREE.Vector3());
  const spinning = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0, t: 0, id: -1 });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mari = useRef(new MariWinder());
  const snapGhost = useRef<THREE.Mesh>(null);
  const nodesMesh = useRef<THREE.InstancedMesh>(null);

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
  const layerDone = useTemari((s) => s.layerDone);
  const wrapSeed = useTemari((s) => s.wrapSeed);
  const paint = useTemari((s) => s.paint);
  const sew = useTemari((s) => s.sew);
  const placePin = useTemari((s) => s.placePin);
  const setHover = useTemari((s) => s.setHover);
  const setHoverSlot = useTemari((s) => s.setHoverSlot);
  const setWrapCount = useTemari((s) => s.setWrapCount);
  const setWrapProgress = useTemari((s) => s.setWrapProgress);

  const material = useMemo(() => createTemariMaterial(), []);
  const guideGeo = useMemo(() => createGuideGeometry(division), [division]);
  const poles = useMemo(() => polePositions(division), [division]);
  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const target = mode === "kata" && puzzle ? puzzle.target : [];
  const wrap = getWrapBuffer();
  const nodes = useMemo(() => gridNodes(division), [division]);

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
    wrap.reset();
    wrap.strokeWidth = strokePx(useTemari.getState().threadWidth);
    const st = useTemari.getState();
    mari.current.reset(st.threadWidth);
    if (st.wrapSeed === "full") {
      wrap.strokeWidth = strokePx(0.55);
      const hex = PALETTES[st.paletteId].colors[0] ?? "#8f3d32";
      mari.current.fill(wrap, 0, hex);
      feel.resetTurns();
      setWrapCount(wrap.strandCount);
      setWrapProgress(mari.current.progress);
      return;
    }
    feel.resetTurns();
    setWrapCount(0);
  }, [setWrapCount, setWrapProgress, wrap, wrapResetNonce, wrapSeed]);

  useEffect(() => {
    if (wrapUndoNonce === 0) return;
    wrap.undo();
    mari.current.reset(useTemari.getState().threadWidth);
    setWrapCount(wrap.strandCount);
    setWrapProgress(mari.current.progress);
  }, [setWrapCount, setWrapProgress, wrap, wrapUndoNonce]);

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

  useLayoutEffect(() => {
    const mesh = nodesMesh.current;
    if (!mesh) return;
    nodes.forEach((p, i) => {
      dummy.position.set(p[0] * 1.012, p[1] * 1.012, p[2] * 1.012);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = nodes.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, nodes]);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (useTemari.getState().mode === "title") return;
      if (e.button !== 0) return;
      spinning.current = true;
      gesture.aimed = false;
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
        const ang = Math.min(_axis.length(), 0.22);
        if (ang > 1e-6) {
          _axis.normalize();
          const st = useTemari.getState();
          const winding = st.mode === "studio" && st.craft === "wind" && !st.layerDone;
          if (winding) {
            _inv.copy(g.quaternion).invert();
            _local.copy(_axis).applyQuaternion(_inv).normalize();
            mari.current.aim(_local);
            mari.current.copyAxis(_local);
            _axis.copy(_local).applyQuaternion(g.quaternion).normalize();
            _q.setFromAxisAngle(_axis, ang);
            g.quaternion.premultiply(_q);
            omega.current.copy(_axis).multiplyScalar(ang / dt);
            const hex = PALETTES[st.paletteId].colors[st.selectedColor] ?? "#8f3d32";
            mari.current.spin(ang, wrap, st.selectedColor, hex);
          } else {
            _q.setFromAxisAngle(_axis, ang);
            g.quaternion.premultiply(_q);
            omega.current.copy(_axis).multiplyScalar(ang / dt);
          }
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
  }, [camera, gl, size.height, wrap]);

  useEffect(() => {
    const probe = {
      omega: () => omega.current.length(),
      wraps: () => wrap.strandCount,
      pins: () => useTemari.getState().pins.length,
      qy: () => group.current?.quaternion.y ?? 0,
      progress: () => useTemari.getState().wrapProgress,
      nodes: () => gridNodes(useTemari.getState().division).length,
      layerDone: () => useTemari.getState().layerDone,
      finish: () => useTemari.getState().finishLayer(),
      pinAt: (x: number, y: number, z: number) => useTemari.getState().placePin([x, y, z]),
      startAt: (x: number, y: number, z: number) => useTemari.getState().setStartPin([x, y, z]),
      fillKiku: () => useTemari.getState().fillKiku(),
      setCraft: (c: "wind" | "pin" | "stitch") => useTemari.getState().setCraft(c),
      setColor: (i: number) => useTemari.getState().setColor(i),
      spin: (x: number, y: number, z: number) => omega.current.set(x, y, z),
      aim: (x: number, y: number, z: number) => {
        _feed.set(x, y, z);
        mari.current.aim(_feed);
      },
      force: (x: number, y: number, z: number) => {
        mari.current.forceAxis(x, y, z);
      },
      feed: (rad: number) => {
        const st = useTemari.getState();
        const hex = PALETTES[st.paletteId].colors[st.selectedColor] ?? "#8f3d32";
        mari.current.spin(rad, wrap, st.selectedColor, hex);
      },
      dump: () => ({
        progress: useTemari.getState().wrapProgress,
        color: useTemari.getState().selectedColor,
        pin: useTemari.getState().startPin,
        livePts: wrap.live.length,
        yarnPts: wrap.yarn().reduce((n, s) => n + s.points.length, 0),
        ...wrap.snapshot(),
      }),
    };
    (window as Window & { __temari?: typeof probe }).__temari = probe;
  }, [wrap]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    const g = group.current;
    const spd = omega.current.length();
    if (g && !spinning.current && spd > 0.0007) {
      const st = useTemari.getState();
      const winding = st.mode === "studio" && st.craft === "wind" && !st.layerDone;
      if (winding) {
        mari.current.copyAxis(_local);
        _axis.copy(_local).applyQuaternion(g.quaternion).normalize();
      } else {
        _axis.copy(omega.current).normalize();
      }
      _q.setFromAxisAngle(_axis, spd * d);
      g.quaternion.premultiply(_q);
      omega.current.copy(_axis).multiplyScalar(spd * Math.exp(-DAMP * d));
    } else if (!spinning.current && spd <= 0.0007) {
      omega.current.set(0, 0, 0);
    }

    const state = useTemari.getState();
    wrap.strokeWidth = strokePx(state.threadWidth);
    feel.setSpin(state.mode === "studio" && state.craft === "wind" ? spd : 0);
    if (state.mode === "studio" && state.craft === "wind" && !state.layerDone) {
      if (!spinning.current && spd > 0.12 && g) {
        const hex = PALETTES[state.paletteId].colors[state.selectedColor] ?? "#8f3d32";
        mari.current.spin(spd * d, wrap, state.selectedColor, hex);
        feel.wrapTurn(mari.current.wrapCount);
      }
      const next = mari.current.progress;
      if (wrap.strandCount !== state.wrapCount) setWrapCount(wrap.strandCount);
      if (Math.abs(next - state.wrapProgress) > 0.002) setWrapProgress(next);
    } else if (state.layerDone && mari.current.progress < 0.999) {
      const hex = PALETTES[state.paletteId].colors[state.selectedColor] ?? "#8f3d32";
      mari.current.advance(wrap, Math.max(14, 240 * d), state.selectedColor, hex);
      if (wrap.strandCount !== state.wrapCount) setWrapCount(wrap.strandCount);
      const next = mari.current.progress;
      if (Math.abs(next - state.wrapProgress) > 0.01) setWrapProgress(next);
    }

    const tip = needle.current;
    if (tip) tip.visible = false;

    const knotMesh = knots.current;
    if (knotMesh) {
      const list = wrap.joins;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        dummy.position.set(p.x * 1.02, p.y * 1.02, p.z * 1.02);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        knotMesh.setMatrixAt(i, dummy.matrix);
      }
      knotMesh.count = list.length;
      knotMesh.instanceMatrix.needsUpdate = true;
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
      wrapOn: mode === "title",
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
            if (snapGhost.current) snapGhost.current.visible = false;
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
            const snapped = snapToNode(p, division);
            const ghost = snapGhost.current;
            if (ghost) {
              ghost.visible = true;
              ghost.position.set(snapped[0] * 1.04, snapped[1] * 1.04, snapped[2] * 1.04);
            }
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
          if (snapGhost.current) snapGhost.current.visible = false;
        }}
      >
        <sphereGeometry args={[0.992, 96, 64]} />
        <primitive object={material} attach="material" />
      </mesh>

      <mesh geometry={guideGeo} visible={mode !== "studio" || layerDone}>
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

      <instancedMesh
        ref={knots}
        args={[undefined, undefined, 16]}
        frustumCulled={false}
        visible={false}
        count={0}
      >
        <sphereGeometry args={[0.01, 10, 8]} />
        <meshStandardMaterial color="#6a453c" roughness={0.52} metalness={0.08} />
      </instancedMesh>

      <mesh ref={snapGhost} visible={false}>
        <sphereGeometry args={[0.026, 12, 10]} />
        <meshStandardMaterial
          color={threadHex}
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      <instancedMesh
        ref={nodesMesh}
        args={[undefined, undefined, 80]}
        frustumCulled={false}
        visible={mode === "studio" && craft === "pin" && layerDone}
        count={nodes.length}
      >
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color={palette.thread} roughness={0.5} metalness={0.08} transparent opacity={0.55} />
      </instancedMesh>

      <instancedMesh
        ref={beads}
        args={[undefined, undefined, 12]}
        frustumCulled={false}
        visible={mode !== "studio" || layerDone}
      >
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
