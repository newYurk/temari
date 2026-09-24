import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditUpperBundle, buildUpperBundle, judgeUpperBundleAudit, toUpperBundleCoupon } from './upper-bundle';
import { boundCurvatureTimesRadius } from './curvature-bound';
import { interThreadClearance } from './s8-kiku-ab';
import { curveDerivative, evaluateCurve } from './thread-geometry';
import type { C8ThreadCoupon, PointMm, ThreadCurve } from './thread-path';

const bundle = buildUpperBundle();
const audit = auditUpperBundle(bundle);
const spans = new Map(bundle.spans.map(s => [s.id, s]));
const pointNear = (a: PointMm, b: PointMm, tolerance = 1e-9) =>
  assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < tolerance, `${a} != ${b}`);
const unit = (p: PointMm): PointMm => p.map(v => v / Math.hypot(...p)) as unknown as PointMm;

describe('three-visit upper bundle: a material-scoped engineering reference', () => {
  it('contains three real recipe visits of one physical thread with original orders', () => {
    assert.deepEqual(bundle.visits.map(v => v.row), [0, 1, 2]);
    assert.equal(new Set(bundle.visits.map(v => v.threadId)).size, 1);
    assert.equal(new Set(bundle.spans.map(s => s.threadId)).size, 1);
    assert.deepEqual(bundle.visits.map(v => Object.values(v.sourceOrders)), [[0, 1, 2], [8, 9, 10], [16, 17, 18]]);
    assert.equal(new Set(bundle.spans.map(s => s.id)).size, bundle.spans.length);
    assert.deepEqual(bundle.visits.flatMap(v => v.spanIds), bundle.spans.map(s => s.id));
    for (const visit of bundle.visits) {
      assert.deepEqual(visit.operations.map(o => [o.sourceOrder, o.substep]), [
        [8 * visit.row, 1], [8 * visit.row + 1, 0], [8 * visit.row + 1, 1],
        [8 * visit.row + 2, 0], [8 * visit.row + 2, 1],
      ]);
      assert.ok(visit.operations.every(o => o.sourceOperationId.includes(`/r${visit.row}/`)));
      assert.ok(visit.operations.every(o => !('kind' in o)), 'no fabricated start/finish material events');
      assert.ok(visit.incomingSpanIds.some(id => spans.get(id)!.curve.kind === 'arc'));
      assert.ok(visit.outgoingSpanIds.some(id => spans.get(id)!.curve.kind === 'arc'));
    }
  });

  it('gets displayed entry and exit directly from the prescribed return, joined to both full legs', () => {
    for (const visit of bundle.visits) {
      const first = spans.get(visit.returnSpanIds[0])!, last = spans.get(visit.returnSpanIds.at(-1)!)!;
      pointNear(visit.ports.entry.positionMm, evaluateCurve(first.curve, 0));
      pointNear(visit.ports.exit.positionMm, evaluateCurve(last.curve, 1));
      pointNear(visit.ports.entry.tangent, unit(curveDerivative(first.curve, 0)));
      pointNear(visit.ports.exit.tangent, unit(curveDerivative(last.curve, 1)));
      pointNear(evaluateCurve(spans.get(visit.incomingSpanIds.at(-1)!)!.curve, 1), visit.ports.entry.positionMm);
      pointNear(evaluateCurve(spans.get(visit.outgoingSpanIds[0])!.curve, 0), visit.ports.exit.positionMm);
      // These guarded model ports must not be mislabeled as exact surface punctures.
      assert.ok(Math.hypot(...visit.ports.entry.positionMm) > bundle.bodyRadiusMm + bundle.threadRadiusMm);
      const ordered = visit.spanIds.map(id => spans.get(id)!);
      for (let i = 1; i < ordered.length; i++) {
        pointNear(evaluateCurve(ordered[i - 1].curve, 1), evaluateCurve(ordered[i].curve, 0));
        pointNear(unit(curveDerivative(ordered[i - 1].curve, 1)), unit(curveDerivative(ordered[i].curve, 0)), 1e-7);
      }
    }
  });

  it('delimits disconnected observations inside lower passages without inventing connecting material', () => {
    assert.equal(bundle.omittedContinuations.length, 4);
    for (const visit of bundle.visits) for (const side of ['entry', 'exit'] as const) {
      const boundary = visit.boundaries[side];
      assert.equal(boundary.kind, 'observation-cut');
      assert.equal(boundary.exchange, 'unspecified');
      assert.ok(boundary.sourceOperationId.endsWith(side === 'entry' ? '/outer-1' : '/outer-3'));
      assert.ok(Math.hypot(...boundary.positionMm) < bundle.bodyRadiusMm - bundle.threadRadiusMm);
      pointNear(boundary.positionMm, evaluateCurve(spans.get(boundary.spanId)!.curve, boundary.t));
      assert.ok(Math.abs(Math.hypot(...boundary.tangent) - 1) < 1e-12);
    }
    for (let i = 1; i < bundle.visits.length; i++) {
      const omitted = bundle.omittedContinuations[i];
      assert.equal(omitted.fromBoundaryId, bundle.visits[i - 1].boundaries.exit.id);
      assert.equal(omitted.toBoundaryId, bundle.visits[i].boundaries.entry.id);
      assert.equal(omitted.geometry, 'not-represented');
      assert.equal(omitted.materialLength, 'unknown');
      assert.equal(omitted.contacts, 'not-checked');
    }
    assert.equal(bundle.constraints.materialLength, 'reference-only-not-rest-length');
    assert.equal(bundle.constraints.earlierExposedMaterial, 'intended-movable-not-solved');
    assert.ok(Math.abs(bundle.referenceGeometryLengthMm - bundle.visits.reduce((sum, v) => sum + v.referenceGeometryLengthMm, 0)) < 1e-12);
  });

  it('keeps expected finite bundle branches separate from conditional crossing rules and proof', () => {
    assert.deepEqual(bundle.captureCandidates.map(c => c.branches.length), [2, 4]);
    for (const candidate of bundle.captureCandidates) {
      assert.equal(candidate.status, 'candidate-not-verified');
      assert.equal(candidate.expectation, 'recipe-declared-bundle');
      for (const branch of candidate.branches) for (const window of branch.windows) {
        assert.ok(spans.has(window.spanId));
        assert.equal(window.t0, 0); assert.equal(window.t1, 1);
      }
    }
    assert.equal(bundle.crossingRequirements.length, 3);
    assert.ok(bundle.crossingRequirements.every(c => c.applicability === 'if-transverse-crossing-exists' && c.status === 'not-checked'));
    for (const visit of bundle.visits) {
      const coupon = toUpperBundleCoupon(bundle, visit.id);
      assert.equal(coupon.captures, undefined);
      assert.equal(coupon.crossings, undefined);
    }
  });

  it('adapts each connected visit separately without changing the displayed geometry', () => {
    for (const visit of bundle.visits) {
      const coupon = toUpperBundleCoupon(bundle, visit.id);
      assert.deepEqual(coupon.spans.map(s => s.id), visit.spanIds);
      for (const span of coupon.spans) assert.equal(span, spans.get(span.id));
      assert.equal(coupon.threadId, visit.threadId);
      assert.deepEqual(coupon.operations.map(o => o.kind), ['start', 'lay', 'catch', 'lay', 'finish']);
      assert.ok(coupon.operations.every((o, i, a) => i === 0 || o.order > a[i - 1].order));
      assert.equal(coupon.threadRadiusMm, bundle.section.radiusMm);
    }
    assert.throws(() => toUpperBundleCoupon(bundle, 'missing-visit'), /Unknown upper visit/);
    assert.deepEqual(JSON.parse(JSON.stringify(bundle)), bundle, 'the shared contract has no closures, maps, or non-finite numbers');
  });

  it('reports actual reference failures instead of calling the engineering seeds relaxed', () => {
    assert.equal(bundle.geometryState, 'seed');
    assert.equal(bundle.status, 'unresolved');
    assert.equal(audit.status, 'rejected');
    assert.equal(audit.mechanics, 'not-solved');
    assert.equal(audit.topology, 'partial');
    assert.ok(audit.visits.every(v => v.validation.status === 'failed' && v.curvature.upper > 1));
    assert.equal(audit.betweenVisits.length, 3);
    assert.ok(audit.betweenVisits.some(p => p.clearance.status === 'failed' && p.clearance.upperMm < -.4));
    assert.ok(audit.diagnostics.some(d => d.code === 'seed-inter-visit-clearance'));
  });

  it('does not promote even all-green local checks to material or craft acceptance', () => {
    const local = structuredClone({ visits: audit.visits, betweenVisits: audit.betweenVisits });
    for (const visit of local.visits) {
      visit.validation.status = 'passed'; visit.validation.diagnostics = [];
      visit.curvature.status = 'certified'; visit.curvature.lower = .7; visit.curvature.upper = .8;
    }
    for (const pair of local.betweenVisits) {
      pair.clearance.status = 'passed'; pair.clearance.lowerMm = .001; pair.clearance.upperMm = .002;
    }
    assert.equal(judgeUpperBundleAudit(local), 'unresolved');
    assert.equal(judgeUpperBundleAudit({ visits: [], betweenVisits: [] }), 'unresolved');
  });

  it('distinguishes an upper bound crossing one from a witnessed curvature violation', () => {
    const k = 4 / 3 * (Math.SQRT2 - 1);
    const quarter: ThreadCurve = { kind: 'bezier', controls: [[1, 0, 0], [1, k, 0], [k, 1, 0], [0, 1, 0]] };
    const coarse = boundCurvatureTimesRadius([quarter], .9915);
    const fine = boundCurvatureTimesRadius([quarter], .9915, { precision: 1e-7 });
    assert.equal(coarse.status, 'certified');
    assert.ok(coarse.lower < 1 && coarse.upper >= 1, 'the certified interval straddles the threshold');
    assert.ok(fine.upper < 1, 'a tighter certificate proves that this curve is actually regular');
    // Isolate the curvature decision, assuming the independent path checks passed.
    const visit = { visitId: 'quarter-control', validation: { ...audit.visits[0].validation,
      status: 'passed' as const, diagnostics: [] }, curvature: coarse };
    assert.equal(judgeUpperBundleAudit({ visits: [visit], betweenVisits: [] }), 'unresolved');
    const violation = boundCurvatureTimesRadius([quarter], .9921);
    assert.ok(violation.lower > 1, 'an evaluated point supplies a violation witness');
    assert.equal(judgeUpperBundleAudit({ visits: [{ ...visit, curvature: violation }], betweenVisits: [] }), 'rejected');
  });

  it('rejects a clearance failure supported by an actual finite-curve intersection witness', () => {
    const tube = (id: string, controls: Extract<ThreadCurve, { kind: 'bezier' }>['controls']): C8ThreadCoupon => ({
      kind: 'engineering-thread-path', bodyRadiusMm: 1, threadRadiusMm: .1, threadId: id,
      spans: [{ id, threadId: id, opId: id, step: 0, zone: 'surface', curve: { kind: 'bezier', controls } }],
      operations: [], supports: [], marks: [], fixture: {}, assumptions: [],
    });
    // Two finite straight axes cross in projection with exactly .15 mm separation;
    // their .1 mm radii give a physical clearance of -.05 mm.
    const a = tube('horizontal', [[-1, 0, 2], [-1 / 3, 0, 2], [1 / 3, 0, 2], [1, 0, 2]]);
    const b = tube('vertical', [[0, -1, 2.15], [0, -1 / 3, 2.15], [0, 1 / 3, 2.15], [0, 1, 2.15]]);
    const clearance = interThreadClearance(a, b);
    assert.equal(clearance.status, 'failed');
    assert.ok(Math.abs(clearance.upperMm + .05) < 1e-12);
    assert.deepEqual(clearance.witness, ['horizontal', 'vertical']);
    assert.equal(judgeUpperBundleAudit({ visits: [], betweenVisits: [{
      earlierVisitId: 'earlier', laterVisitId: 'later', clearance,
    }] }), 'rejected');
  });

  it('retains all third-visit resolution levels, including both over-budget requests', () => {
    const third = audit.wholeSpanBudget.filter(b => b.row === 2);
    assert.deepEqual(third.map(b => b.requestedSpans), [109, 110]);
    assert.ok(third.every(b => b.discretizationRule === 'ceil(referenceGeometryLengthMm / minBendRadiusMm)'
      && b.controlCountRule === 'ceil(requestedSpans * factor) + 3'));
    assert.deepEqual(third.map(b => b.levels.map(l => l.controlCount)), [[167, 221, 276], [168, 223, 278]]);
    assert.ok(third.every(b => b.levels.length === 3 && !b.levels[2].withinBudget && b.maxControls === 256));
    assert.equal(audit.diagnostics.filter(d => d.code === 'whole-span-budget').length, 2);
  });
});
