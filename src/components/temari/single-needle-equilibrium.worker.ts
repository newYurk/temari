import { solveSingleNeedleEquilibrium, type SingleNeedleEquilibrium,
  type SingleNeedleEquilibriumOptions } from './single-needle-equilibrium';

export type SingleNeedleEquilibriumMessage =
  | { kind: 'result'; equilibrium: SingleNeedleEquilibrium }
  | { kind: 'error'; message: string };

self.onmessage = ({ data }: MessageEvent<{ kind: 'solve'; options: SingleNeedleEquilibriumOptions }>) => {
  try {
    if (data.kind !== 'solve') throw new Error('Unknown single-needle equilibrium request.');
    const equilibrium = solveSingleNeedleEquilibrium(data.options, {
      maxOuterIterations: 6,
      maxIterationsPerOuter: 100,
      gradientToleranceN: 1e-5,
      penetrationToleranceMm: 1e-4,
    });
    self.postMessage({ kind: 'result', equilibrium } satisfies SingleNeedleEquilibriumMessage);
  } catch (error) {
    self.postMessage({ kind: 'error',
      message: error instanceof Error ? error.message : String(error) } satisfies SingleNeedleEquilibriumMessage);
  }
};
