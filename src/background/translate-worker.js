// Web Worker for translation (Firefox).
// Runs on its own thread, so the network I/O and response processing are not
// blocked when the main thread is hogged by WASM inpaint.
import { translateBlocks } from './translators.js';

self.onmessage = async (e) => {
  const { blocks, settings } = e.data;
  try {
    // 170s deadline: under the SW's 180s worker kill, so a hung LM Studio
    // server can't hold the worker past its termination.
    const translated = await translateBlocks(blocks, settings, null, null, 170000);
    self.postMessage({ ok: true, translated });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
