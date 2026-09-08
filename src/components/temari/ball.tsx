import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
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

export function Ball() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const guidesMat = useRef<THREE.MeshStandardMaterial>(null);
  const beadMat = useRef<THREE.MeshStandardMaterial>(null);
  const beads = useRef<THREE.InstancedMesh>(null);

  const mode = useTemari((s) => s.mode);
  const division = useTemari((s) => s.division);
  const paletteId = useTemari((s) => s.paletteId);
  const motif = useTemari((s) => s.motif);
  const fills = useTemari((s) => s.fills);
  const sewn = useTemari((s) => s.sewn);
  const hover = useTemari((s) => s.hover);
  const hoverSlot = useTemari((s) => s.hoverSlot);
  const selectedColor = useTemari((s) => s.selectedColor);
  const peeking = useTemari((s) => s.peeking);
  const puzzleIndex = useTemari((s) => s.puzzleIndex);
  const paint = useTemari((s) => s.paint);
  const sew = useTemari((s) => s.sew);
  const setHover = useTemari((s) => s.setHover);
  const setHoverSlot = useTemari((s) => s.setHoverSlot);

  const material = useMemo(() => createTemariMaterial(), []);
  const guideGeo = useMemo(() => createGuideGeometry(division), [division]);
  const poles = useMemo(() => polePositions(division), [division]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const palette = PALETTES[paletteId];
  const puzzle = PUZZLES[puzzleIndex];
  const target = mode === "kata" && puzzle ? puzzle.target : [];

  const preset: MotifId =
    mode === "title" ? "kiku" : mode === "studio" && motif !== "kiku" && motif !== "none" ? motif : "none";
  const presetStitches = useMemo(() => generateMotif(division, preset), [division, preset]);
  const sewnStitches = useMemo(
    () => (mode === "studio" ? stitchesFromSewn(division, sewn) : []),
    [division, mode, sewn],
  );
  const ghostStitches = useMemo(() => {
    if (mode !== "studio" || !hoverSlot) return [];
    return stitchesForSlot(division, hoverSlot, selectedColor);
  }, [division, hoverSlot, mode, selectedColor]);

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

  useFrame(({ camera }) => {
    syncTemariMaterial(material, {
      division,
      paletteId,
      fills,
      target,
      hover: mode === "kata" ? hover : -1,
      peeking: mode === "kata" && peeking,
      camera: camera.position,
    });
    if (guidesMat.current) guidesMat.current.color.set(palette.thread);
    if (beadMat.current) beadMat.current.color.set(palette.thread);
  });

  const canWork = mode !== "title";

  return (
    <group>
      <mesh
        onPointerDown={(e) => {
          pointer.x = e.clientX;
          pointer.y = e.clientY;
          pointer.down = true;
          pointer.dragged = false;
        }}
        onPointerMove={(e) => {
          if (pointer.down) {
            const dx = e.clientX - pointer.x;
            const dy = e.clientY - pointer.y;
            if (Math.hypot(dx, dy) > 7) pointer.dragged = true;
          }
          if (!canWork || pointer.dragged) {
            if (hover !== -1) setHover(-1);
            if (hoverSlot) setHoverSlot(null);
            return;
          }
          const p = e.point;
          if (mode === "kata") {
            setHover(regionIndex(p.x, p.y, p.z, division));
            return;
          }
          setHoverSlot(hitKikuSlot(p.x, p.y, p.z, division));
        }}
        onPointerUp={(e) => {
          const dragged = pointer.dragged;
          pointer.down = false;
          pointer.dragged = false;
          if (!canWork || dragged || e.button !== 0) return;
          e.stopPropagation();
          const p = e.point;
          if (mode === "kata") {
            paint(regionIndex(p.x, p.y, p.z, division));
            return;
          }
          const slot = hitKikuSlot(p.x, p.y, p.z, division);
          if (slot) sew(slot);
        }}
        onPointerOut={() => {
          pointer.down = false;
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
      {ghostStitches.length > 0 ? (
        <ThreadLayer stitches={ghostStitches} colors={palette.colors} opacity={0.42} />
      ) : null}

      <instancedMesh ref={beads} args={[undefined, undefined, 12]} frustumCulled={false}>
        <sphereGeometry args={[0.032, 16, 12]} />
        <meshStandardMaterial
          ref={beadMat}
          color={palette.thread}
          roughness={0.42}
          metalness={0.16}
        />
      </instancedMesh>
    </group>
  );
}
