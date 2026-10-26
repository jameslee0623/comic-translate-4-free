// Firefox ML worker — CLASSIC worker (not module), see ml-bridge.js.
// Runs ALL ML compute (detect, OCR, inpaint, ensure, cancel) on its own
// thread so the background page (main thread) stays free to monitor,
// time, and restart it. Reuses the offscreen handlers verbatim: same
// module, same IDB pixel bus and models, only the thread changes.
//
// Why classic: ort.min.js is UMD, and its top-level `var ort` only
// becomes a global via a classic script load. A module worker kept `ort`
// module-scoped, so offscreen.js threw at import and the worker never
// started (1018p bug). importScripts gives the worker a real `self.ort`
// global; the ESM handler module then loads via dynamic import.
// Relative URLs resolve against this worker's own URL.
importScripts('../offscreen/vendor/ort.min.js');

Promise.all([
  import('../offscreen/offscreen.js'),
  import('../shared/contracts.js'),
]).then(([offscreen, contracts]) => {
  const mlHandlers = offscreen.mlHandlers;
  const MSG = contracts.MSG;
  // The inpaint handler reports progress through this hook — forward it
  // to the page (only inpaint reports progress; other handlers never call it).
  globalThis.__ctInpaintProgress = (runId, frac) => {
    try { self.postMessage({ type: 'inpaint-progress', runId, frac }); } catch {}
  };
  self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;
    try {
      const fn = mlHandlers[msg.type];
      if (!fn) throw new Error('ML worker has no handler for ' + msg.type);
      const res = await fn(msg);
      self.postMessage({ callId: msg.callId, runId: msg.runId, ok: true, res });
    } catch (err) {
      self.postMessage({ callId: msg.callId, runId: msg.runId, ok: false, error: String((err && err.message) || err) });
    }
  };
  self.postMessage({ type: 'ml-ready' });
}).catch(() => {
  // Import failed (e.g. dynamic import unsupported): the page side falls
  // back to in-process compute on the ready timeout. Nothing else to do —
  // without the handlers this worker cannot run jobs.
});
