import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { arcsToStitches, getWrapBuffer, pinHit, MariWinder, strokePx, toVec3, type WrapBuffer } from "./craft";
import { gridNodes, polePositions, regionIndex, snapToNode } from "./division";
import { createGuideGeometry } from "./guides";
import { PALETTES } from "./palettes";
import {
  generateMotif,
  generateTitleMari,
  hitKikuSlot,
  stitchesForSlot,
  stitchesFromSewn,
  type MotifId,
  type Stitch,
} from "./patterns";
import { PUZZLES } from "./puzzles";
import { createTemariMaterial, createWrapBaker, createWrapCoverMaterial, syncTemariMaterial, syncWrapCoverMaterial } from "./shader";
import { createMotifGeometry, getYarnTexture } from "./stitches";
import { useTemari } from "./store";
import * as feel from "./feel";
import { DEFAULT_KIND, threadMetalness, threadRoughness, type ThreadKind } from "./thread";
import { jiwariMarkColor, jiwariStitches } from "./jiwari";

const pointer = { x: 0, y: 0, down: false, dragged: false };
const ptrs = new Map<number, { x: number; y: number }>();
const tilt = { mx: 0, my: 0 };
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _feed = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);

const DAMP = 0.46;

function ThreadLayer({
  stitches,
  colors,
  opacity = 1,
  kind = DEFAULT_KIND.stitch,
  order = 6,
}: {
  stitches: Stitch[];
  colors: [string, string, string, string];
  opacity?: number;
  kind?: ThreadKind;
  order?: number;
}) {
  const geos = useMemo(() => {
    return [0, 1, 2, 3].map((i) => createMotifGeometry(stitches, i, kind));
  }, [stitches, kind]);
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
          <mesh key={i} geometry={geo} renderOrder={order}>
            <meshStandardMaterial
              map={yarn}
              color={colors[i]}
              roughness={threadRoughness(kind)}
              metalness={threadMetalness(kind)}
              transparent
              opacity={opacity}
              depthWrite={opacity >= 1}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function WrapSurface({ color, width }: { color: string; width: number }) {
  const mat = useMemo(() => createWrapCoverMaterial(), []);
  const baker = useMemo(() => createWrapBaker(), []);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    baker.bake(gl, color);
  }, [baker, color, gl]);
  useLayoutEffect(() => {
    syncWrapCoverMaterial(mat, { color, width, camera: camera.position, bake: baker.texture });
  });
  useEffect(
    () => () => {
      mat.dispose();
      baker.dispose();
    },
    [mat, baker],
  );
  return (
    <mesh frustumCulled={false} renderOrder={3} material={mat} raycast={() => {}}>
      <sphereGeometry args={[1.0, 96, 64]} />
    </mesh>
  );
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
  const wrapColor = useTemari((s) => s.wrapColor);
  const wrapHex = useTemari((s) => s.wrapHex);
  const peeking = useTemari((s) => s.peeking);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const viewNonce = useTemari((s) => s.viewNonce);
  const wrapUndoNonce = useTemari((s) => s.wrapUndoNonce);
  const wrapResetNonce = useTemari((s) => s.wrapResetNonce);
  const layerDone = useTemari((s) => s.layerDone);
  const jiwariOn = useTemari((s) => s.jiwariOn);
  const wrapSeed = useTemari((s) => s.wrapSeed);
  const threadWidth = useTemari((s) => s.threadWidth);
  const paint = useTemari((s) => s.paint);
  const sew = useTemari((s) => s.sew);
  const placePin = useTemari((s) => s.placePin);
  const setHover = useTemari((s) => s.setHover);
  const setHoverSlot = useTemari((s) => s.setHoverSlot);
  const setWrapCount = useTemari((s) => s.setWrapCount);
  const setWrapProgress = useTemari((s) => s.setWrapProgress);
  const setWrapStarted = useTemari((s) => s.setWrapStarted);

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
  const [stitchesOn, setStitchesOn] = useState(mode !== "title");
  useEffect(() => {
    if (mode !== "title") {
      setStitchesOn(true);
      return;
    }
    setStitchesOn(false);
    const id = window.setTimeout(() => setStitchesOn(true), 320);
    return () => window.clearTimeout(id);
  }, [mode, preset, division]);
  const presetStitches = useMemo(
    () =>
      !stitchesOn
        ? []
        : mode === "title"
          ? generateTitleMari()
          : generateMotif(division, preset),
    [division, mode, preset, stitchesOn],
  );
  const sewnStitches = useMemo(
    () => (mode === "studio" ? stitchesFromSewn(division, sewn) : []),
    [division, mode, sewn],
  );
  const pinStitches = useMemo(
    () => (mode === "studio" ? arcsToStitches(pinArcs) : []),
    [mode, pinArcs],
  );
  const markStitches = useMemo(() => {
    if (mode === "title") return stitchesOn ? jiwariStitches("simple", 1) : [];
    if (mode !== "studio" || !layerDone || !jiwariOn) return [];
    return jiwariStitches(division, jiwariMarkColor(wrapColor));
  }, [division, jiwariOn, layerDone, mode, wrapColor, stitchesOn]);
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
      wrap.strokeWidth = strokePx(st.threadWidth);
      mari.current.fill(wrap, st.wrapColor, st.wrapHex);
      feel.resetTurns();
      setWrapCount(wrap.strandCount);
      setWrapProgress(1);
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
    if (!layerDone) return;
    setWrapProgress(1);
  }, [layerDone, setWrapProgress]);

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
      if (e.pointerType === "mouse" && e.button !== 0) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spinning.current = true;
      lastPtr.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.down = true;
      pointer.dragged = false;
      if (ptrs.size === 1) omega.current.set(0, 0, 0);
      if (ptrs.size === 2) {
        let mx = 0;
        let my = 0;
        ptrs.forEach((p) => {
          mx += p.x;
          my += p.y;
        });
        tilt.mx = mx / 2;
        tilt.my = my / 2;
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* already */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(dx, dy) > 7) pointer.dragged = true;
      const now = performance.now();
      const dt = Math.max(0.008, (now - lastPtr.current.t) / 1000);
      lastPtr.current = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId };
      const k = 2.7 / Math.max(size.height, 1);
      const rx = dx * k;
      const ry = dy * k;
      const g = group.current;
      if (!g || (rx === 0 && ry === 0)) return;
      const st = useTemari.getState();
      const winding = false;
      _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

      if (winding) {
        const mag = Math.min(0.28, Math.hypot(rx, ry));
        if (mag < 1e-6) return;
        _axis.copy(_up).multiplyScalar(rx).addScaledVector(_right, ry);
        if (_axis.lengthSq() < 1e-12) return;
        _axis.normalize();
        _inv.copy(g.quaternion).invert();
        _local.copy(_axis).applyQuaternion(_inv).normalize();
        if (!mari.current.hasPlane) {
          mari.current.forceAxis(_local.x, _local.y, _local.z);
        } else {
          mari.current.noteSwipe(_local);
        }
        mari.current.copyAxis(_feed);
        _axis.copy(_feed).applyQuaternion(g.quaternion).normalize();
        const wind = mari.current.commitSpin(mag);
        _q.setFromAxisAngle(_axis, wind.vis);
        g.quaternion.premultiply(_q);
        omega.current.copy(_axis).multiplyScalar(wind.vis / dt);
        const hex = PALETTES[st.paletteId].colors[st.selectedColor] ?? "#8f3d32";
        mari.current.spin(wind.mag, wrap, st.selectedColor, hex);
        if (!st.wrapStarted) setWrapStarted();
        return;
      }

      _axis.copy(_up).multiplyScalar(rx).addScaledVector(_right, ry);
      const ang = Math.min(_axis.length(), 0.22);
      if (ang > 1e-6) {
        _axis.normalize();
        _q.setFromAxisAngle(_axis, ang);
        g.quaternion.premultiply(_q);
        omega.current.copy(_axis).multiplyScalar(ang / dt);
      }
    };
    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        spinning.current = false;
        pointer.down = false;
      } else {
        const rest = ptrs.entries().next().value;
        if (rest) {
          lastPtr.current = { x: rest[1].x, y: rest[1].y, t: performance.now(), id: rest[0] };
        }
      }
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
  }, [camera, gl, setWrapStarted, size.height, wrap]);

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
        const wind = mari.current.commitSpin(rad);
        mari.current.spin(wind.mag, wrap, st.selectedColor, hex);
      },
      noteSwipe: (x: number, y: number, z: number) => {
        _feed.set(x, y, z);
        mari.current.noteSwipe(_feed);
      },
      dump: () => {
        mari.current.copyAxis(_feed);
        return {
          progress: useTemari.getState().wrapProgress,
          color: useTemari.getState().selectedColor,
          pin: useTemari.getState().startPin,
          livePts: wrap.live.length,
          yarnPts: wrap.yarn().reduce((n, s) => n + s.points.length, 0),
          axis: [_feed.x, _feed.y, _feed.z],
          sign: mari.current.windSign,
          ...wrap.snapshot(),
        };
      },
    };
    (window as Window & { __temari?: typeof probe }).__temari = probe;
  }, [wrap]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    const g = group.current;
    const spd = omega.current.length();
    if (g && !spinning.current && spd > 0.0007) {
      const st = useTemari.getState();
      const winding = false;
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
    if (!state.wrapStarted) wrap.strokeWidth = strokePx(state.threadWidth);
    feel.setSpin(0);

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
      wrapN: wrap.polarN,
      wrapS: wrap.polarS,
      wrapOn: mode === "title" || layerDone,
      felt: 0,
      feltColor: palette.core,
      threadWidth,
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
        <sphereGeometry args={[0.96, 96, 64]} />
        <primitive object={material} attach="material" />
      </mesh>

      <mesh
        geometry={guideGeo}
        visible={mode === "kata"}
        scale={1.008}
        renderOrder={8}
      >
        <meshStandardMaterial
          ref={guidesMat}
          color={palette.thread}
          roughness={0.48}
          metalness={0.12}
          polygonOffset
          polygonOffsetFactor={-6}
          polygonOffsetUnits={-6}
        />
      </mesh>

      {mode === "title" || layerDone ? (
        <WrapSurface color={wrapHex} width={threadWidth} />
      ) : null}

      {markStitches.length > 0 ? (
        <ThreadLayer
          stitches={markStitches}
          colors={palette.colors}
          kind={DEFAULT_KIND.mark}
          order={12}
        />
      ) : null}
      {presetStitches.length > 0 ? (
        <ThreadLayer stitches={presetStitches} colors={palette.colors} order={10} />
      ) : null}
      {sewnStitches.length > 0 ? (
        <ThreadLayer stitches={sewnStitches} colors={palette.colors} order={10} />
      ) : null}
      {pinStitches.length > 0 ? (
        <ThreadLayer stitches={pinStitches} colors={palette.colors} order={10} />
      ) : null}
      {ghostStitches.length > 0 ? (
        <ThreadLayer stitches={ghostStitches} colors={palette.colors} opacity={0.42} order={11} />
      ) : null}

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
        visible={mode === "studio" && craft === "pin" && layerDone && jiwariOn}
        count={nodes.length}
      >
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color={palette.thread} roughness={0.5} metalness={0.08} transparent opacity={0.55} />
      </instancedMesh>

      <instancedMesh
        ref={beads}
        args={[undefined, undefined, 12]}
        frustumCulled={false}
        visible={mode === "kata"}
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
        visible={jiwariOn && pins.length > 0}
        count={pins.length}
      >
        <cylinderGeometry args={[0.007, 0.007, 0.068, 8]} />
        <meshStandardMaterial color={palette.thread} roughness={0.4} metalness={0.22} />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
        visible={jiwariOn && pins.length > 0}
        count={pins.length}
      >
        <sphereGeometry args={[0.02, 12, 10]} />
        <meshStandardMaterial color={threadHex} roughness={0.36} metalness={0.12} />
      </instancedMesh>
    </group>
  );
}
