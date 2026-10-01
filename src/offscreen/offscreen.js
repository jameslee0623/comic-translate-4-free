// Offscreen ML host: owns ALL onnxruntime-web sessions (detector,
// Baberu OCR, LaMa inpainter). The service worker orchestrates; this document only runs
// inference. Models are read from the shared IndexedDB ('ct-db'/'models').
// Verified: ort 1.30 threaded WASM runs here with numThreads=1 and no COOP/COEP
// (chrome-extension: pages get SharedArrayBuffer without crossOriginIsolated).
import { MSG, openDb, idbGet } from '../shared/contracts.js';
import { ALL_FILES, downloadFileToIdb, readChunked, ocrEngineForLang, BABERU_VOCAB_ASSET } from '../shared/model-specs.js';
import { Detector } from './ml/detector.js';
import { BaberuOCR } from './ml/baberu.js';
import { meanBrightness } from './ml/image-ops.js';
import { Inpainter } from './ml/inpaint.js';
import { pixelPut, pixelTake } from '../shared/pixel-bus.js';

ort.env.wasm.wasmPaths = chrome.runtime.getURL('src/offscreen/vendor/');
ort.env.wasm.numThreads = 1;

const detector = new Detector();
const baberu = new BaberuOCR();
const inpainter = new Inpainter();

// Drop loaded ORT sessions so the next inference re-reads model files from
// IndexedDB. group: 'detector' | 'ocr-baberu' | 'inpaint' | '*'.
function resetGroup(group) {
  if (group === 'detector' || group === '*') detector.reset();
  if (group === 'ocr-baberu' || group === '*') baberu.reset();
  if (group === 'inpaint' || group === '*') inpainter.reset();
}

let db = null;
async function getDb() {
  if (!db) db = await openDb();
  return db;
}

async function modelBuffer(id) {
  const db = await getDb();
  const rec = await idbGet(db, id);
  if (!rec) throw new Error(`model "${id}" not in local cache — download it from the popup first`);
  const spec = ALL_FILES.find(f => f.id === id);
  if (spec && spec.bytes && rec.bytes !== spec.bytes) {
    throw new Error(
      `cached model "${id}" is ${rec.bytes} bytes but should be ${spec.bytes} — ` +
      `it is the wrong file or a truncated download. Delete it in the popup and download it again.`);
  }
  if (rec.data) return rec.data; // single-record format (older builds)
  if (rec.chunks) return readChunked(db, id, rec); // chunked format
  throw new Error(`cached model "${id}" is corrupt — delete it in the popup and download it again`);
}

async function assetText(path) {
  return (await (await fetch(chrome.runtime.getURL(path))).text());
}

const loading = {};
async function ensureModel(kind) {
  // Await any in-flight load so inference never runs on a null session.
  if (loading[kind]) { await loading[kind]; return; }
  const p = (async () => {
    if (kind === 'detector' && !detector.loaded) {
      await detector.load(await modelBuffer('detector'));
    } else if (kind === 'ocr-baberu' && !baberu.loaded) {
      // Fetch + attach one graph at a time so the three buffers (121MB)
      // are never all resident at once.
      const vocabJson = await assetText(BABERU_VOCAB_ASSET);
      try {
        await baberu.loadVis(await modelBuffer('ocr-baberu-vision'));
        await baberu.loadPre(await modelBuffer('ocr-baberu-prefill'));
        await baberu.loadStep(await modelBuffer('ocr-baberu-step'));
      } catch (e) { baberu.reset(); throw e; }
      baberu.setVocab(vocabJson);
    } else if (kind === 'inpaint' && !inpainter.loaded) {
      await inpainter.load(await modelBuffer('inpaint'));
    }
  })();
  loading[kind] = p;
  try { await p; } finally { delete loading[kind]; }
}

// (pixel payloads now travel via the IDB pixel bus — see pixel-bus.js)

// Run ids whose ML work must stop ASAP (see ML_CANCEL). Checked between
// units of work. An entry is dropped when a handler finishes for a run that
// was NOT cancelled; a cancelled run keeps its flag so the NEXT ML stage of
// the same run aborts immediately instead of silently running to completion.
const cancelledRuns = new Set();
function throwIfCancelled(runId) {
  if (runId && cancelledRuns.has(runId)) throw new Error('cancelled');
}
function releaseRun(runId) {
  if (runId && !cancelledRuns.has(runId)) cancelledRuns.delete(runId);
}

const handlers = {
  [MSG.ML_PING]() {
    return { ok: true, loaded: { detector: detector.loaded, baberu: baberu.loaded, inpaint: inpainter.loaded } };
  },

  async [MSG.ML_ENSURE]({ model }) {
    await ensureModel(model);
    return { ok: true };
  },

  // Downloads run here (not the SW) so a long 197MB fetch can't be killed
  // mid-stream by service-worker shutdown.
  async [MSG.ML_DOWNLOAD]({ fileId }) {
    const spec = ALL_FILES.find(f => f.id === fileId);
    if (!spec) throw new Error('unknown model file ' + fileId);
    // Broadcast completion one-way: the SW's request/response channel does
    // not survive a service worker restart during a multi-minute download,
    // so the UI must not depend on this handler's return value.
    const announce = payload => chrome.runtime.sendMessage(
      { type: MSG.MODEL_PROGRESS, fileId, ...payload }).catch(() => {});
    try {
      const total = await downloadFileToIdb(spec.id, spec.url, (loaded, totalBytes) => {
        chrome.runtime.sendMessage({
          type: MSG.MODEL_PROGRESS, id: spec.group, fileId: spec.id,
          loaded, total: totalBytes,
        }).catch(() => {});
      });
      // Drop any session built from the old bytes so the fresh file is used.
      resetGroup(spec.group);
      announce({ done: true });
      return { ok: true, bytes: total };
    } catch (e) {
      console.error('[ct-dl] download failed for', fileId + ':',
        String((e && e.message) || e).slice(0, 200));
      announce({ error: String((e && e.message) || e) });
      throw e;
    }
  },

  // ML_RESET {group} — drop loaded sessions for a model group (used after
  // model delete / download so stale bytes are never reused).
  [MSG.ML_RESET]({ group }) {
    resetGroup(group || '*');
    return { ok: true };
  },

  // ML_CANCEL {runId} — mark a run's in-flight ML work for abortion. The
  // detect/ocr/inpaint handlers check this flag between units of work and
  // throw, so a cancelled run stops burning CPU instead of finishing a page
  // the user already left.
  [MSG.ML_CANCEL]({ runId }) {
    if (runId) {
      cancelledRuns.add(runId);
      // Bound the set: a run cancelled between ML stages keeps its flag (so
      // the next stage aborts) and would otherwise never be released. Sets
      // iterate in insertion order, so this drops the oldest entries first.
      while (cancelledRuns.size > 64) cancelledRuns.delete(cancelledRuns.values().next().value);
    }
    return { ok: true };
  },

  async [MSG.ML_DETECT]({ key, width, height, threshold, runId }) {
    throwIfCancelled(runId);
    await ensureModel('detector');
    throwIfCancelled(runId);
    const t0 = performance.now();
    // Pixel bytes arrive via the IDB pixel bus (see pixel-bus.js) — they do
    // not survive chrome.runtime messaging from the service worker.
    const raw = await pixelTake(key);
    const buf = new Uint8ClampedArray(raw);
    let boxes;
    try {
      boxes = await detector.detect(buf, width, height, threshold);
    } finally {
      releaseRun(runId);
    }
    throwIfCancelled(runId);
    return { ok: true, boxes, ms: Math.round(performance.now() - t0), inputMean: +meanBrightness(buf).toFixed(4) };
  },

  async [MSG.ML_OCR]({ crops, runId, sourceLang }) {
    throwIfCancelled(runId);
    // OCR engine follows the source language — all languages use Baberu.
    const engine = ocrEngineForLang(sourceLang || 'ja');
    await ensureModel(engine);
    throwIfCancelled(runId);
    const t0 = performance.now();
    const results = [];
    // Stddev of a crop's grayscale pixels, sampled every 4th pixel. A
    // near-uniform crop (detector false positive on flat background) scores
    // ~1-2 from JPEG noise alone; real text — even faint — scores 30+ from
    // stroke contrast, so 3.0 is far below any readable text.
    const cropStddev = (u8) => {
      let n = 0, mean = 0, m2 = 0;
      for (let i = 0; i < u8.length; i += 16) {
        const g = (u8[i] + u8[i + 1] + u8[i + 2]) / 3;
        n++;
        const d = g - mean;
        mean += d / n;
        m2 += d * (g - mean);
      }
      return n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
    };
    try {
      for (const c of crops) {
        throwIfCancelled(runId);
        const raw = await pixelTake(c.key);
        const u8 = new Uint8ClampedArray(raw);
        // Skip the model on blank crops: ~1ms variance check vs ~1s of
        // vision+prefill+autoregressive steps. Empty text flows downstream
        // exactly as if OCR had returned ''.
        if (cropStddev(u8) < 3.0) {
          results.push({ id: c.id, text: '', chars: 0, chunks: 0, hitCeiling: false, stopped: 'eos', skipped: true });
          continue;
        }
        // Baberu clips at ~64 chars (upstream training cap), so the chunked
        // path re-OCRs an over-long crop in overlapping pieces.
        const r = await baberu.ocrChunked(u8, c.width, c.height, {
          lang: sourceLang || 'ja',
          shouldAbort: () => cancelledRuns.has(runId),
        });
        results.push({ id: c.id, text: r.text, chars: r.text.length, chunks: r.chunks, hitCeiling: r.hitCeiling, stopped: r.stopped });
      }
    } finally {
      releaseRun(runId);
    }
    return { ok: true, results, ms: Math.round(performance.now() - t0), engine };
  },

  async [MSG.ML_INPAINT]({ patches, runId }) {
    throwIfCancelled(runId);
    await ensureModel('inpaint');
    throwIfCancelled(runId);
    const t0 = performance.now();
    const results = [];
    // Long inpaints report progress: the Firefox background page sets
    // globalThis.__ctInpaintProgress (same module scope there — see
    // background-ff.js/service-worker.js). The Chrome offscreen document has
    // no pipeline to report to, so the hook stays unset and this is a no-op.
    // Without it a multi-minute tiled inpaint looks exactly like a stall.
    const reportInpaint = (frac) => {
      try { if (globalThis.__ctInpaintProgress) globalThis.__ctInpaintProgress(runId, frac); } catch { /* never break inpaint */ }
    };
    try {
      for (const [pi, p] of patches.entries()) {
        throwIfCancelled(runId);
        const rgbaRaw = await pixelTake(p.key);
        const maskRaw = await pixelTake(p.maskKey);
        const out = await inpainter.inpaintPatch(
          new Uint8ClampedArray(rgbaRaw), new Uint8Array(maskRaw), p.width, p.height,
          () => cancelledRuns.has(runId),
          (done, total) => reportInpaint((pi + done / total) / patches.length));
        const resKey = p.key + ':out';
        await pixelPut(resKey, out.buffer);
        results.push({ id: p.id, key: resKey, width: p.width, height: p.height });
        reportInpaint((pi + 1) / patches.length);
      }
    } finally {
      releaseRun(runId);
    }
    return { ok: true, results, ms: Math.round(performance.now() - t0) };
  },
};

// Exported for the Firefox background page, which hosts the ML sessions
// in-process instead of in an offscreen document (see background-ff.js and
// ml-bridge.js). Chrome keeps using the message listener below.
export const mlHandlers = handlers;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg && msg.type];
  if (!fn) return false; // not ours
  (async () => {
    try {
      sendResponse(await fn(msg));
    } catch (e) {
      console.error('[offscreen]', e);
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async response
});
