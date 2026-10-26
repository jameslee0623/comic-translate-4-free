// Firefox inpaint worker — CLASSIC worker (not module), see ml-bridge.js.
// Runs LaMa inpaint on its own thread so the background page's ML timeout
// can fire while WASM blocks. Reuses the offscreen handlers verbatim: same
// module, same IDB pixel bus and models, only the thread changes.
//
// Why classic: ort.min.js is a UMD bundle whose top-level `var ort` only
// becomes a global when loaded as a classic script. Importing it from a
// module worker keeps `ort` module-scoped, so offscreen.js's `ort.env`
// throws and the worker never starts (1018p bug: silent fallback to the
// same hanging in-process path). importScripts gives the worker a real
// `self.ort` global; the ESM handler module then loads via dynamic import.
// Relative URLs resolve against this worker's own URL.
importScripts('../offscreen/vendor/ort.min.js');

Promise.all([
  import('../offscreen/offscreen.js'),
  import('../shared/contracts.js'),
]).then(([offscreen, contracts]) => {
  const mlHandlers = offscreen.mlHandlers;
  const MSG = contracts.MSG;
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
  self.postMessage({ type: 'inpaint-ready' });
}).catch(() => {
  // Import failed (e.g. dynamic import unsupported): the page side falls
  // back to in-process inpaint on the ready timeout. Nothing else to do —
  // without the handlers this worker cannot run jobs.
});
