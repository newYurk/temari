export type ContactBarrierEvaluation = {
  valid: boolean;
  energyNmm: number;
  /** Repulsion magnitude: -dE/dg. Multiply by the gap gradient for force. */
  forceN: number;
  /** Scalar d²E/dg², not the full spatial contact Hessian. */
  stiffnessNPerMm: number;
};

/** Compact C2 log barrier in the positive clearance g (mm).
 *
 * E = mu * [-(g/h - 1)^2 log(g/h)] for 0 < g < h; zero for g >= h.
 * This is the shape in IPC Eq. 6, divided by h² and scaled by mu:
 * https://ipc-sim.github.io/file/IPC-paper-fullRes.pdf
 * h is a numerical activation distance; mu is a numerical energy scale.
 * Neither is a material law. This scalar function implements neither IPC's
 * solver nor continuous collision detection and provides no trajectory guarantee.
 * Invalid inputs or arithmetic fail closed, including nonpositive clearance.
 */
export function contactBarrier(gapMm: number, activationDistanceMm: number,
  barrierEnergyNmm: number): ContactBarrierEvaluation {
  const invalid = (): ContactBarrierEvaluation => ({ valid: false,
    energyNmm: Infinity, forceN: Infinity, stiffnessNPerMm: Infinity });
  if (![gapMm, activationDistanceMm, barrierEnergyNmm].every(value => Number.isFinite(value) && value > 0)) {
    return invalid();
  }
  if (gapMm >= activationDistanceMm) return { valid: true, energyNmm: 0, forceN: 0, stiffnessNPerMm: 0 };

  const x = gapMm / activationDistanceMm;
  const u = (activationDistanceMm - gapMm) / activationDistanceMm;
  // Near activation use log1p to retain the small positive energy and its
  // derivatives. Near zero, log(x) avoids rounding u to exactly one.
  const logX = x > .5 ? Math.log1p(-u) : Math.log(x);
  const ratio = u / x;
  const energyNmm = -barrierEnergyNmm * u * u * logX;
  const forceN = (barrierEnergyNmm / activationDistanceMm) * (u * ratio - 2 * u * logX);
  const stiffnessNPerMm = (barrierEnergyNmm / activationDistanceMm / activationDistanceMm)
    * (-2 * logX + 4 * ratio + ratio * ratio);
  if (![energyNmm, forceN, stiffnessNPerMm].every(value => Number.isFinite(value) && value >= 0)) return invalid();
  return { valid: true, energyNmm, forceN, stiffnessNPerMm };
}
