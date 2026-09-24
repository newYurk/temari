import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditFirstVisitRoute, buildFirstVisitRoute } from './first-visit-route';
import { cubicMinimumRadius } from './single-needle-catch';
import { buildUpperBundle } from './upper-bundle';
import { evaluateCurve } from './thread-geometry';
import type { PointMm } from './thread-path';

const dist = (a: PointMm, b: PointMm) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('first full upper visit route before mechanics', () => {
  const route = buildFirstVisitRoute();

  it('takes the three studio recipe bites and does not reuse the planner seed ports', () => {
    assert.equal(route.portSource, 'studio-recipe-bite');
    assert.deepEqual(route.marks, ['outer-1', 'inner-2', 'outer-3']);
    assert.equal(route.mechanics, 'not-solved');
    assert.equal(route.status, 'not-certified');
    const seed = buildUpperBundle().visits[0].ports;
    const inner = route.channels[1];
    const entry = evaluateCurve(inner.spans[0].curve, 0);
    const exit = evaluateCurve(inner.spans[0].curve, 1);
    assert.ok(dist(entry, seed.entry.positionMm) > 5, 'recipe entry must stay clear of the seed port');
    assert.ok(dist(exit, seed.exit.positionMm) > 5, 'recipe exit must stay clear of the seed port');
  });

  it('meets every straight channel with a finite transition and no kink', () => {
    assert.equal(route.channels.length, 3);
    assert.equal(route.bridges.length, 6);
    for (const joint of route.joints) assert.ok(joint.angleDeg < 0.05, `${joint.id} kinks by ${joint.angleDeg}°`);
    for (const channel of route.channels) {
      assert.equal(channel.geometry, 'passed');
      assert.equal(channel.spans[0].curve.kind, 'bezier');
    }
    const coreAxisMm = route.R - route.layerMm + route.threadRadiusMm;
    for (const curve of [route.approach, ...route.bridges, route.departure]) {
      assert.ok(cubicMinimumRadius(curve) > coreAxisMm, 'an exterior transition enters the hard core');
    }
  });

  it('accepts a regular round tube against the hard core and does not start mechanics', () => {
    const audit = auditFirstVisitRoute(route);
    assert.equal(audit.tube, 'passed');
    assert.equal(audit.validation.status, 'passed');
    assert.equal(audit.curvature.status, 'certified');
    assert.ok(audit.curvature.upper < 1);
    assert.equal(audit.coreRadiusMm, route.R - route.layerMm);
    assert.equal(audit.mechanics, 'not-solved');
    assert.equal(audit.status, 'not-certified');
  });
});
