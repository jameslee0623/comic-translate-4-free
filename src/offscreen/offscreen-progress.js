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

// GPU OCR progress (2.1.6): same shape as inpaint, separate throttle
// state — OCR and inpaint never run at the same time, but a shared
// timer would drop OCR events right after inpaint ones. The SW uses
// these only to re-arm the GPU OCR watchdog; the pill shows no
// per-crop OCR progress (it never did on the WASM path either).
let lastOcrSent = 0;
globalThis.__ctOcrProgress = (runId, frac) => {
  try {
    const now = Date.now();
    if (frac < 1 && now - lastOcrSent < 500) return;
    lastOcrSent = now;
    chrome.runtime.sendMessage({ type: MSG.ML_OCR_PROGRESS, runId, frac }).catch(() => {});
  } catch { /* progress must never break OCR */ }
};
