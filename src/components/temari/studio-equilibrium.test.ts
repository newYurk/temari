import { it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioEquilibriumInput } from './studio-equilibrium';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
it('mesh refinement preserves material quantities and all held coordinates of the studio experiment', () => {
  const coarse = buildStudioEquilibriumInput({ stepMm: .9 }), fine = buildStudioEquilibriumInput({ stepMm: .3 });
  for (let row = 0; row < 3; row++) {
    const a = coarse.input.threads[row], b = fine.input.threads[row];
    assert.ok(b.nodes.length > 2 * a.nodes.length);
    close(a.restLengthsMm.reduce((s, l) => s + l, 0), b.restLengthsMm.reduce((s, l) => s + l, 0));
    const fixedA = a.nodes.filter(n => n.fixed), fixedB = b.nodes.filter(n => n.fixed);
    assert.equal(fixedA.length, 4); assert.equal(fixedB.length, 4);
    fixedA.forEach((n, i) => n.positionMm.forEach((v, d) => close(v, fixedB[i].positionMm[d])));
    const portSections = (f: typeof coarse, index: number) => {
      const r = f.rows[index], ids = r.thread.nodes.flatMap((n, i) => n.fixed ? [i] : []);
      return ids.map(i => r.materialCoordinatesMm[i]);
    };
    portSections(coarse, row).forEach((s, i) => close(s, portSections(fine, row)[i]));
  }
});

it('recipe-port reconstruction is explicit and does not relabel display crossings as recipe holes', () => {
  const display = buildStudioEquilibriumInput(), recipe = buildStudioEquilibriumInput({ portSource: 'recipe' });
  assert.equal(display.portSource, 'render'); assert.equal(recipe.portSource, 'recipe');
  for (let row = 0; row < 3; row++) {
    assert.deepEqual(display.rows[row].portsMm, display.rows[row].sourceSurfaceCrossingsMm);
    assert.deepEqual(recipe.rows[row].sourceSurfaceCrossingsMm, display.rows[row].sourceSurfaceCrossingsMm);
    for (const p of recipe.rows[row].portsMm) {
      close(Math.hypot(...p), recipe.bodyRadiusMm);
      assert.ok(recipe.rows[row].thread.nodes.some(n => n.fixed && n.positionMm.every((v, d) => v === p[d])));
    }
    assert.ok(recipe.rows[row].portsMm.some((p, i) => Math.hypot(...p.map((v, d) => v - display.rows[row].portsMm[i][d])) > .1));
  }
});

it('the feed control has a stated reservoir and cannot silently coexist with elastic prestrain', () => {
  const f = buildStudioEquilibriumInput({ feedTensionN: .05, availableLengthMm: 40 });
  assert.ok(f.input.threads.every(t => t.feed?.tensionN === .05 && t.feed.availableLengthMm === 40));
  assert.throws(() => buildStudioEquilibriumInput({ feedTensionN: .05, initialStrain: .01 }), /inextensible/);
  assert.throws(() => buildStudioEquilibriumInput({ feedTensionN: 0 }), /positive tension/);
  assert.throws(() => buildStudioEquilibriumInput({ availableLengthMm: 1 }), /explicit feed/);
  assert.throws(() => buildStudioEquilibriumInput({ portSource: 'typo' as 'render' }), /Unknown port/);
});

it('a hidden material interval stays inside the assigned shell even when a coarse mesh has only its two ports', () => {
  const f = buildStudioEquilibriumInput({ stepMm: 5 });
  for (const row of f.rows) {
    const held = row.thread.nodes.flatMap((n, i) => n.fixed ? [i] : []);
    const entry = held[1], exit = held[2];
    assert.equal(exit, entry + 1);
    close(row.thread.segmentMinimumSphereRadiiMm[entry], f.bodyRadiusMm - f.parameters.foundationAllowanceMm + f.parameters.radiusMm);
  }
});
