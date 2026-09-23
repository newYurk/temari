import { auditUpperBundle, type UpperBundle } from './upper-bundle';

export type UpperBundleAudit = ReturnType<typeof auditUpperBundle>;
export type UpperBundleMessage = { kind: 'audit'; audit: UpperBundleAudit } | { kind: 'error'; message: string };

self.onmessage = ({ data }: MessageEvent<{ kind: 'audit'; bundle: UpperBundle }>) => {
  try {
    if (data.kind !== 'audit') throw new Error('Unknown upper-bundle worker request.');
    // Audit the supplied displayed snapshot, never rebuild a different path.
    self.postMessage({ kind: 'audit', audit: auditUpperBundle(data.bundle) } satisfies UpperBundleMessage);
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) } satisfies UpperBundleMessage);
  }
};
