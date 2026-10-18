// Web Worker for translation (Firefox).
// Runs on its own thread, so the network I/O and response processing are not
// blocked when the main thread is hogged by WASM inpaint.
import { translateBlocks } from './translators.js';

self.onmessage = async (e) => {
  const { blocks, settings } = e.data;
  try {
    // 170s deadline: under the SW's 180s worker kill, so a hung LM Studio
    // server can't hold the worker past its termination.
    // Forward failover notices so the SW can show a pill.
    const onProgress = (p) => {
      if (p && p.failoverFrom && p.failoverTo) {
        self.postMessage({ type: 'failover-notice', failoverFrom: p.failoverFrom, failoverTo: p.failoverTo });
      }
    };
    const translated = await translateBlocks(blocks, settings, onProgress, null, 170000);
    self.postMessage({ ok: true, translated, backendUsed: blocks[0]?.backendUsed });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
