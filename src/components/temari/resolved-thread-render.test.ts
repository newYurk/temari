import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Quaternion, Vector3 } from 'three';
import { createResolvedThreadGeometry } from './stitches.ts';

const sides = 20, ring = sides + 1;
const vertex = (mesh: BufferGeometry, index: number, attribute = 'position') =>
  new Vector3().fromBufferAttribute(mesh.getAttribute(attribute), index);
const near = (actual: number, expected: number, tolerance = 2e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
const nearPoint = (actual: Vector3, expected: Vector3, tolerance = 2e-7) =>
  assert.ok(actual.distanceTo(expected) <= tolerance, `${actual.toArray()} != ${expected.toArray()}`);

describe('resolved thread mesh preserves the supplied solution', () => {
  it('keeps one centered ring at every nonuniform node, including nodes beneath the sphere', () => {
    const points = [new Vector3(.83, .1, .02), new Vector3(.9, .15, .04),
      new Vector3(.91, .17, .045), new Vector3(1.04, .3, .1)];
    const mesh = createResolvedThreadGeometry(points, .012, .5);
    assert.equal(mesh.getAttribute('position').count, points.length * ring);
    assert.equal(mesh.getIndex()!.count, (points.length - 1) * sides * 6, 'open walls, no cap or closing seam');
    for (let i = 0; i < points.length; i++) for (let j = 0; j < sides / 2; j++) {
      // Opposing vertices, unlike an average including the duplicated UV seam,
      // give an independent center for every section diameter.
      const center = vertex(mesh, i * ring + j).add(vertex(mesh, i * ring + j + sides / 2)).multiplyScalar(.5);
      nearPoint(center, points[i]!);
    }
    assert.deepEqual(mesh.userData.centerline, points);
    mesh.dispose();
  });

  it('renders the declared round and elliptical diameters without clamping or tapering', () => {
    const points = [new Vector3(-.4, 1, 0), new Vector3(0, 1, 0), new Vector3(.2, 1, 0)];
    const radius = .0355;
    for (const heightScale of [1, .5, .1, 2]) {
      const mesh = createResolvedThreadGeometry(points, radius, heightScale);
      assert.deepEqual(mesh.userData.section, { widthRadius: radius, heightRadius: radius * heightScale, radialSegments: sides });
      for (let i = 0; i < points.length; i++) {
        const start = i * ring;
        near(vertex(mesh, start).distanceTo(vertex(mesh, start + 10)), 2 * radius * heightScale);
        near(vertex(mesh, start + 5).distanceTo(vertex(mesh, start + 15)), 2 * radius);
        for (let j = 0; j < sides; j++) {
          const offset = vertex(mesh, start + j).sub(points[i]!);
          near(offset.x, 0);
          near((offset.y / (radius * heightScale)) ** 2 + (offset.z / radius) ** 2, 1, 4e-5);
          const expectedNormal = new Vector3(0, offset.y / (radius * heightScale) ** 2, offset.z / radius ** 2).normalize();
          nearPoint(vertex(mesh, start + j, 'normal'), expectedNormal, 2e-5);
        }
      }
      mesh.dispose();
    }
  });

  it('keeps finite perpendicular frames for non-radial tangents and a radial endpoint', () => {
    const points = [new Vector3(1, 0, 0), new Vector3(1.01, 0, 0),
      new Vector3(1.03, .03, .01), new Vector3(1.04, .1, .04)];
    const mesh = createResolvedThreadGeometry(points, .003, .5);
    for (let i = 0; i < points.length; i++) {
      const before = i === 0 ? undefined : points[i]!.clone().sub(points[i - 1]!).normalize();
      const after = i === points.length - 1 ? undefined : points[i + 1]!.clone().sub(points[i]!).normalize();
      const tangent = before && after ? before.add(after).normalize() : before ?? after!;
      for (let j = 0; j <= sides; j++) {
        const point = vertex(mesh, i * ring + j), normal = vertex(mesh, i * ring + j, 'normal');
        assert.ok([...point.toArray(), ...normal.toArray()].every(Number.isFinite));
        near(point.sub(points[i]!).dot(tangent), 0);
        near(normal.dot(tangent), 0);
        near(normal.length(), 1);
      }
    }
    mesh.dispose();
  });

  it('rotates the same vertices and normals with the solution, including its radial endpoint', () => {
    const points = [new Vector3(1, 0, 0), new Vector3(1.01, 0, 0),
      new Vector3(1.03, .03, .01), new Vector3(1.04, .1, .04)];
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(.3, .7, -.2).normalize(), 1.137);
    const original = createResolvedThreadGeometry(points, .003, .5);
    const rotated = createResolvedThreadGeometry(points.map(p => p.clone().applyQuaternion(rotation)), .003, .5);
    for (const attribute of ['position', 'normal']) for (let i = 0; i < original.getAttribute(attribute).count; i++) {
      nearPoint(vertex(rotated, i, attribute), vertex(original, i, attribute).applyQuaternion(rotation));
    }
    assert.deepEqual(Array.from(rotated.getIndex()!.array), Array.from(original.getIndex()!.array));
    original.dispose(); rotated.dispose();
  });

  it('does not mutate input nodes and keeps centerline metadata independent of the caller', () => {
    const points = [new Vector3(.1, 1, .1), new Vector3(.2, 1.02, .12), new Vector3(.4, 1.05, .2)];
    const before = points.map(p => p.clone());
    for (const point of points) Object.freeze(point);
    Object.freeze(points);
    const mesh = createResolvedThreadGeometry(points, .01);
    assert.deepEqual(points, before);
    mesh.userData.centerline[0].set(99, 99, 99);
    assert.deepEqual(points, before);
    nearPoint(vertex(mesh, 0).add(vertex(mesh, 10)).multiplyScalar(.5), before[0]!);
    mesh.dispose();
  });

  it('rejects undefined sections or frames instead of inventing corrected geometry', () => {
    const line = [new Vector3(0, 1, 0), new Vector3(.2, 1, 0)];
    for (const radius of [0, -1, NaN, Infinity]) assert.throws(() => createResolvedThreadGeometry(line, radius), RangeError);
    for (const height of [0, -1, NaN, Infinity]) assert.throws(() => createResolvedThreadGeometry(line, .01, height), RangeError);
    assert.throws(() => createResolvedThreadGeometry(line, 1e200, 1e200), RangeError);
    assert.throws(() => createResolvedThreadGeometry(line, 1e-200, 1e-200), RangeError);
    for (const points of [[], [line[0]!], [line[0]!, line[0]!],
      [line[0]!, new Vector3(NaN, 1, 0)], [line[0]!, line[1]!, line[0]!],
      [new Vector3(1, 0, 0), new Vector3(2, 0, 0)]]) {
      assert.throws(() => createResolvedThreadGeometry(points, .01), RangeError);
    }
  });
});
