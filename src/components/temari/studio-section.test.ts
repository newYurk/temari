import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMotifGeometry } from './stitches';
import { stitchRadius, type ThreadKind } from './thread';
import type { Stitch, Vec3 } from './patterns';

const rotate = ([x, y, z]: Vec3): Vec3 => [x, -z, y];
const arc = (extra = {}): Extract<Stitch, { kind: 'arc' }> => ({
  kind: 'arc', a: [Math.sin(1.1), Math.cos(1.1), 0],
  b: [-Math.sin(1.1), Math.cos(1.1), 0], color: 0, ...extra,
});

describe('studio thread section', () => {
  it('winds surface triangles outward for FrontSide culling', () => {
    const geometry = createMotifGeometry([arc()], 0)!;
    try {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), indices = geometry.index!;
      let checked = 0;
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
        const origin = new Vector3().fromBufferAttribute(p, a);
        if (Math.abs(Math.atan2(origin.x, origin.y)) > .9) continue;
        const face = new Vector3().fromBufferAttribute(p, b).sub(origin)
          .cross(new Vector3().fromBufferAttribute(p, c).sub(origin));
        const normal = new Vector3().fromBufferAttribute(n, a)
          .add(new Vector3().fromBufferAttribute(n, b)).add(new Vector3().fromBufferAttribute(n, c));
        assert.ok(face.dot(normal) > 0, 'geometric front face agrees with its outward normals');
        checked++;
      }
      assert.ok(checked > 1000);
    } finally { geometry.dispose(); }
  });

  it('keeps the stated circular radius through the pole and along the flank', () => {
    for (const kind of ['pearl5', 'pearl8'] as ThreadKind[]) {
      const radius = stitchRadius(kind), geometry = createMotifGeometry([arc()], 0, kind)!;
      try {
        const p = geometry.getAttribute('position');
        let checked = 0;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          // The central portion is a known great-circle centreline of radius
          // 1+r in the XY plane. Exclude the explicitly buried end passages.
          if (Math.abs(Math.atan2(x, y)) > .9) continue;
          const sectionRadius = Math.hypot(Math.hypot(x, y) - (1 + radius), z);
          assert.ok(Math.abs(sectionRadius - radius) < 2e-7, `${kind}: section ${sectionRadius}`);
          assert.ok(Math.hypot(x, y, z) >= 1 - 2e-7, 'surface yarn does not enter the mari');
          checked++;
        }
        assert.ok(checked > 1000, 'checks both the polar cap and the wider flank');
      } finally { geometry.dispose(); }
    }
  });

  it('preserves the complete mesh and declared lift when the same arc is rotated', () => {
    for (const extra of [{}, { lift: .01, sitMid: 2, sitMidT: .5 }]) {
      const s = arc(extra), rotated = { ...s, a: rotate(s.a), b: rotate(s.b) };
      const a = createMotifGeometry([s], 0)!, b = createMotifGeometry([rotated], 0)!;
      try {
        const pa = a.getAttribute('position'), pb = b.getAttribute('position');
        assert.equal(pa.count, pb.count);
        assert.deepEqual(a.index?.array, b.index?.array);
        for (let i = 0; i < pa.count; i++) {
          const p = rotate([pa.getX(i), pa.getY(i), pa.getZ(i)]);
          assert.ok(Math.hypot(p[0] - pb.getX(i), p[1] - pb.getY(i), p[2] - pb.getZ(i)) < 3e-7);
        }
      } finally { a.dispose(); b.dispose(); }
    }
  });
});
