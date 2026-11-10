// Offscreen-document-only progress forwarder (loaded by offscreen.html, and
// by nothing else — never by the Firefox worker or background page, so it
// cannot clobber their own __ctInpaintProgress hooks).
//
// The doc's ML handlers report inpaint progress through
// globalThis.__ctInpaintProgress, but on Chrome that hook was unset (no
// pipeline to report to), so a multi-minute tiled inpaint looked exactly
// like a stall. Forward each report to the service worker, which routes it
// into the run's progress bar. Each message is also a worker event, which
// resets the worker's idle timer — healthy long inpaints keep the worker
// alive. Throttled: at most one message per 500ms, plus the final 1.0.
import { MSG } from '../shared/contracts.js';

let lastSent = 0;
globalThis.__ctInpaintProgress = (runId, frac) => {
  try {
    const now = Date.now();
    if (frac < 1 && now - lastSent < 500) return;
    lastSent = now;
    chrome.runtime.sendMessage({ type: MSG.ML_INPAINT_PROGRESS, runId, frac }).catch(() => {});
  } catch { /* progress must never break inpaint */ }
};
