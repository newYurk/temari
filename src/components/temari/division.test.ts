import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ICOSA_EDGES,
  ICOSA_FACES,
  ICOSA_FACE_NORMALS,
  ICOSA_VERTS,
  polePositions,
} from "./division.ts";

describe("icosahedron", () => {
  it("is the regular solid: V=12 E=30 F=20, Euler 2", () => {
    assert.equal(ICOSA_VERTS.length, 12);
    assert.equal(ICOSA_EDGES.length, 30);
    assert.equal(ICOSA_FACES.length, 20);
    assert.equal(
      ICOSA_VERTS.length - ICOSA_EDGES.length + ICOSA_FACES.length,
      2,
    );
  });

  it("puts every vertex on the unit sphere", () => {
    for (const v of ICOSA_VERTS) {
      assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-9, String(v));
    }
  });

  it("faces outward", () => {
    for (let i = 0; i < ICOSA_FACES.length; i++) {
      const f = ICOSA_FACES[i];
      const n = ICOSA_FACE_NORMALS[i];
      if (!f || !n) continue;
      const a = ICOSA_VERTS[f[0]];
      const b = ICOSA_VERTS[f[1]];
      const c = ICOSA_VERTS[f[2]];
      if (!a || !b || !c) continue;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cx = ab[1] * ac[2] - ab[2] * ac[1];
      const cy = ab[2] * ac[0] - ab[0] * ac[2];
      const cz = ab[0] * ac[1] - ab[1] * ac[0];
      const mid = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
      assert.ok(cx * mid[0] + cy * mid[1] + cz * mid[2] > 0);
      assert.ok(n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > 0);
    }
  });

  it("C8 poles are the octahedron, C10 poles are the 12 vertices", () => {
    assert.equal(polePositions("simple").length, 2);
    assert.equal(polePositions("c8").length, 6);
    assert.equal(polePositions("c10").length, 12);
  });
});
