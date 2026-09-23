import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planS8Kiku } from './s8-kiku';
import { interThreadClearance } from './s8-kiku-ab';
import { planUpperKiku, upperFragment, upperIncomingCrossing, UPPER_KIKU_INPUT } from './upper-kiku';
import { createThreadSpanMesh, meshBodyGapMm, PATH_MESH_SIDES } from './thread-path-mesh';
import { validateThreadCrossings } from './thread-crossings';
import type { C8ThreadCoupon, ThreadSpan } from './thread-path';

describe('bounded whole-span upper control', () => {
  it('binds two separated visits to one actual recipe thread and retains the omitted continuation', () => {
    const { geometry, visits } = planUpperKiku();
    assert.equal(visits.length, 2);
    assert.equal(visits[0].incoming.threadId, visits[1].incoming.threadId);
    assert.deepEqual(visits[1].incoming.overOperations, [visits[0].incoming.operationId]);
    for (const visit of visits) {
      assert.ok(visit.incoming.operationId.endsWith(`/r${visit.row}/inner-2`));
      assert.ok(visit.boundaries.enteringPassage.endsWith('/outer-1'));
      assert.ok(visit.boundaries.leavingPassage.endsWith('/outer-3'));
      const fragment = upperFragment(geometry, visit, visit.incomingSeed, visit.outgoingSeed);
      assert.ok(fragment.spans.every(s => s.threadId === visit.incoming.threadId));
      assert.deepEqual(fragment.operations.map(o => o.kind), ['start', 'lay', 'catch', 'lay', 'finish']);
      assert.ok(visit.incomingSeed.some(c => c.kind === 'arc'), 'the entire middle of the leg is a seed, not a fixed arc');
    }
  });

  it('detects the buried collision missed by surface-only spacing and separates the round tubes', () => {
    const { geometry, visits } = planUpperKiku();
    const old = planS8Kiku({ ...UPPER_KIKU_INPUT, rowAdvanceMm: .716 });
    const hidden = (p: typeof geometry, v: typeof visits[number]) => {
      const c = upperFragment(p, v, v.incomingSeed, v.outgoingSeed);
      return { ...c, spans: c.spans.filter(s => s.zone !== 'surface') };
    };
    const failed = interThreadClearance(hidden(old, visits[0]), hidden(old, visits[1]), .0001);
    assert.equal(failed.status, 'failed');
    assert.ok(failed.upperMm < -.03);
    const valid = interThreadClearance(hidden(geometry, visits[0]), hidden(geometry, visits[1]), .0001);
    assert.equal(valid.status, 'passed');
    assert.ok(valid.lowerMm > .005);
  });

  it('takes each prescribed upper return under the actual finite marking thread', () => {
    const { geometry, visits } = planUpperKiku();
    for (const visit of visits) {
      const c = upperFragment(geometry, visit, visit.incomingSeed, visit.outgoingSeed);
      const passage = c.operations.find(op => op.kind === 'catch')!;
      c.crossings = [{ id: 'upper-return-under-marking', opId: passage.id,
        working: passage.spanIds.map(spanId => ({ spanId, t0: 0, t1: 1 })),
        target: { id: 'jiwari-2', t0: 0, t1: 1 }, pass: 'under' }];
      assert.deepEqual(validateThreadCrossings(c, .001), []);
      c.crossings[0].pass = 'over';
      assert.ok(validateThreadCrossings(c, .001).some(d => d.code === 'crossing-wrong-side'));
    }
  });

  it('checks incoming-over against independent branch identities, not a row-parity convention', () => {
    const coupon = (later: boolean, z: number): C8ThreadCoupon => {
      const id = later ? 'row-2/incoming' : 'row-1/outgoing';
      const curve: ThreadSpan['curve'] = later
        ? { kind: 'bezier', controls: [[0, -2, z], [0, -1, z], [0, 1, z], [0, 2, z]] }
        : { kind: 'bezier', controls: [[-2, 0, z], [-1, 0, z], [1, 0, z], [2, 0, z]] };
      return { kind: 'engineering-thread-path', threadId: 'one-thread', threadRadiusMm: .1, bodyRadiusMm: 1,
        spans: [{ id, opId: id, threadId: 'one-thread', step: later ? 2 : 1, zone: 'surface', curve }],
        operations: [{ id, order: later ? 2 : 1, step: later ? 2 : 1, kind: 'lay', spanIds: [id] }],
        marks: [], supports: [], assumptions: [], fixture: {} };
    };
    assert.deepEqual(upperIncomingCrossing(coupon(false, 11), coupon(true, 12)), []);
    assert.ok(upperIncomingCrossing(coupon(false, 11), coupon(true, 10)).some(d => d.code === 'crossing-wrong-side'));
  });
});

describe('exact round path mesh', () => {
  it('places every ring on the actual curve with the declared radius, without flattening', () => {
    const R = 240 / (2 * Math.PI), r = .355, distance = R + r + .003;
    const span: ThreadSpan = { id: 'arc', opId: 'lay', threadId: 'thread', step: 1, zone: 'surface',
      curve: { kind: 'arc', from: [distance, 0, 0], to: [0, distance, 0] } };
    const mesh = createThreadSpanMesh(span, r, R), attr = mesh.geometry.getAttribute('position');
    try {
      for (let i = 0; i < mesh.sample.points.length; i++) {
        const centre = mesh.sample.points[i];
        for (let j = 0; j <= PATH_MESH_SIDES; j++) {
          const k = i * (PATH_MESH_SIDES + 1) + j;
          assert.ok(Math.abs(Math.hypot(attr.getX(k) * R - centre[0], attr.getY(k) * R - centre[1], attr.getZ(k) * R - centre[2]) - r) < .000005);
        }
      }
      assert.ok(mesh.envelopeErrorMm < .00002);
      assert.ok(meshBodyGapMm(mesh.geometry, R) > .0029);
    } finally { mesh.geometry.dispose(); }
  });
});
