// ML host bridge: how the pipeline reaches the ONNX sessions.
// - Chrome: an offscreen document hosts the sessions; calls go over
//   chrome.runtime messaging (pixel bytes travel via the IDB pixel bus).
// - Firefox: no offscreen API — the background page itself is the ML host,
//   so calls run in-process through the handlers registered by
//   background-ff.js (globalThis.__ctMlHandlers).
import { MSG } from '../shared/contracts.js';

export function directHandlers() {
  return (typeof globalThis !== 'undefined' && globalThis.__ctMlHandlers) || null;
}

export async function mlHostAlive() {
  const direct = directHandlers();
  if (direct) {
    try {
      const r = await direct[MSG.ML_PING]({});
      return !!(r && r.ok);
    } catch { return false; }
  }
  try {
    const r = await chrome.runtime.sendMessage({ type: MSG.ML_PING });
    return !!(r && r.ok);
  } catch { return false; }
}

// Serializes offscreen-document creation: two concurrent callMl()s can both
// see !alive and both call createDocument; the second throws "Only one
// offscreen document". The loser waits for (or reaps) the winner's document.
let creatingPromise = null;
export async function ensureMlHost() {
  if (await mlHostAlive()) return;
  if (directHandlers()) return; // Firefox: the host is this page; handlers are ready.
  if (typeof chrome.offscreen === 'undefined') {
    throw new Error('this browser does not support offscreen documents — ML cannot run');
  }
  // Two concurrent callMl()s can both see !alive and both call createDocument;
  // the second throws "Only one offscreen document". Serialize creation so the
  // loser waits for (or reaps the benefit of) the winner's document.
  if (!creatingPromise) {
    creatingPromise = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: 'src/offscreen/offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Host ONNX Runtime Web (WASM) sessions for manga translation models',
        });
      } catch (e) {
        // "Only one offscreen document" / "already exists" means someone else
        // won the race — treat as success and verify below.
        if (!/already|only one/i.test(String((e && e.message) || e))) throw e;
      }
      // Poll for readiness: creation resolves before the document's scripts run.
      for (let i = 0; i < 10; i++) {
        if (await mlHostAlive()) return;
        await new Promise(r => setTimeout(r, 200));
      }
      throw new Error('ML host failed to start');
    })().finally(() => { creatingPromise = null; });
  }
  await creatingPromise;
}

// ORT's wasm backend aborts with "Aborted(InternalError: out of memory)"
// when its linear memory can't grow, which InferenceSession.create reports
// as "no available backend found". The raw text means nothing to a user, so
// translate that signature into an actionable message. `type` names the model
// group that was running so the message says which stage ran out of memory.
const ML_GROUP_FOR_TYPE = {
  [MSG.ML_DETECT]: 'text detector',
  [MSG.ML_OCR]: 'OCR',
  [MSG.ML_INPAINT]: 'inpainter',
  [MSG.ML_ENSURE]: 'model',
};
const OOM_RE = /out of memory|no available backend|aborted\s*\(/i;
function mlHostError(type, raw) {
  const m = String((raw && raw.message) || raw || '');
  if (OOM_RE.test(m)) {
    const group = ML_GROUP_FOR_TYPE[type] || 'translation engine';
    // Firefox runs the sessions in-process in the background page; Chrome
    // gives them a dedicated offscreen process, so Firefox hits this sooner.
    // Note: the ML host already tried freeing unused models and retrying —
    // if this still fires, the browser is genuinely out of memory.
    const where = directHandlers()
      ? ' On Firefox the translation models share the background page\u2019s memory (Chrome runs them in a separate process), so this limit is hit sooner.'
      : '';
    return new Error(`Out of memory while running the ${group} — the browser could not free enough memory even after unloading unused models. Restart the browser and try again.${where}`);
  }
  return new Error('ML host error: ' + m.slice(0, 160));
}

// Per-stage timeouts for ML calls (ms). A hung WASM session or dead
// offscreen document would otherwise wedge the run forever — the await
// never resolves, the run entry leaks, pixel payloads accumulate, and
// Cancel can't help because runPipeline's finally never runs.
const ML_TIMEOUT_MS = {
  [MSG.ML_DETECT]: 30 * 1000,
  [MSG.ML_OCR]: 60 * 1000,
  [MSG.ML_INPAINT]: 120 * 1000,
};
const ML_TIMEOUT_DEFAULT_MS = 90 * 1000;

// Attempt tracking per (runId, type, key): if a callMl times out and the
// caller retries the same ML op, the retry must not reuse the timed-out
// call's pixel keys — a late completion could otherwise clobber the retry's
// payload (notably inpaint's `:out` result keys). The attempt number rides
// along in msg.attempt; handlers namespace their output keys when > 1.
const mlAttempts = new Map(); // `${runId}::${type}::${key}` -> count
function nextAttempt(msg) {
  const k = `${msg.runId || ''}::${msg.type}::${msg.key || ''}`;
  const n = (mlAttempts.get(k) || 0) + 1;
  mlAttempts.set(k, n);
  // Bound the map: runs are short-lived; drop the oldest entry first
  // (Maps iterate in insertion order).
  if (mlAttempts.size > 512) mlAttempts.delete(mlAttempts.keys().next().value);
  return n;
}

// ---------------------------------------------------------------- Firefox inpaint worker
// LaMa inpaint on its own thread (Firefox only). On Firefox the ML host
// lives in the background page, so a tile's synchronous WASM run blocks the
// page's main thread — and callMl's timeout lives on that same thread, so
// it can never fire: silent hang, no message. In a worker, the page's timer
// fires while the worker computes, so a stuck inpaint becomes a timeout
// error instead of silence. The worker reuses the offscreen handlers
// verbatim (same module, same IDB pixel bus and models) — only the thread
// changes. Chrome never reaches this: directHandlers() is null there and
// inpaint keeps going through the offscreen document.
let inpaintWorker = null;
const inpaintPending = new Map(); // runId -> {resolve, reject}
const INPAINT_WORKER_FALLBACK = 'inpaint worker unavailable — falling back to in-process';

function inpaintWorkerFallbackError() {
  return Object.assign(new Error(INPAINT_WORKER_FALLBACK), { inpaintWorkerFallback: true });
}

function killInpaintWorker() {
  try { inpaintWorker?.terminate(); } catch {}
  inpaintWorker = null;
}

function failInpaintPending(errFactory) {
  const pend = [...inpaintPending.values()];
  inpaintPending.clear();
  for (const p of pend) {
    try { p.reject(errFactory()); } catch {}
  }
}

function ensureInpaintWorker() {
  if (inpaintWorker) return inpaintWorker;
  const w = new Worker(chrome.runtime.getURL('src/background/inpaint-worker.js'), { type: 'module' });
  inpaintWorker = w;
  w.onmessage = (e) => {
    const d = e.data;
    if (!d) return;
    if (d.type === 'inpaint-progress') {
      try { globalThis.__ctInpaintProgress?.(d.runId, d.frac); } catch {}
      return;
    }
    if (d.runId == null) return;
    const p = inpaintPending.get(d.runId);
    if (!p) return;
    inpaintPending.delete(d.runId);
    if (d.ok) p.resolve({ ok: true, results: d.results, ms: d.ms });
    else p.reject(inpaintWorkerFallbackError());
  };
  w.onerror = () => {
    if (inpaintWorker !== w) return; // stale worker (already replaced)
    // Load/startup failure (bad import, missing file): fall back to
    // in-process handlers for every pending call. A mid-run crash also
    // lands here; falling back re-runs all patches from the still-staged
    // originals, which is safe.
    failInpaintPending(inpaintWorkerFallbackError);
    killInpaintWorker();
  };
  return w;
}

async function runInpaintViaWorker(msg) {
  let w;
  try {
    w = ensureInpaintWorker();
  } catch (e) {
    throw inpaintWorkerFallbackError();
  }
  return await new Promise((resolve, reject) => {
    inpaintPending.set(msg.runId, { resolve, reject });
    try {
      w.postMessage(msg);
    } catch (e) {
      failInpaintPending(inpaintWorkerFallbackError);
      killInpaintWorker();
    }
  });
}

// Best-effort abort of a run's in-flight ML work. Used when callMl times out:
// the inner op keeps running past the Promise.race, so without this a late
// completion could still burn CPU / write pixel payloads for a dead run.
// Fire-and-forget — the host itself may be hung, and we're already failing.
function cancelMlRun(runId) {
  if (!runId) return;
  // Timeout path only (sole caller is callMl's timer): a stuck inpaint
  // worker must be terminated — a cancel message would queue behind the
  // blocked WASM run and never be processed. Pending runs on the shared
  // worker fail with a message (rare; they can retry). Other ML types
  // keep the graceful ML_CANCEL below.
  if (inpaintWorker && inpaintPending.has(runId)) {
    killInpaintWorker();
    failInpaintPending(() => new Error('inpaint worker stopped'));
  }
  try {
    const direct = directHandlers();
    if (direct && direct[MSG.ML_CANCEL]) {
      direct[MSG.ML_CANCEL]({ runId });
      return;
    }
  } catch { /* fall through to messaging */ }
  try {
    chrome.runtime.sendMessage({ type: MSG.ML_CANCEL, runId }).catch(() => {});
  } catch { /* host unreachable */ }
}

// Call one ML_* handler. Mirrors the old callOffscreen contract: resolves
// with the handler's payload, throws a human message on failure.
export async function callMl(msg) {
  const timeoutMs = ML_TIMEOUT_MS[msg.type] || ML_TIMEOUT_DEFAULT_MS;
  const attempt = nextAttempt(msg);
  const effMsg = attempt > 1 ? { ...msg, attempt } : msg;
  let timer = null;
  const timeoutP = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // Stop the runaway op first: without this it keeps running past the
      // race and could complete late (stale pixelPut, double resource use).
      cancelMlRun(msg.runId);
      const group = ML_GROUP_FOR_TYPE[msg.type] || 'ML';
      const err = new Error(`ML host timed out during ${group} after ${timeoutMs / 1000}s — the model may be stuck. Try again; if it repeats, restart the browser.`);
      err.mlTimeout = true;
      err.mlType = msg.type;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([callMlInner(effMsg), timeoutP]);
  } finally {
    clearTimeout(timer);
  }
}

async function callMlInner(msg) {
  const direct = directHandlers();
  if (direct && msg.type === MSG.ML_INPAINT) {
    // Firefox inpaint goes to the worker (see above). Any worker failure
    // (startup, crash, error reply) falls back to the in-process handlers
    // — except termination, which only happens on timeout/cancel, where
    // falling back would defeat the timeout.
    try {
      const res = await runInpaintViaWorker(msg);
      if (!res || res.ok === false) throw new Error('inpaint worker did not respond');
      return res;
    } catch (e) {
      if (e && e.inpaintWorkerFallback) {
        // Fall through to in-process handlers below.
      } else {
        throw mlHostError(msg.type, e);
      }
    }
  }
  if (direct) {
    const fn = direct[msg.type];
    if (!fn) throw new Error('ML host has no handler for ' + msg.type);
    let res;
    try {
      res = await fn(msg);
    } catch (e) {
      throw mlHostError(msg.type, e);
    }
    if (!res) throw new Error('ML host did not respond');
    if (res.ok === false) throw mlHostError(msg.type, res.error);
    return res;
  }
  await ensureMlHost();
  let res;
  try {
    res = await chrome.runtime.sendMessage(msg);
  } catch (e) {
    throw new Error('ML host unreachable: ' + String(e).slice(0, 120));
  }
  if (!res) throw new Error('ML host did not respond');
  if (res.ok === false) throw mlHostError(msg.type, res.error);
  return res;
}

// Canvas that works in a service worker (OffscreenCanvas) and in a
// background page (regular <canvas> — e.g. Firefox).
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), type, quality);
  });
}
// WebP for cache/transport: browsers' canvas API only produces lossy WebP
// (no lossless mode), but at 0.95 it's visually indistinguishable from PNG
// on manga art, ~60% smaller, and faster to encode than PNG's deflate.
export const WEBP_TYPE = 'image/webp';
export const WEBP_QUALITY = 0.95;
