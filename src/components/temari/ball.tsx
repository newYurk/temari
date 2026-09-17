import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { arcsToStitches, getWrapBuffer, pinHit, MariWinder, strokePx, toVec3, type WrapBuffer } from "./craft";
import { gridNodes, polePositions, regionIndex } from "./division";
import { createGuideGeometry } from "./guides";
import { PALETTES, THREAD_COLORS, threadHex } from "./palettes";
import {
  generateMotif,
  generateTitleMari,
  hitKikuSlot,
  kikuMarksReady,
  kikuSpec,
  kikuWorkingPins,
  snapToKikuMark,
  stitchFocus,
  stitchesForSlot,
  stitchesFromSewn,
  type MotifId,
  type Stitch,
} from "./patterns";
import { PUZZLES } from "./puzzles";
import { createTemariMaterial, createWrapBaker, createWrapCoverMaterial, syncTemariMaterial, syncWrapCoverMaterial } from "./shader";
import { createMotifGeometry, createMotifGeometryParts, getPerleBump, getPerleTexture, getYarnTexture } from "./stitches";
import { pinPosition, useTemari } from "./store";
import * as feel from "./feel";
import { DEFAULT_KIND, threadMetalness, threadRoughness, type ThreadKind } from "./thread";
import { C8_EXTRA, jiwariMarkColor, jiwariStitches, jiwariVisibleStitches, vRulerLegs } from "./jiwari";

const pointer = { x: 0, y: 0, down: false, dragged: false, multi: false };
/** Recent turns of the ball, for a throw that follows the finger, not the last event. */
const swings: { t: number; ax: number; ay: number; az: number; ang: number }[] = [];
const SWING_WINDOW_MS = 90;
const ptrs = new Map<number, { x: number; y: number }>();
const pinch = { mx: 0, my: 0, span: 0, held: false };
const _origin = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _feed = new THREE.Vector3();
const _qb = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Vector3();
const _hit = new THREE.Vector3();

/**
 * Taps are answered by the wrapped surface (radius 1), not by the smaller core
 * mesh: near the silhouette a tessellated sphere loses several pixels, and the
 * kiku ring targets sit exactly there.
 */
function sphereRaycast(mesh: THREE.Mesh, radius: number, raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
  _origin.setFromMatrixPosition(mesh.matrixWorld);
  _ray.copy(_origin).sub(raycaster.ray.origin);
  const along = _ray.dot(raycaster.ray.direction);
  const d2 = _ray.lengthSq() - along * along, r2 = radius * radius;
  if (d2 > r2) return;
  const half = Math.sqrt(r2 - d2);
  const t = along - half >= 0 ? along - half : along + half;
  if (t < 0) return;
  _hit.copy(raycaster.ray.direction).multiplyScalar(t).add(raycaster.ray.origin);
  const distance = _hit.distanceTo(raycaster.ray.origin);
  if (distance < raycaster.near || distance > raycaster.far) return;
  out.push({ distance, point: _hit.clone(), object: mesh });
}

const DAMP = 0.46;

function ThreadLayer({
  stitches,
  colors,
  opacity = 1,
  kind = DEFAULT_KIND.stitch,
  order = 6,
}: {
  stitches: Stitch[];
  colors: readonly string[];
  opacity?: number;
  kind?: ThreadKind;
  order?: number;
}) {
  // Opaque thread is drawn as the pieces it is made of — merging the whole
  // flower after every stitch was the long frame. A ghost stays one geometry:
  // overlapping pieces would blend with themselves.
  const geos = useMemo(() => {
    return colors.map((_, i) =>
      opacity >= 1
        ? createMotifGeometryParts(stitches, i, kind)
        : [createMotifGeometry(stitches, i, kind)].filter((g): g is THREE.BufferGeometry => !!g),
    );
  }, [stitches, kind, colors, opacity]);
  // A pearl cord shows its two plies; flat metallic jiwari keeps the plain yarn.
  const cord = kind !== "metallic";
  const yarn = useMemo(() => (cord ? getPerleTexture() : getYarnTexture()), [cord]);
  const bump = useMemo(() => (cord ? getPerleBump() : null), [cord]);

  useEffect(() => {
    return () => {
      // Kept tubes belong to the cache and outlive this layer.
      for (const list of geos) for (const geo of list) if (!geo.userData.cached) geo.dispose();
    };
  }, [geos]);

  return (
    <group>
      {geos.flatMap((list, i) =>
        list.map((geo, j) => (
          <mesh key={`${i}-${j}`} geometry={geo} renderOrder={order}>
            <meshStandardMaterial
              map={yarn}
              bumpMap={bump ?? undefined}
              bumpScale={bump ? 0.6 : undefined}
              color={colors[i]}
              roughness={threadRoughness(kind)}
              metalness={threadMetalness(kind)}
              transparent={opacity < 1}
              opacity={opacity}
              depthWrite={opacity >= 1}
              side={THREE.FrontSide}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        )),
      )}
    </group>
  );
}

function PaperStrip() {
  const phase = useTemari((s) => s.jiwariPhase);
  const laid = useTemari((s) => s.jiwariLaid);
  const on = phase === "strip" || phase === "poles" || phase === "equator" || phase === "combine";
  const equator = phase === "equator";
  const ticks = useMemo(() => {
    if (phase === "strip") return [[0, 0, 1.02] as const];
    if (phase === "poles") return [[0, 1.02, 0] as const, [0, -1.02, 0] as const];
    if (phase === "equator") {
      return Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 8;
        return [Math.sin(a) * 1.02, 0, Math.cos(a) * 1.02] as const;
      });
    }
    return [];
  }, [phase]);
  const extraQ = useMemo(() => {
    if (phase !== "combine") return null;
    const n = C8_EXTRA[Math.max(0, Math.min(3, laid - 1))];
    if (!n) return null;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(n[0], n[1], n[2]).normalize(),
    );
  }, [laid, phase]);
  if (!on) return null;
  if (phase === "combine" && extraQ) {
    return (
      <mesh quaternion={extraQ} renderOrder={14} raycast={() => {}}>
        <torusGeometry args={[1.02, 0.011, 5, 96]} />
        <meshStandardMaterial color="#f3eee4" roughness={0.94} metalness={0} />
      </mesh>
    );
  }
  return (
    <group>
      <mesh
        rotation={equator ? [Math.PI / 2, 0, 0] : [0, Math.PI / 2, 0]}
        renderOrder={14}
        raycast={() => {}}
      >
        <torusGeometry args={[1.02, 0.011, 5, 96]} />
        <meshStandardMaterial color="#f3eee4" roughness={0.94} metalness={0} />
      </mesh>
      {ticks.map((p, i) => (
        <mesh key={i} position={p} renderOrder={15} raycast={() => {}}>
          <boxGeometry args={[0.007, 0.03, 0.01]} />
          <meshStandardMaterial
            color={phase === "equator" && i % 4 === 0 ? "#8f3d32" : "#8a847c"}
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function VLeg({ from, to }: { from: readonly [number, number, number]; to: readonly [number, number, number] }) {
  const a = new THREE.Vector3(from[0], from[1], from[2]).multiplyScalar(1.035);
  const b = new THREE.Vector3(to[0], to[1], to[2]).multiplyScalar(1.035);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return (
    <mesh position={mid} quaternion={q} renderOrder={16} raycast={() => {}}>
      <cylinderGeometry args={[0.007, 0.007, len, 6]} />
      <meshStandardMaterial color="#f3eee4" roughness={0.92} metalness={0} />
    </mesh>
  );
}

function VRuler() {
  const phase = useTemari((s) => s.jiwariPhase);
  const legs = vRulerLegs(phase);
  if (!legs) return null;
  return (
    <group>
      <VLeg from={legs.origin} to={legs.a} />
      <VLeg from={legs.origin} to={legs.b} />
    </group>
  );
}

function JiwariGuide() {
  const on = useTemari((s) => s.jiwariOn);
  const division = useTemari((s) => s.division);
  const phase = useTemari((s) => s.jiwariPhase);
  const laid = useTemari((s) => s.jiwariLaid);
  const advance = useTemari((s) => s.advanceJiwari);
  useEffect(() => {
    if (!on) return;
    if (phase === "off" || phase === "done") return;
    if (division !== "simple" && !(division === "c8" && phase === "combine") && division !== "c10") return;
    if (division === "c10" && phase !== "vruler" && phase !== "south" && phase !== "meridians") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce
      ? 0
      : phase === "meridians" || phase === "combine"
        ? 320
        : phase === "vruler" || phase === "south"
          ? 700
          : 1100;
    const id = window.setTimeout(advance, ms);
    return () => window.clearTimeout(id);
  }, [advance, division, laid, on, phase]);
  return null;
}

function KagariGuide() {
  const playing = useTemari((s) => s.kagariPlaying);
  const laid = useTemari((s) => s.kagariLaid);
  const advance = useTemari((s) => s.advanceKagari);
  useEffect(() => {
    if (!playing) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(advance, reduce ? 0 : 110);
    return () => window.clearTimeout(id);
  }, [advance, laid, playing]);
  return null;
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
  const rims = useRef<THREE.InstancedMesh>(null);
  const targets = useRef<THREE.InstancedMesh>(null);
  const targetRims = useRef<THREE.InstancedMesh>(null);
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
  const jiwariPhase = useTemari((s) => s.jiwariPhase);
  const jiwariLaid = useTemari((s) => s.jiwariLaid);
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
  const setFacingPole = useTemari((s) => s.setFacingPole);
  const viewPole = useTemari((s) => s.viewPole);
  const facingPole = useTemari((s) => s.facingPole);
  const motif = useTemari((s) => s.motif);
  const setPoseDirty = useTemari((s) => s.setPoseDirty);

  const material = useMemo(() => createTemariMaterial(), []);
  const guideGeo = useMemo(() => createGuideGeometry(division), [division]);
  const poles = useMemo(() => polePositions(division), [division]);
  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const target = mode === "kata" && puzzle ? puzzle.target : [];
  const wrap = getWrapBuffer();
  const nodes = useMemo(() => gridNodes(division), [division]);
  const markNodes = useMemo(() => {
    if (mode !== "studio" || craft !== "pin" || motif !== "kiku") return nodes;
    return kikuWorkingPins(division, facingPole).map((pin) => pin.p);
  }, [craft, division, facingPole, mode, motif, nodes]);
  const marksReady = motif !== "kiku" || kikuMarksReady(pins, division, facingPole);
  // Places still waiting for a pin of this flower, drawn large and in a fixed colour.
  const kikuTargets = useMemo(() => {
    if (mode !== "studio" || craft !== "pin" || motif !== "kiku" || !layerDone || !jiwariOn || marksReady) return [];
    return kikuWorkingPins(division, facingPole)
      .filter((m) => !pins.some((pin) => pin.p[0] * m.p[0] + pin.p[1] * m.p[1] + pin.p[2] * m.p[2] > 0.995))
      .map((m) => m.p);
  }, [craft, division, facingPole, jiwariOn, layerDone, marksReady, mode, motif, pins]);
  const outerTheta = kikuSpec(division).outer;

  const preset: MotifId =
    mode === "title" ? "kiku" : "none";
  const kagariPlan = useTemari((s) => s.kagariPlan);
  const kagariLaid = useTemari((s) => s.kagariLaid);
  const kagariKept = useTemari((s) => s.kagariKept);
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
  const playingStitches = useMemo(
    () =>
      mode === "studio"
        ? [...kagariKept, ...kagariPlan.slice(0, kagariLaid)]
        : [],
    [kagariKept, kagariLaid, kagariPlan, mode],
  );
  const pinStitches = useMemo(
    () => (mode === "studio" ? arcsToStitches(pinArcs) : []),
    [mode, pinArcs],
  );
  const markStitches = useMemo(() => {
    if (mode === "title") return stitchesOn ? jiwariStitches("simple", 1) : [];
    if (mode !== "studio" || !layerDone || !jiwariOn) return [];
    return jiwariVisibleStitches(
      division,
      jiwariMarkColor(wrapColor),
      jiwariPhase,
      jiwariLaid,
    );
  }, [division, jiwariLaid, jiwariOn, jiwariPhase, layerDone, mode, wrapColor, stitchesOn]);
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
      dummy.position.set(p[0] * 1.006, p[1] * 1.006, p[2] * 1.006);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = poles.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, poles]);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g || mode !== "title") return;
    // A finished ball is not looked at from its equator: the title tips the
    // north flower towards the eye, the way it lies in a hand.
    _q.setFromAxisAngle(_axis.set(1, 0, 0), 0.78);
    _q.multiply(_qb.setFromAxisAngle(_feed.set(0, 1, 0), 0.4));
    g.quaternion.copy(_q);
  }, [mode]);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g || viewNonce === 0) return;
    const pole = poles[viewPole] ?? poles[0];
    if (!pole) return;
    omega.current.set(0, 0, 0);
    _axis.set(pole[0], pole[1], pole[2]).normalize();
    // The working pole turns towards the eye, the way a ball is held while sewing:
    // the whole flower is in front, not foreshortened against the silhouette.
    // A hand's worth of tilt is kept so the ball still reads as a ball, not a disc.
    _feed.copy(camera.position).normalize();
    _feed.y += 0.34;
    _feed.normalize();
    _q.setFromUnitVectors(_axis, _feed);
    g.quaternion.copy(_q);
    g.position.set(0, 0, 0);
  }, [camera, poles, viewNonce, viewPole]);

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
      dummy.position.copy(n).multiplyScalar(1.014);
      dummy.quaternion.setFromUnitVectors(Y_UP, n);
      dummy.scale.setScalar(i === activePin ? 1.28 : 1);
      dummy.updateMatrix();
      shaft.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(n).multiplyScalar(1.04);
      dummy.scale.setScalar(i === activePin ? 1.28 : 1);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
      rims.current?.setMatrixAt(i, dummy.matrix);
    });
    shaft.count = pins.length;
    head.count = pins.length;
    shaft.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (rims.current) {
      rims.current.count = pins.length;
      rims.current.instanceMatrix.needsUpdate = true;
    }
  }, [activePin, dummy, pins]);

  useLayoutEffect(() => {
    const mesh = nodesMesh.current;
    if (!mesh) return;
    markNodes.forEach((p, i) => {
      dummy.position.set(p[0] * 1.006, p[1] * 1.006, p[2] * 1.006);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = markNodes.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, markNodes]);

  useLayoutEffect(() => {
    for (const mesh of [targets.current, targetRims.current]) {
      if (!mesh) continue;
      kikuTargets.forEach((p, i) => {
        dummy.position.set(p[0] * 1.012, p[1] * 1.012, p[2] * 1.012);
        dummy.quaternion.identity();
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = kikuTargets.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [dummy, kikuTargets]);

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
      if (ptrs.size === 1) pointer.multi = false;
      // Every new finger stops the ball: a second finger must not inherit a spin.
      omega.current.set(0, 0, 0);
      swings.length = 0;
      if (ptrs.size >= 2) {
        let mx = 0;
        let my = 0;
        ptrs.forEach((p) => {
          mx += p.x;
          my += p.y;
        });
        const n = ptrs.size;
        const pts = [...ptrs.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        pinch.mx = mx / n;
        pinch.my = my / n;
        pinch.span = Math.hypot(a.x - b.x, a.y - b.y);
        pinch.held = true;
        pointer.dragged = true;
        pointer.multi = true;
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
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 7) {
        pointer.dragged = true;
        setPoseDirty();
      }
      const now = performance.now();
      const dt = Math.max(0.008, (now - lastPtr.current.t) / 1000);
      lastPtr.current = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId };
      const g = group.current;
      if (!g) return;

      if (ptrs.size >= 2) {
        const pts = [...ptrs.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const span = Math.hypot(a.x - b.x, a.y - b.y);
        const dmx = mx - pinch.mx;
        const dmy = my - pinch.my;
        const cam = camera as THREE.PerspectiveCamera;
        const reach = Math.max(camera.position.length(), 1.16);
        const worldPerPx =
          (2 * reach * Math.tan(THREE.MathUtils.degToRad(cam.fov || 32) * 0.5)) /
          Math.max(size.height, 1);
        _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        g.position.addScaledVector(_right, dmx * worldPerPx);
        g.position.addScaledVector(_up, -dmy * worldPerPx);
        if (g.position.length() > 1.08) g.position.setLength(1.08);
        pinch.mx = mx;
        pinch.my = my;
        pinch.span = span;
        pinch.held = true;
        swings.length = 0;
        return;
      }
      // Below the drag threshold a shaking finger must not turn the ball at all.
      if (!pointer.dragged) return;

      const k = 2.7 / Math.max(size.height, 1);
      const rx = dx * k;
      const ry = dy * k;
      if (rx === 0 && ry === 0) return;
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
        const hex = threadHex(st.selectedColor);
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
        swings.push({ t: now, ax: _axis.x, ay: _axis.y, az: _axis.z, ang });
        while (swings.length > 1 && now - swings[0]!.t > SWING_WINDOW_MS) swings.shift();
      }
    };
    /** Mean turn over the last SWING_WINDOW_MS; zero after a pause, a pinch or a still finger. */
    const throwSpin = (out: THREE.Vector3) => {
      out.set(0, 0, 0);
      const now = performance.now();
      const last = swings.at(-1);
      if (!pointer.dragged || pointer.multi || !last || now - last.t > 70) return out;
      if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return out;
      const first = swings[0]!;
      const span = Math.max(0.03, (last.t - first.t) / 1000);
      for (const sw of swings) out.x += sw.ax * sw.ang, out.y += sw.ay * sw.ang, out.z += sw.az * sw.ang;
      out.divideScalar(span);
      if (out.length() < 1.2) out.set(0, 0, 0);
      return out;
    };
    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch.held = false;
      if (ptrs.size === 0) {
        throwSpin(omega.current);
        swings.length = 0;
        spinning.current = false;
        pointer.down = false;
      } else {
        omega.current.set(0, 0, 0);
        swings.length = 0;
        const rest = ptrs.entries().next().value;
        if (rest) {
          lastPtr.current = { x: rest[1].x, y: rest[1].y, t: performance.now(), id: rest[0] };
        }
      }
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
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
  }, [camera, gl, setPoseDirty, setWrapStarted, size.height, wrap]);

  useEffect(() => {
    const probe = {
      omega: () => omega.current.length(),
      wraps: () => wrap.strandCount,
      pins: () => useTemari.getState().pins.length,
      pinDump: () =>
        useTemari.getState().pins.map((pin) => ({ id: pin.id, p: pin.p })),
      pinState: () => {
        const s = useTemari.getState();
        return { count: s.pins.length, arcs: s.pinArcs.length, active: s.activePin,
          note: s.pinNote, jiwariOn: s.jiwariOn, craft: s.craft, sewn: s.sewn.length };
      },
      projectPin: (index: number) => {
        const pin = useTemari.getState().pins[index];
        const g = group.current;
        if (!pin || !g) return null;
        const point = new THREE.Vector3(...pin.p).multiplyScalar(1.04);
        g.localToWorld(point);
        point.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + (point.x + 1) * rect.width / 2,
          y: rect.top + (1 - point.y) * rect.height / 2 };
      },
      face: (x: number, y: number, z: number) => {
        const g = group.current;
        if (!g) return;
        _axis.set(x, y, z).normalize();
        _feed.copy(camera.position).normalize();
        _q.setFromUnitVectors(_axis, _feed);
        g.quaternion.copy(_q);
        omega.current.set(0, 0, 0);
      },
      dolly: (dist: number) => {
        const d = Math.max(1.16, dist);
        camera.position.normalize().multiplyScalar(d);
        camera.updateProjectionMatrix();
      },
      qy: () => group.current?.quaternion.y ?? 0,
      pan: () => group.current?.position.length() ?? 0,
      progress: () => useTemari.getState().wrapProgress,
      nodes: () => gridNodes(useTemari.getState().division).length,
      layerDone: () => useTemari.getState().layerDone,
      finish: () => useTemari.getState().finishLayer(),
      enterStudio: () => useTemari.getState().enterStudio(),
      showExample: () => useTemari.getState().showExample(),
      setFacingPole: (i: number) => useTemari.getState().setFacingPole(i),
      pinAt: (x: number, y: number, z: number) => useTemari.getState().placePin([x, y, z]),
      craft: () => useTemari.getState().craft,
      pinKiku: () => {
        const s = useTemari.getState();
        const pins = kikuWorkingPins(s.division, s.facingPole);
        useTemari.setState({
          motif: "kiku",
          craft: "stitch",
          pins,
          pinArcs: [],
          activePin: null,
          pinNote: null,
        });
      },
      startAt: (x: number, y: number, z: number) => useTemari.getState().setStartPin([x, y, z]),
      fillKiku: () => useTemari.getState().fillKiku(),
      packKiku: () => {
        const s = useTemari.getState();
        const plan = generateMotif("simple", "kiku", "out", "even", 0, s.selectedColor, 6, "all");
        useTemari.setState({
          division: "simple",
          facingPole: 0,
          motif: "kiku",
          craft: "stitch",
          kagariPlan: plan,
          kagariLaid: plan.length,
          kagariPlaying: false,
          kikuLayers: 6,
          kagariSet: 1,
          kagariFocus: null,
        });
      },
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
        const st = useTemari.getState();
        return {
          progress: st.wrapProgress,
          color: st.selectedColor,
          pin: st.startPin,
          livePts: wrap.live.length,
          yarnPts: wrap.yarn().reduce((n, s) => n + s.points.length, 0),
          axis: [_feed.x, _feed.y, _feed.z],
          sign: mari.current.windSign,
          kagari: {
            laid: st.kagariLaid,
            playing: st.kagariPlaying,
            n: st.kagariPlan.length,
            motif: st.motif,
            dir: st.kagariDir,
            kept: st.kagariKept.length,
            pole: st.facingPole,
            set: st.kagariSet,
            layers: st.kikuLayers,
          },
          ...wrap.snapshot(),
        };
      },
      kagari: () => {
        const st = useTemari.getState();
        return {
          laid: st.kagariLaid,
          playing: st.kagariPlaying,
          n: st.kagariPlan.length,
          motif: st.motif,
          dir: st.kagariDir,
          kept: st.kagariKept.length,
          pole: st.facingPole,
          set: st.kagariSet,
          layers: st.kikuLayers,
          // The thread in hand and the pair of working threads, for checks.
          hand: st.selectedColor,
          pair: st.kagariColors,
          planColor: st.kagariPlan[0]?.color ?? null,
          keptColors: [...new Set(st.kagariKept.map((stitch) => stitch.color))].sort(),
        };
      },
      freezeKagari: (n?: number) => {
        const st = useTemari.getState();
        const laid =
          typeof n === "number"
            ? Math.max(0, Math.min(st.kagariPlan.length, Math.round(n)))
            : st.kagariLaid;
        const newest = st.kagariPlan[Math.max(0, laid - 1)];
        useTemari.setState({
          kagariLaid: laid,
          kagariPlaying: false,
          kagariFocus: stitchFocus(newest, st.division, st.motif),
        });
      },
    };
    (window as Window & { __temari?: typeof probe }).__temari = probe;
  }, [wrap]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    const g = group.current;
    if (g && mode === "studio" && poles.length > 0) {
      _feed.copy(camera.position).normalize();
      let best = 0;
      let bestD = -2;
      for (let i = 0; i < poles.length; i++) {
        const p = poles[i];
        if (!p) continue;
        _local.set(p[0], p[1], p[2]).applyQuaternion(g.quaternion);
        const along = _local.dot(_feed);
        if (along > bestD) {
          bestD = along;
          best = i;
        }
      }
      const st = useTemari.getState();
      const pinning = st.motif === "kiku" && st.craft === "pin" && st.pins.length > 0;
      if (!pinning) setFacingPole(best);
    }
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
    if (g && !pinch.held && g.position.lengthSq() > 1e-8) {
      g.position.lerp(_origin, 1 - Math.exp(-10 * d));
      if (g.position.lengthSq() < 1e-7) g.position.set(0, 0, 0);
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
  const stitchHex = threadHex(selectedColor);

  const localFromEvent = (e: THREE.Intersection) => {
    _local.copy(e.point);
    group.current?.worldToLocal(_local);
    return toVec3(_local);
  };

  const onPinPointerUp = (e: ThreeEvent<PointerEvent>) => {
    // Use the hit instance, not the sphere point behind an elevated pin head.
    e.stopPropagation();
    const dragged = pointer.dragged || pointer.multi;
    pointer.down = false;
    pointer.dragged = false;
    if (mode !== "studio" || dragged || e.button !== 0 || e.instanceId == null) return;
    const pin = pins[e.instanceId];
    if (!pin) return;
    if (snapGhost.current) snapGhost.current.visible = false;
    if (craft === "pin") placePin(pin.p);
    else if (craft === "stitch" && motif === "none") useTemari.getState().sketchToPin(pin.p);
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
          if (craft === "stitch") {
            setHoverSlot(null);
            if (snapGhost.current) snapGhost.current.visible = false;
          }
          else if (craft === "pin") {
            const hit = pinHit(p, pins);
            setHoverSlot(null);
            if (hit < 0 && hover !== -1) setHover(-1);
            const ghost = snapGhost.current;
            const snapped =
              motif === "kiku"
                ? snapToKikuMark(p, division, facingPole)
                : { id: "", p: pinPosition(p, division, jiwariOn)! };
            if (ghost) {
              if (!snapped || hit >= 0) {
                ghost.visible = false;
              } else {
                ghost.visible = true;
                ghost.position.set(snapped.p[0] * 1.04, snapped.p[1] * 1.04, snapped.p[2] * 1.04);
              }
            }
          }
        }}
        onPointerUp={(e) => {
          // A pinch ends with two separate releases; neither is a tap.
          const dragged = pointer.dragged || pointer.multi;
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
            if (snapGhost.current) snapGhost.current.visible = false;
            placePin(p);
            return;
          }
          if (craft !== "stitch") return;
          if (motif === "none") {
            useTemari.getState().sketchToPin(p);
            return;
          }
          // A motif is sewn from the dock, never by tapping the ball.
        }}
        onPointerOut={() => {
          if (hover !== -1) setHover(-1);
          if (hoverSlot) setHoverSlot(null);
          if (snapGhost.current) snapGhost.current.visible = false;
        }}
        raycast={function (this: THREE.Mesh, raycaster, out) {
          sphereRaycast(this, mode === "title" || layerDone ? 1 : 0.96, raycaster, out);
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

      {mode === "studio" && layerDone && jiwariOn ? <PaperStrip /> : null}
      {mode === "studio" && layerDone && jiwariOn ? <VRuler /> : null}
      {mode === "studio" && layerDone ? <JiwariGuide /> : null}
      {mode === "studio" && layerDone ? <KagariGuide /> : null}

      {markStitches.length > 0 ? (
        <ThreadLayer
          stitches={markStitches}
          colors={THREAD_COLORS}
          kind={DEFAULT_KIND.mark}
          order={12}
        />
      ) : null}
      {presetStitches.length > 0 ? (
        <ThreadLayer stitches={presetStitches} colors={THREAD_COLORS} order={14} />
      ) : null}
      {playingStitches.length > 0 ? (
        <ThreadLayer stitches={playingStitches} colors={THREAD_COLORS} order={14} />
      ) : null}
      {sewnStitches.length > 0 ? (
        <ThreadLayer stitches={sewnStitches} colors={THREAD_COLORS} order={14} />
      ) : null}
      {pinStitches.length > 0 ? (
        <ThreadLayer stitches={pinStitches} colors={THREAD_COLORS} order={10} />
      ) : null}
      {ghostStitches.length > 0 ? (
        <ThreadLayer stitches={ghostStitches} colors={THREAD_COLORS} opacity={0.42} order={11} />
      ) : null}

      {mode === "studio" && craft === "pin" && motif === "kiku" && !marksReady ? (
        <group
          position={[0, (facingPole === 1 ? -1 : 1) * Math.cos(outerTheta), 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          {/* The ring the eight outer marks stand on: a dark backing under a light line. */}
          <mesh renderOrder={12} raycast={() => {}}>
            <torusGeometry args={[Math.sin(outerTheta), 0.0075, 6, 96]} />
            <meshBasicMaterial color="#1c1714" toneMapped={false} />
          </mesh>
          <mesh renderOrder={13} raycast={() => {}} scale={1.0008}>
            <torusGeometry args={[Math.sin(outerTheta), 0.0042, 6, 96]} />
            <meshBasicMaterial color="#fbf6ec" toneMapped={false} />
          </mesh>
        </group>
      ) : null}

      {/* Where a pin of this flower still has to go. Fixed colours: they must read on any wrap. */}
      <instancedMesh
        ref={targetRims}
        args={[undefined, undefined, 16]}
        frustumCulled={false}
        visible={kikuTargets.length > 0}
        count={kikuTargets.length}
        renderOrder={14}
        raycast={() => {}}
      >
        <sphereGeometry args={[0.038, 20, 14]} />
        <meshBasicMaterial color="#1c1714" side={THREE.BackSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={targets}
        args={[undefined, undefined, 16]}
        frustumCulled={false}
        visible={kikuTargets.length > 0}
        count={kikuTargets.length}
        renderOrder={15}
        raycast={() => {}}
      >
        <sphereGeometry args={[0.03, 20, 14]} />
        <meshBasicMaterial color="#fbf6ec" toneMapped={false} />
      </instancedMesh>

      <mesh ref={needle} visible={false}>
        <sphereGeometry args={[0.018, 12, 10]} />
        <meshStandardMaterial color={stitchHex} roughness={0.38} metalness={0.14} />
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

      <mesh ref={snapGhost} visible={false} renderOrder={16}>
        <sphereGeometry args={[0.026, 12, 10]} />
        <meshStandardMaterial
          color="#c98a2e"
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
        visible={mode === "studio" && craft === "pin" && layerDone && jiwariOn && motif !== "kiku"}
        count={markNodes.length}
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
        args={[undefined, undefined, 80]}
        frustumCulled={false}
        visible={mode === "studio" && pins.length > 0}
        count={pins.length}
        renderOrder={20}
        onPointerUp={onPinPointerUp}
      >
        <cylinderGeometry args={[0.0032, 0.0032, 0.048, 10]} />
        <meshStandardMaterial color="#3a3834" roughness={0.32} metalness={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, 80]}
        frustumCulled={false}
        visible={mode === "studio" && pins.length > 0}
        count={pins.length}
        renderOrder={21}
        onPointerUp={onPinPointerUp}
      >
        <sphereGeometry args={[0.03, 24, 16]} />
        <meshStandardMaterial color="#f4efe6" roughness={0.16} metalness={0.12} />
      </instancedMesh>
      {/* A dark rim keeps the head visible on a light wrap. */}
      <instancedMesh
        ref={rims}
        args={[undefined, undefined, 80]}
        frustumCulled={false}
        visible={mode === "studio" && pins.length > 0}
        count={pins.length}
        renderOrder={20}
        raycast={() => {}}
      >
        <sphereGeometry args={[0.038, 20, 14]} />
        <meshBasicMaterial color="#181411" side={THREE.BackSide} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
