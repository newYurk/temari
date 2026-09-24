import { solveFirstVisitSnapshot, type FirstVisitSnapshot } from './first-visit-snapshot';

export type FirstVisitSnapshotMessage =
  | { kind: 'result'; snapshot: FirstVisitSnapshot }
  | { kind: 'error'; message: string };

self.onmessage = ({ data }: MessageEvent<{ kind: 'solve' }>) => {
  try {
    if (data?.kind !== 'solve') throw new Error('Unknown first-visit snapshot request.');
    // The snapshot API owns the bounded solver budget and acceptance policy.
    const snapshot = solveFirstVisitSnapshot();
    self.postMessage({ kind: 'result', snapshot } satisfies FirstVisitSnapshotMessage);
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) } satisfies FirstVisitSnapshotMessage);
  }
};
