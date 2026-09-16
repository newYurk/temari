import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateTautSegment, solveTautContact, tautSegmentPointDistance } from "./taut-contact";
import type { ContactPointMm, TautContactInput, TautContactResult, TautSegment } from "./taut-contact";

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const pointNear = (a: ContactPointMm, b: ContactPointMm, tolerance = 1e-9) => {
  near(a[0], b[0], tolerance); near(a[1], b[1], tolerance);
};
const one: TautContactInput = { startMm: [-2, 1], endMm: [-2, -1], threadRadiusMm: .2,
  supports: [{ id: "one", centerMm: [0, 0], radiusMm: .8 }], direction: -1 };
const successful = (input: TautContactInput) => {
  const result = solveTautContact(input);
  assert.equal(result.status, "passed", JSON.stringify(result.diagnostics));
  pointNear(result.segments[0].from, input.startMm);
  pointNear(result.segments.at(-1)!.to, input.endMm);
  return result;
};
function atLength(result: TautContactResult, fraction: number): ContactPointMm {
  let distance = fraction * result.lengthMm;
  for (const segment of result.segments) {
    if (distance <= segment.lengthMm) return evaluateTautSegment(segment, distance / segment.lengthMm);
    distance -= segment.lengthMm;
  }
  return result.segments.at(-1)!.to;
}
function mapped(input: TautContactInput, map: (p: ContactPointMm) => ContactPointMm,
  lengthScale = 1, reflected = false): TautContactInput {
  return { ...input, startMm: map(input.startMm), endMm: map(input.endMm),
    threadRadiusMm: input.threadRadiusMm * lengthScale, clearanceMm: (input.clearanceMm ?? 0) * lengthScale,
    direction: reflected ? -input.direction as 1 | -1 : input.direction,
    supports: input.supports.map(s => ({ ...s, centerMm: map(s.centerMm), radiusMm: s.radiusMm * lengthScale })) };
}

describe("taut contact: exact external envelope reference", () => {
  it("matches a semicircle with tangent straight legs and finite section radius", () => {
    const result = successful(one);
    near(result.lengthMm, 4 + Math.PI);
    near(result.maxCurvatureTimesRadius, .2);
    near(result.minSupportGapMm!, 0);
    assert.deepEqual(result.contacts.map(c => c.supportId), ["one"]);
    near(result.contacts[0].angleRad, Math.PI);
    near(result.contacts[0].lengthMm, Math.PI);
    const firstArc = result.segments.find(s => s.kind === "arc")!;
    pointNear(firstArc.from, [0, 1]);
    pointNear(atLength(result, .5), [1, 0]);
  });

  it("matches an independent oblique tangent formula, not a sampled polyline", () => {
    const d = 2.5, rho = .9;
    const result = successful({ startMm: [-d, 0], endMm: [d, 0], threadRadiusMm: .25,
      supports: [{ id: "circle", centerMm: [0, 0], radiusMm: rho - .25 }], direction: -1 });
    near(result.lengthMm, 2 * Math.sqrt(d * d - rho * rho) + 2 * rho * Math.asin(rho / d));
    near(result.contacts[0].angleRad, 2 * Math.asin(rho / d));
    const h = rho * Math.sqrt(1 - (rho / d) ** 2);
    pointNear(result.segments[0].to, [-rho * rho / d, h]);
    pointNear(result.segments.at(-1)!.from, [rho * rho / d, h]);
  });

  it("wraps a two-disk capsule and preserves a zero-angle grazing support", () => {
    const result = successful({ ...one, supports: [...one.supports,
      { id: "two", centerMm: [2, 0], radiusMm: .8 }] });
    near(result.lengthMm, 8 + Math.PI);
    near(result.contacts.find(c => c.supportId === "one")!.angleRad, 0);
    near(result.contacts.find(c => c.supportId === "two")!.angleRad, Math.PI);
    assert.ok(result.segments.some(s => s.kind === "line" && Math.abs(s.from[1] - 1) < 1e-9 && Math.abs(s.to[1] - 1) < 1e-9));
  });

  it("handles unequal radii using the independent external bitangent length", () => {
    for (const [rho1, rho2, d, a] of [[.9, .6, 1.4, 1], [.5, .8, 1.4, .3]]) {
      const radius = .2, cosine = (rho1 - rho2) / d, sine = Math.sqrt(1 - cosine * cosine);
      const top: ContactPointMm = [rho1 * cosine, rho1 * sine];
      const bottom: ContactPointMm = [rho1 * cosine, -rho1 * sine];
      const result = successful({ startMm: [top[0] - a * sine, top[1] + a * cosine],
        endMm: [bottom[0] - a * sine, bottom[1] - a * cosine], threadRadiusMm: radius,
        supports: [{ id: "left", centerMm: [0, 0], radiusMm: rho1 - radius },
          { id: "right", centerMm: [d, 0], radiusMm: rho2 - radius }], direction: -1 });
      const angle = 2 * Math.acos(cosine);
      near(result.lengthMm, 2 * a + 2 * Math.sqrt(d * d - (rho1 - rho2) ** 2) + rho2 * angle);
      near(result.contacts.find(c => c.supportId === "right")!.angleRad, angle);
      near(result.contacts.find(c => c.supportId === "left")!.angleRad, 0);
    }
  });

  it("matches the half-perimeter oracle of three equal disks on an equilateral triangle", () => {
    const rho = .6;
    const result = successful({ startMm: [-2, 1 + rho], endMm: [-2, -1 - rho], threadRadiusMm: .2,
      supports: [{ id: "top", centerMm: [0, 1], radiusMm: .4 },
        { id: "right", centerMm: [Math.sqrt(3), 0], radiusMm: .4 },
        { id: "bottom", centerMm: [0, -1], radiusMm: .4 }], direction: -1 });
    near(result.lengthMm, 8 + Math.PI * rho);
    near(result.contacts.find(c => c.supportId === "right")!.angleRad, 2 * Math.PI / 3);
    near(result.contacts.find(c => c.supportId === "top")!.angleRad, Math.PI / 6);
    near(result.contacts.find(c => c.supportId === "bottom")!.angleRad, Math.PI / 6);
  });

  it("accepts overlapping inflated disks while rejecting overlapping physical supports", () => {
    const input: TautContactInput = { startMm: [-2, .4], endMm: [-2, -.4], threadRadiusMm: .2,
      supports: [{ id: "a", centerMm: [0, 0], radiusMm: .2 },
        { id: "b", centerMm: [.4, 0], radiusMm: .2 }], direction: -1 };
    const result = successful(input);
    near(result.lengthMm, 4.8 + .4 * Math.PI);
    const bad = solveTautContact({ ...input, supports: [input.supports[0], { ...input.supports[1], centerMm: [.39, 0] }] });
    assert.equal(bad.status, "failed"); assert.equal(bad.diagnostics[0].code, "physical-overlap");
  });

  it("does not force contact with a support hidden inside the convex envelope", () => {
    const input: TautContactInput = { startMm: [-2, .5], endMm: [-2, -.5], threadRadiusMm: .2,
      supports: [{ id: "a", centerMm: [0, 0], radiusMm: .3 },
        { id: "b", centerMm: [2, 0], radiusMm: .3 },
        { id: "middle", centerMm: [1, 0], radiusMm: .1 }], direction: -1 };
    const result = successful(input);
    near(result.lengthMm, 8 + .5 * Math.PI);
    assert.deepEqual(result.contacts.map(c => c.supportId), ["a", "b"]);
  });

  it("preserves the complete path under rotation, translation, reflection and scale", () => {
    const input: TautContactInput = { startMm: [-2, 1.6], endMm: [-2, -1.7], threadRadiusMm: .17,
      supports: [{ id: "top", centerMm: [0, .6], radiusMm: .26 },
        { id: "right", centerMm: [1.2, 0], radiusMm: .38 },
        { id: "bottom", centerMm: [0, -.65], radiusMm: .31 }], direction: -1 };
    const original = successful(input);
    for (const angle of [0, .173, Math.PI / 2, 2.712, 5.99]) {
      const map = ([x, y]: ContactPointMm): ContactPointMm => [7 + Math.cos(angle) * x - Math.sin(angle) * y,
        -11 + Math.sin(angle) * x + Math.cos(angle) * y];
      const rotated = successful(mapped(input, map));
      near(rotated.lengthMm, original.lengthMm);
      near(rotated.maxCurvatureTimesRadius, original.maxCurvatureTimesRadius);
      for (let j = 0; j <= 50; j++) pointNear(atLength(rotated, j / 50), map(atLength(original, j / 50)));
      for (const contact of original.contacts) near(rotated.contacts.find(c => c.supportId === contact.supportId)!.angleRad, contact.angleRad);
    }
    for (const factor of [.01, .5, 2, 100]) {
      const map = ([x, y]: ContactPointMm): ContactPointMm => [factor * x, factor * y];
      const scaled = successful(mapped(input, map, factor));
      near(scaled.lengthMm, original.lengthMm * factor, 1e-7);
      near(scaled.maxCurvatureTimesRadius, original.maxCurvatureTimesRadius);
      for (let j = 0; j <= 30; j++) pointNear(atLength(scaled, j / 30), map(atLength(original, j / 30)), 1e-7);
    }
    const mirror = ([x, y]: ContactPointMm): ContactPointMm => [x, -y];
    const reflected = successful(mapped(input, mirror, 1, true));
    near(reflected.lengthMm, original.lengthMm);
    for (let j = 0; j <= 40; j++) pointNear(atLength(reflected, j / 40), mirror(atLength(original, j / 40)));
  });

  it("keeps endpoints fixed when adding a virtual clearance, and reports its actual gap", () => {
    const exact = successful(one), raised = successful({ ...one, clearanceMm: .4 });
    assert.ok(raised.lengthMm > exact.lengthMm);
    near(raised.minSupportGapMm!, .4); near(raised.clearanceMm, .4);
    near(raised.maxCurvatureTimesRadius, .2 / 1.4);
    assert.equal(solveTautContact({ ...one, clearanceMm: 3 }).status, "failed");
  });

  it("checks complete circular intervals including interior closest approaches", () => {
    const segment: TautSegment = { kind: "arc", centerMm: [0, 0], radiusMm: 2,
      startAngleRad: 0, sweepRad: Math.PI, supportId: "test", from: [2, 0], to: [-2, 0], lengthMm: 2 * Math.PI };
    near(tautSegmentPointDistance(segment, [0, 3]), 1);
    near(tautSegmentPointDistance(segment, [0, -3]), Math.sqrt(13));
    near(tautSegmentPointDistance(segment, [.3, .4]), 1.5);
    const reversed = { ...segment, from: segment.to, to: segment.from, startAngleRad: Math.PI, sweepRad: -Math.PI };
    near(tautSegmentPointDistance(reversed, [.3, .4]), 1.5);
    near(tautSegmentPointDistance({ kind: "line", from: [-3, 1], to: [3, 1], lengthMm: 6 }, [.2, 0]), 1);
  });

  it("rejects a self-crossing prescribed branch without switching to a shorter branch", () => {
    const input: TautContactInput = { ...one, startMm: [-2, 2], endMm: [2, 2] };
    const bad = solveTautContact(input);
    assert.equal(bad.status, "failed"); assert.equal(bad.diagnostics[0].code, "self-penetration");
    const other = successful({ ...input, direction: 1 });
    assert.ok(bad.lengthMm > other.lengthMm);
  });

  it("detects finite-thickness return collisions even without a centreline crossing", () => {
    const bad = solveTautContact({ ...one, startMm: [-2, .15], endMm: [-2, -.15] });
    assert.equal(bad.status, "failed"); assert.equal(bad.diagnostics[0].code, "self-penetration");
    // The distant ends of an almost complete circular arc also count, even
    // though it is one mathematical primitive rather than separate threads.
    const loop = solveTautContact({ ...one, startMm: [1.001, -.001], endMm: [1.001, .001] });
    assert.equal(loop.status, "failed"); assert.equal(loop.diagnostics[0].code, "self-penetration");
    const touch = solveTautContact({ ...one, startMm: [-2, .2], endMm: [-2, -.2] });
    assert.equal(touch.status, "unresolved"); assert.equal(touch.diagnostics[0].code, "self-contact-unresolved");
  });

  it("rejects finite invalid ports including points in empty space inside the envelope", () => {
    assert.equal(solveTautContact({ ...one, startMm: [0, 0] }).diagnostics[0].code, "endpoint-inside-envelope");
    assert.equal(solveTautContact({ ...one, startMm: [1, 0] }).diagnostics[0].code, "endpoint-on-envelope");
    const supports = [{ id: "a", centerMm: [0, 0] as const, radiusMm: .2 },
      { id: "b", centerMm: [2, 0] as const, radiusMm: .2 }];
    assert.equal(solveTautContact({ ...one, startMm: [1, 0], supports }).diagnostics[0].code, "endpoint-inside-envelope");
    assert.equal(solveTautContact({ ...one, startMm: [1, .4], supports }).diagnostics[0].code, "endpoint-on-envelope");
    for (const changed of [{ startMm: [NaN, 0] }, { threadRadiusMm: 0 }, { clearanceMm: -.1 },
      { direction: 0 }, { supports: [] }, { supports: [one.supports[0], one.supports[0]] }]) {
      assert.equal(solveTautContact({ ...one, ...changed } as TautContactInput).diagnostics[0].code, "invalid-input");
    }
    assert.equal(solveTautContact({ ...one, startMm: [-1e15, 2] }).status, "unresolved");
  });

  it("agrees with an independent dense distance and tangent oracle for three unequal supports", () => {
    const input: TautContactInput = { startMm: [-2, 1.6], endMm: [-2, -1.7], threadRadiusMm: .17,
      supports: [{ id: "top", centerMm: [0, .6], radiusMm: .26 },
        { id: "right", centerMm: [1.2, 0], radiusMm: .38 },
        { id: "bottom", centerMm: [0, -.65], radiusMm: .31 }], direction: -1 };
    const result = successful(input);
    for (const segment of result.segments) for (let j = 0; j <= 200; j++) {
      // Deliberately do not call the production evaluator for this oracle.
      const t = j / 200, p = segment.kind === "line"
        ? [segment.from[0] + t * (segment.to[0] - segment.from[0]), segment.from[1] + t * (segment.to[1] - segment.from[1])]
        : [segment.centerMm[0] + segment.radiusMm * Math.cos(segment.startAngleRad + t * segment.sweepRad),
          segment.centerMm[1] + segment.radiusMm * Math.sin(segment.startAngleRad + t * segment.sweepRad)];
      for (const support of input.supports) assert.ok(Math.hypot(p[0] - support.centerMm[0], p[1] - support.centerMm[1])
        >= support.radiusMm + input.threadRadiusMm - 1e-10);
    }
    for (let j = 1; j < result.segments.length; j++) {
      const a = result.segments[j - 1], b = result.segments[j];
      pointNear(a.to, b.from);
      const before = evaluateTautSegment(a, 1 - 1e-6), after = evaluateTautSegment(b, 1e-6);
      const u = [a.to[0] - before[0], a.to[1] - before[1]], v = [after[0] - b.from[0], after[1] - b.from[1]];
      assert.ok((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v) > 1 - 1e-9);
    }
  });

  it("is bounded by converging circumscribed polygon routes built with a different hull algorithm", () => {
    const distance = (a: ContactPointMm, b: ContactPointMm) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cross = (a: ContactPointMm, b: ContactPointMm, c: ContactPointMm) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    // Independent discrete oracle: circle-enclosing polygons, monotone-chain
    // hull, and supporting lines to vertices. It never uses disk pair equality
    // angles, circular tangency formulas, or the production curve evaluator.
    const polygonLength = (input: TautContactInput, count: number) => {
      const points = input.supports.flatMap(s => Array.from({ length: count }, (_, i): ContactPointMm => {
        const angle = 2 * Math.PI * (i + .5) / count;
        const radius = (s.radiusMm + input.threadRadiusMm + (input.clearanceMm ?? 0)) / Math.cos(Math.PI / count);
        return [s.centerMm[0] + radius * Math.cos(angle), s.centerMm[1] + radius * Math.sin(angle)];
      })).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const half = (points: ContactPointMm[]) => {
        const hull: ContactPointMm[] = [];
        for (const point of points) {
          while (hull.length > 1 && cross(hull.at(-2)!, hull.at(-1)!, point) <= 0) hull.pop();
          hull.push(point);
        }
        return hull;
      };
      const hull = [...half(points).slice(0, -1), ...half([...points].reverse()).slice(0, -1)];
      let entry = -1, exit = -1;
      for (let i = 0; i < hull.length; i++) {
        if (hull.every(v => input.direction * cross(input.startMm, hull[i], v) >= -1e-12)
          && (entry < 0 || distance(input.startMm, hull[i]) < distance(input.startMm, hull[entry]))) entry = i;
        if (hull.every(v => input.direction * cross(hull[i], input.endMm, v) >= -1e-12)
          && (exit < 0 || distance(input.endMm, hull[i]) < distance(input.endMm, hull[exit]))) exit = i;
      }
      assert.ok(entry >= 0 && exit >= 0);
      let length = distance(input.startMm, hull[entry]) + distance(input.endMm, hull[exit]), j = entry;
      while (j !== exit) {
        const next = (j + input.direction + hull.length) % hull.length;
        length += distance(hull[j], hull[next]); j = next;
      }
      return length;
    };
    for (let i = 0; i < 12; i++) {
      const input: TautContactInput = { startMm: [-2.1, 1.4 + i * .003], endMm: [-2, -1.5 - i * .007],
        supports: [{ id: "a", centerMm: [0, .7], radiusMm: .2 + i * .001 },
          { id: "b", centerMm: [1.3, 0], radiusMm: .3 + i * .002 },
          { id: "c", centerMm: [0, -.7], radiusMm: .25 + i * .001 }],
        threadRadiusMm: .17, direction: -1, clearanceMm: (i % 3) * .1 };
      const exact = successful(input).lengthMm, coarse = polygonLength(input, 64), fine = polygonLength(input, 128);
      assert.ok(fine >= exact - 1e-10 && fine < coarse);
      assert.ok(fine - exact < .0005);
    }
  });
});
