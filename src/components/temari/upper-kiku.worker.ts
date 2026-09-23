import { computeUpperKiku } from './upper-kiku';
import { auditUpperMeshes, type UpperSource, type UpperWorkerMessage } from './upper-kiku-display';

declare const __UPPER_SOURCE__: UpperSource;
const send = (message: UpperWorkerMessage) => self.postMessage(message);

self.onmessage = () => {
  try {
    const result = computeUpperKiku(message => send({ kind: 'progress', message }));
    send({ kind: 'progress', message: 'Проверка треугольников отображаемой нити.' });
    send({ kind: 'result', snapshot: { version: 1, source: __UPPER_SOURCE__, result, mesh: auditUpperMeshes(result) } });
  } catch (error) {
    console.error('Upper Kiku calculation failed', error);
    send({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
