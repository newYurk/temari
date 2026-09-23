import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, type BufferGeometry } from 'three';
import { createMotifGeometry, createMotifGeometryParts, ribbonFromPoints } from './stitches';
import { simpleStitches } from './jiwari';
import type { Stitch } from './patterns';
import type { ThreadKind } from './thread';

const R = 240 / (2 * Math.PI);
const assigned: readonly [ThreadKind, number][] = [['metallic', .2], ['pearl8', .5], ['pearl5', .71]];
const read = (geometry: BufferGeometry, index: number) => new Vector3().fromBufferAttribute(geometry.getAttribute('position'), index);
const near = (actual: number, expected: number, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance} mm`);

function checkRibbon(geometry: BufferGeometry, expectedMm: number, radiusMm = R) {
  const positions = geometry.getAttribute('position');
  assert.ok(positions.count >= 4 && positions.count % 2 === 0);
  // Normalizing the existing tangent offsets back onto their sphere slightly
  // shortens a transverse chord. Bound that retained projection effect plus
  // Float32 conversion; no factor-of-two or artistic loop multiplier fits here.
  const toleranceMm = expectedMm ** 3 / (8 * radiusMm ** 2) + 1e-5;
  for (let i = 0; i < positions.count; i += 2) {
    const left = read(geometry, i), right = read(geometry, i + 1);
    near(left.distanceTo(right) * radiusMm, expectedMm, toleranceMm);
    near(left.length() * radiusMm, right.length() * radiusMm);
  }
}

const arc = (via = false): Stitch => ({ kind: 'arc', color: 0,
  a: [1, 0, 0], b: [Math.cos(.6), Math.sin(.6), 0],
  ...(via ? { via: [[Math.cos(.2), Math.sin(.2), 0], [Math.cos(.4), Math.sin(.4), 0]] as [number, number, number][] } : {}) });

describe('studio ribbons use a full-width contract', () => {
  it('measures the assigned widths on finished closed-loop meshes in parts, pile, and merged render paths', () => {
    const loops = simpleStitches(2, 0);
    for (const [kind, widthMm] of assigned) {
      for (const pile of [false, true]) {
        const parts = createMotifGeometryParts(loops, 0, kind, { pile });
        assert.equal(parts.length, 2);
        for (const part of parts) {
          checkRibbon(part, widthMm);
          const positions = part.getAttribute('position');
          assert.equal(part.getIndex()!.count, positions.count / 2 * 6, 'closed loop includes the seam strip');
          part.dispose();
        }
      }
      const merged = createMotifGeometry(loops, 0, kind)!;
      checkRibbon(merged, widthMm);
      merged.dispose();
    }
  });

  it('keeps open metallic strokes at 0.2 mm, including via points and the merged/ghost route', () => {
    for (const via of [false, true]) for (const pile of [false, true]) {
      const stitches = [arc(via)];
      const parts = createMotifGeometryParts(stitches, 0, 'metallic', { pile });
      assert.equal(parts.length, 1);
      checkRibbon(parts[0], .2);
      const positions = parts[0].getAttribute('position');
      assert.equal(parts[0].getIndex()!.count, (positions.count / 2 - 1) * 6, 'open stroke must not grow a closing seam');
      const merged = createMotifGeometry(stitches, 0, 'metallic')!;
      checkRibbon(merged, .2);
      assert.deepEqual(Array.from(merged.getAttribute('position').array), Array.from(positions.array));
      parts[0].dispose(); merged.dispose();
    }
  });

  it('preserves millimetres when open and closed ribbons are normalized by different sphere radii', () => {
    const angles = [0, .4, .8, 1.2];
    for (const circumferenceMm of [180, 240, 320]) for (const [, widthMm] of assigned) {
      const radiusMm = circumferenceMm / (2 * Math.PI);
      const points = angles.map(a => new Vector3(Math.cos(a), Math.sin(a), 0));
      for (const closed of [false, true]) {
        const mesh = ribbonFromPoints(points, widthMm / radiusMm, closed);
        checkRibbon(mesh, widthMm, radiusMm);
        assert.equal(mesh.getIndex()!.count, (closed ? points.length : points.length - 1) * 6);
        mesh.dispose();
      }
    }
  });

  it('leaves the existing pearl cord width and flattened height unchanged', () => {
    for (const [kind, widthMm] of assigned.filter(([kind]) => kind !== 'metallic')) {
      for (const pile of [false, true]) {
        const parts = createMotifGeometryParts([arc()], 0, kind, { pile });
        assert.equal(parts.length, 1);
        const geometry = parts[0], uv = geometry.getAttribute('uv');
        // Select an interior ring by its UV seam and measure opposing vertices
        // of the finished section; do not recalculate radii from thread.ts.
        const starts: number[] = [];
        for (let i = 0; i < uv.count; i++) if (Math.abs(uv.getY(i)) < 1e-9) starts.push(i);
        assert.ok(starts.length > 2);
        const start = starts[Math.floor(starts.length / 2)], stop = starts[Math.floor(starts.length / 2) + 1];
        const vertexAt = (v: number) => {
          for (let i = start; i < stop; i++) if (Math.abs(uv.getY(i) - v) < 1e-8) return read(geometry, i);
          throw new Error(`Missing section coordinate ${v}`);
        };
        near(vertexAt(.25).distanceTo(vertexAt(.75)) * R, widthMm);
        near(vertexAt(0).distanceTo(vertexAt(.5)) * R, widthMm / 2);
        // Cached cord geometry belongs to the renderer, so it is not disposed here.
      }
    }
  });
});
