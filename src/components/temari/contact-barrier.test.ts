import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactBarrier } from './contact-barrier';

const close = (actual: number, expected: number, relativeTolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= relativeTolerance * Math.max(Math.abs(expected), 1e-14),
    `${actual} differs from ${expected}`);

describe('normalized compact contact barrier', () => {
  it('matches independent finite differences of the energy for both derivatives', () => {
    for (const h of [.025, .8, 3]) for (const mu of [.0002, 1.7]) for (const fraction of [.03, .2, .55, .85]) {
      const g = h * fraction, epsilon = Math.min(g, h - g) * 1e-4;
      // The dimensional energy expression is independent of the implementation's
      // normalized variables and analytic force/stiffness formulas.
      const energy = (gap: number) => -mu * ((gap - h) / h) ** 2 * Math.log(gap / h);
      const middle = energy(g), left = energy(g - epsilon), right = energy(g + epsilon);
      const result = contactBarrier(g, h, mu);
      assert.equal(result.valid, true); assert.ok(result.forceN > 0 && result.stiffnessNPerMm > 0);
      close(result.energyNmm, middle, 1e-12);
      close(result.forceN, -(right - left) / (2 * epsilon), 2e-7);
      close(result.stiffnessNPerMm, (right - 2 * middle + left) / epsilon ** 2, 1e-5);
    }
  });

  it('joins the inactive branch with zero energy and first two derivatives', () => {
    const h = .4, mu = .3;
    for (const gap of [h, h * 1.01, h * 4]) {
      assert.deepEqual(contactBarrier(gap, h, mu), { valid: true, energyNmm: 0, forceN: 0, stiffnessNPerMm: 0 });
    }
    // As g/h = 1-d approaches activation: E=O(d³), F=O(d²), K=O(d).
    for (const d of [1e-3, 1e-6, 1e-9]) {
      const value = contactBarrier(h * (1 - d), h, mu);
      assert.equal(value.valid, true);
      assert.ok(value.energyNmm > 0 && value.energyNmm < 2 * mu * d ** 3);
      assert.ok(value.forceN > 0 && value.forceN < 4 * mu / h * d ** 2);
      assert.ok(value.stiffnessNPerMm > 0 && value.stiffnessNPerMm < 8 * mu / h ** 2 * d);
    }
  });

  it('scales as energy, force and stiffness when length or energy units change', () => {
    const g = .07, h = .3, mu = .005, initial = contactBarrier(g, h, mu);
    for (const lengthScale of [.001, 1000]) {
      const scaled = contactBarrier(lengthScale * g, lengthScale * h, mu);
      assert.equal(scaled.valid, true);
      close(scaled.energyNmm, initial.energyNmm, 1e-12);
      close(scaled.forceN, initial.forceN / lengthScale, 1e-12);
      close(scaled.stiffnessNPerMm, initial.stiffnessNPerMm / lengthScale ** 2, 1e-12);
    }
    const triple = contactBarrier(g, h, 3 * mu);
    close(triple.energyNmm, 3 * initial.energyNmm, 1e-12);
    close(triple.forceN, 3 * initial.forceN, 1e-12);
    close(triple.stiffnessNPerMm, 3 * initial.stiffnessNPerMm, 1e-12);
  });

  it('rejects invalid domains and nonfinite arithmetic without a false zero-force result', () => {
    const invalid = { valid: false, energyNmm: Infinity, forceN: Infinity, stiffnessNPerMm: Infinity };
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(contactBarrier(bad, .2, .01), invalid);
      assert.deepEqual(contactBarrier(.1, bad, .01), invalid);
      assert.deepEqual(contactBarrier(.1, .2, bad), invalid);
    }
    assert.deepEqual(contactBarrier(Number.MIN_VALUE, 1, 1), invalid);
    // The inactive branch must not hide an invalid coefficient.
    assert.deepEqual(contactBarrier(2, 1, Infinity), invalid);
  });
});
