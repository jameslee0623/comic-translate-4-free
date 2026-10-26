// Firefox inpaint worker — see ml-bridge.js for why this exists.
// Runs LaMa inpaint on its own thread so the background page's ML timeout
// can fire while WASM blocks. Reuses the offscreen handlers verbatim: same
// module, same IDB pixel bus and models, only the thread changes.
// Load order matters: the UMD ORT build must evaluate first so the `ort`
// global exists when offscreen.js configures it.
import '../offscreen/vendor/ort.min.js';
import { mlHandlers } from '../offscreen/offscreen.js';
import { MSG } from '../shared/contracts.js';

// The handler reports progress through this hook — forward it to the page.
globalThis.__ctInpaintProgress = (runId, frac) => {
  try { self.postMessage({ type: 'inpaint-progress', runId, frac }); } catch {}
};

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== MSG.ML_INPAINT) return;
  try {
    const res = await mlHandlers[MSG.ML_INPAINT](msg);
    self.postMessage({ runId: msg.runId, ok: true, results: res.results, ms: res.ms });
  } catch (err) {
    self.postMessage({ runId: msg.runId, ok: false, error: String((err && err.message) || err) });
  }
};
