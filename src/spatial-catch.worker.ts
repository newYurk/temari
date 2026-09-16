import { computeLowerKagari } from './components/temari/computed-lower-kagari';

self.onmessage = () => {
  try { self.postMessage(computeLowerKagari()); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
