// Model inventory: exact HuggingFace artifacts (verified 2026-09-27).
// Downloaded on first use into IndexedDB ('ct-db'/'models'), never bundled.
import { openDb, idbGet, idbPut, idbDel, idbKeys, MSG } from './contracts.js';

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

export const MODEL_GROUPS = [
  {
    id: 'detector', labelKey: 'model_detector', label: 'Bubble/text detector (RT-DETR-v2)', required: true,
    files: [
      { id: 'detector', file: 'detector-v4-s_int8.onnx', bytes: 11120765,
        url: hf('ogkalu/comic-text-and-bubble-detector', 'detector-v4-s_int8.onnx') },
    ],
  },
  {
    id: 'inpaint', labelKey: 'model_inpaint', label: 'LaMa manga inpainter', required: true,
    files: [
      { id: 'inpaint', file: 'lama-manga-dynamic.onnx', bytes: 206291843,
        url: hf('ogkalu/lama-manga-onnx-dynamic', 'lama-manga-dynamic.onnx') },
    ],
  },
  {
    id: 'ocr-baberu', labelKey: 'model_baberu', label: 'Baberu OCR (Japanese + English + Chinese Simplified/Traditional, manga-trained)',
    files: [
      // v1.2 (2026-10-26): retrained with Manga109-s human labels (sound
      // effects 50%->74%, handwriting 60%->67%). All three files change,
      // but sizes are IDENTICAL to v1.1 (quantization fixes them) — so the
      // IDs bump (-v12): the downloader skips files whose cached size
      // matches, and same IDs would silently keep v1.1 weights.
      { id: 'ocr-baberu-vision-v12', file: 'vision_int4.onnx', bytes: 52293486,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/vision_int4.onnx') },
      { id: 'ocr-baberu-prefill-v12', file: 'decoder_prefill_int8.onnx', bytes: 35133596,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/decoder_prefill_int8.onnx') },
      { id: 'ocr-baberu-step-v12', file: 'decoder_step_int8.onnx', bytes: 34715466,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/decoder_step_int8.onnx') },
    ],
  },
];

// OCR engine routing by source language (LANGS in shared/settings.js):
//   ja/en/zh-CN/zh-TW -> Baberu ('ocr-baberu' group; manga-trained)
// (manga-ocr removed 2026-09-29: superseded by Baberu for Japanese.
// Pororo + PP-OCRv5 en/chinese models removed 2026-09-28: superseded.
// PP-OCRv6 small removed 2026-09-29: Baberu covers Traditional Chinese.
// PP-OCRv5 Korean removed 2026-09-29: OCR quality too low for translation.)
export function ocrEngineForLang(lang) {
  return 'ocr-baberu'; // all source languages use Baberu
}

// Baberu character vocab, bundled (JSON array; id>=4 -> charset[id-4]).
// From genshiai-daichi/baberu-ocr tokenizer/vocab.json.
export const BABERU_VOCAB_ASSET = 'src/offscreen/ml/dicts/baberu-vocab.json';

export const ALL_FILES = MODEL_GROUPS.flatMap(g =>
  g.files.map(f => ({ ...f, group: g.id, groupLabel: g.label })));

export async function getModelStatus() {
  const db = await openDb();
  const keys = await idbKeys(db).catch(() => []);
  const chunkCount = (fileId) => {
    let n = 0;
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(fileId + '#')) n++;
    }
    return n;
  };
  const out = [];
  for (const g of MODEL_GROUPS) {
    const files = [];
    let done = true, sizeMismatch = false;
    for (const f of g.files) {
      const rec = await idbGet(db, f.id);
      // 2.2.12: "downloaded" requires the chunks to actually be present —
      // a manifest with correct bytes but missing chunks is an orphaned
      // manifest, not a usable model. Without this the UI shows "✓
      // downloaded" for a model that fails at run time.
      let downloaded = false;
      const bytesOk = !!rec && rec.bytes === f.bytes;
      if (rec && bytesOk) {
        if (rec.data) downloaded = true;
        else if (typeof rec.chunks === 'number') downloaded = chunkCount(f.id) >= rec.chunks;
        else downloaded = false;
      }
      files.push({
        id: f.id, file: f.file, bytes: rec ? rec.bytes : 0,
        expectedBytes: f.bytes, downloaded, bytesOk,
      });
      if (!downloaded) { done = false; continue; }
      if (!bytesOk) { done = false; sizeMismatch = true; }
    }
    out.push({ id: g.id, label: g.label, labelKey: g.labelKey, required: !!g.required, downloaded: done, sizeMismatch, files });
  }
  return out;
}

// Download state for auto-download (2.2.2): per-file progress, including
// in-progress files whose manifest is not written yet. A file with chunk
// records but no manifest is mid-download; loaded is estimated from the
// 8MB chunk count, capped at the expected size. A manifest with the wrong
// byte count is stale (a newer file version), not done — it needs a full
// re-download, so loaded is 0 for it.
// 2.2.12: totalBytes/loadedBytes cover ALL files, not just the missing
// ones — the old missing-only sums made the pill percent go BACKWARDS
// each time a file completed (a finished file dropped out of both sums).
// 2.2.12: a manifest claiming "done" is only trusted when its chunks are
// actually present — an orphaned manifest (correct bytes, missing chunks)
// is treated as not done so it re-downloads instead of failing at run
// time with "missing chunk".
export async function getModelDownloadState() {
  const db = await openDb();
  const keys = await idbKeys(db).catch(() => []);
  const chunkCount = (fileId) => {
    let n = 0;
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(fileId + '#')) n++;
    }
    return n;
  };
  const files = [];
  for (const f of ALL_FILES) {
    const rec = await idbGet(db, f.id).catch(() => null);
    let done = false, loaded = 0, started = false;
    if (rec && rec.bytes === f.bytes) {
      if (rec.data) {
        done = true; // legacy single-record format: the data is the file
        loaded = f.bytes;
      } else if (typeof rec.chunks === 'number') {
        // Chunked format: trust "done" only when every chunk is present.
        if (chunkCount(f.id) >= rec.chunks) {
          done = true;
          loaded = f.bytes;
        } else {
          started = true;
          loaded = Math.min(chunkCount(f.id) * IDB_CHUNK, f.bytes);
        }
      } else {
        // Manifest with no chunk count and no data: cannot verify — re-download.
        started = true;
      }
    } else {
      const n = chunkCount(f.id);
      if (n > 0) {
        started = true;
        loaded = Math.min(n * IDB_CHUNK, f.bytes);
      }
    }
    files.push({ id: f.id, group: f.group, file: f.file, bytes: f.bytes, loaded, done, started });
  }
  const missing = files.filter(f => !f.done);
  return {
    files,
    missing,
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    loadedBytes: files.reduce((a, f) => a + f.loaded, 0),
  };
}

export async function deleteModelGroup(groupId) {
  const db = await openDb();
  const g = MODEL_GROUPS.find(x => x.id === groupId);
  if (!g) return;
  for (const f of g.files) {
    // 2.2.12: delete chunks by key prefix even when there is no manifest
    // (a mid-download file has chunks but no manifest — the old code left
    // them behind forever).
    await deleteChunksByPrefix(db, f.id);
    await idbDel(db, f.id);
  }
}

// One-time cleanup for model files whose groups were removed from
// MODEL_GROUPS (Latin/Russian PP-OCRv5, 2026-09-28; Pororo + PP-OCRv5
// en/chinese, superseded 2026-09-28; manga-ocr encoder/decoder, superseded
// 2026-09-29 by Baberu): with no group row left in the UI
// there'd be no way to delete them otherwise.
// Baberu v1.0 decoders (2026-10-06): superseded by v1.1 (-v11 IDs); pruned
// before the v1.1 download so users don't carry ~70MB of stale weights.
// Baberu v1.1 files (2026-10-26): superseded by v1.2 (-v12 IDs); pruned
// before the v1.2 download so users don't carry ~122MB of stale weights.
const PRUNED_MODEL_IDS = ['ocr-ppocr-latin', 'ocr-ppocr-eslav', 'ocr-pororo', 'ocr-ppocr-en', 'ocr-ppocr-chinese', 'ocr-ppocrv6', 'ocr-ppocr-ko', 'ocr-encoder', 'ocr-decoder-init', 'ocr-decoder-step', 'ocr-baberu-prefill', 'ocr-baberu-step', 'ocr-baberu-vision', 'ocr-baberu-prefill-v11', 'ocr-baberu-step-v11'];
export { PRUNED_MODEL_IDS };
// Fingerprint of the model list (group + file IDs + expected sizes).
// URLs are excluded on purpose: a URL-only change needs no re-download
// (the downloader skips on matching size), while an ID or size change
// means a new or changed file must be downloaded. Used by the SW's
// onInstalled handler to lead the user to the models section only when
// an update actually makes a download necessary.
export function computeModelFingerprint() {
  return JSON.stringify(MODEL_GROUPS.map(g => [g.id, g.files.map(f => [f.id, f.file, f.bytes])]));
}
export async function pruneModelIds(ids) {
  const db = await openDb();
  for (const id of ids) {
    try {
      // 2.2.12: delete the chunks by key prefix even when there is no
      // manifest — a mid-download file has chunk records but no manifest
      // (it is written last), and the old `if (!rec) continue` deleted
      // zero chunks, so the stall "prune and restart" was a no-op.
      await deleteChunksByPrefix(db, id);
      await idbDel(db, id);
    } catch { /* best effort */ }
  }
}

// ---- chunked model storage ----
// A model file is stored as N fixed-size IDB records plus a small manifest:
//   { id: fileId, bytes, chunks, downloadedAt }   <- manifest (written last)
//   { id: `${fileId}#${i}`, data: ArrayBuffer }    <- chunk i (8 MB each)
// A single IDB value as large as a model file (200+ MB) fails: the put
// throws UnknownError in a page and kills an offscreen document outright.
// Single-record files written by older builds ({ id, data, bytes }) are
// still read and deleted, so already-downloaded models keep working.
const IDB_CHUNK = 8 * 1024 * 1024;
const chunkKey = (fileId, i) => `${fileId}#${i}`;

async function deleteChunks(db, fileId, n) {
  for (let i = 0; i < n; i++) {
    try { await idbDel(db, chunkKey(fileId, i)); } catch { /* already gone */ }
  }
}

// Delete every chunk record for a file by key prefix, whether or not a
// manifest exists. Used by prune/delete so a mid-download file (chunks
// but no manifest) is actually cleaned up.
async function deleteChunksByPrefix(db, fileId) {
  let keys = [];
  try { keys = await idbKeys(db); } catch { /* best effort */ }
  const prefix = fileId + '#';
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith(prefix)) {
      try { await idbDel(db, k); } catch { /* already gone */ }
    }
  }
}

export async function readChunked(db, fileId, manifest) {
  const buf = new Uint8Array(manifest.bytes);
  let off = 0;
  for (let i = 0; i < manifest.chunks; i++) {
    const rec = await idbGet(db, chunkKey(fileId, i));
    if (!rec || !rec.data) {
      throw new Error(`model "${fileId}" is missing chunk ${i} of ${manifest.chunks} — delete it in the popup and download again`);
    }
    const u8 = new Uint8Array(rec.data);
    buf.set(u8, off);
    off += u8.length;
  }
  if (off !== manifest.bytes) {
    throw new Error(`model "${fileId}" reassembled to ${off} bytes but should be ${manifest.bytes} — delete it in the popup and download again`);
  }
  return buf.buffer;
}

// Download one file with progress. Runs in the offscreen document (a service
// worker can be killed mid-download); progress is broadcast to the UI.
// Bytes stream straight into 8 MB IDB chunks — the file is never held whole
// in memory and no single IDB value is large. The byte size is verified
// against the spec — a truncated or wrong file is rejected instead of being
// cached silently.
export async function downloadFileToIdb(fileId, url, onProgress) {
  const spec = ALL_FILES.find(f => f.id === fileId);
  const db = await openDb();
  // Already cached (either storage format) with the right size? Skip —
  // but only when the chunks are actually present. An orphaned manifest
  // (correct bytes, missing chunks) must NOT short-circuit: it would
  // report success while the model still fails at load time (2.2.12).
  const existing = await idbGet(db, fileId);
  if (existing && spec && spec.bytes && existing.bytes === spec.bytes) {
    let intact = true;
    if (existing.data) {
      intact = true; // legacy single-record: the data is the file
    } else if (typeof existing.chunks === 'number') {
      const keys = await idbKeys(db).catch(() => []);
      let n = 0;
      for (const k of keys) {
        if (typeof k === 'string' && k.startsWith(fileId + '#')) n++;
      }
      intact = n >= existing.chunks;
    } else {
      intact = false; // manifest with no chunk count and no data: unverifiable
    }
    if (intact) return existing.bytes;
    // Orphaned/stale manifest: fall through and re-download (the stale
    // records are cleared below).
  }
  // Clear any stale or partial records before writing.
  if (existing) {
    if (existing.chunks) await deleteChunks(db, fileId, existing.chunks);
    await deleteChunksByPrefix(db, fileId);
    await idbDel(db, fileId);
  }
  // 2.2.12: fetch with an inactivity timeout. A server that accepts the
  // connection but never sends data (or stalls mid-stream) used to hang
  // the download forever — the 90s callMl timeout only rejects the
  // service-worker side while the host-side fetch keeps running. Abort
  // after 60s with no bytes received; a slow-but-progressing download
  // keeps resetting the timer, so it is never cut off for being slow.
  const DOWNLOAD_INACTIVITY_MS = 60000;
  const ctrl = new AbortController();
  let inactivityTimer = null;
  const armInactivity = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      try { ctrl.abort(); } catch { /* already settled */ }
    }, DOWNLOAD_INACTIVITY_MS);
  };
  let resp;
  try {
    armInactivity();
    resp = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (e && e.name === 'AbortError') throw new Error(`download timed out (no data for ${DOWNLOAD_INACTIVITY_MS / 1000}s) for ${fileId}`);
    throw e;
  }
  if (!resp.ok) {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    throw new Error(`download failed (${resp.status}) for ${fileId}`);
  }
  if (!resp.body) {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    throw new Error(`download failed (empty response body) for ${fileId}`);
  }
  const total = parseInt(resp.headers.get('content-length') || '0', 10);
  const reader = resp.body.getReader();
  let idx = 0, loaded = 0;
  let pending = [], pendingLen = 0;
  const flushChunk = async () => {
    if (!pendingLen) return;
    const buf = new Uint8Array(pendingLen);
    let off = 0;
    for (const c of pending) { buf.set(c, off); off += c.length; }
    pending = []; pendingLen = 0;
    await idbPut(db, { id: chunkKey(fileId, idx++), data: buf.buffer });
  };
  for (;;) {
    let readResult;
    try {
      readResult = await reader.read();
    } catch (e) {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (e && e.name === 'AbortError') throw new Error(`download timed out (no data for ${DOWNLOAD_INACTIVITY_MS / 1000}s) for ${fileId}`);
      throw e;
    }
    const { done, value } = readResult;
    if (done) break;
    armInactivity(); // bytes arrived — the connection is alive, reset the timer
    pending.push(value);
    pendingLen += value.length;
    loaded += value.length;
    onProgress && onProgress(loaded, total);
    if (pendingLen >= IDB_CHUNK) await flushChunk();
    // Some proxies/middleboxes deliver every byte but never terminate the
    // stream — without this, the download hangs at 100% forever. Once we
    // hold the advertised content-length, stop waiting for {done: true}.
    if (total > 0 && loaded >= total) break;
    // yield so progress messages flush
    await new Promise(r => setTimeout(r, 0));
  }
  if (inactivityTimer) clearTimeout(inactivityTimer);
  try { await reader.cancel(); } catch { /* stream already closed */ }
  await flushChunk();
  if (spec && spec.bytes && loaded !== spec.bytes) {
    await deleteChunks(db, fileId, idx); // don't leave a bad partial file
    throw new Error(
      `downloaded ${fileId} is ${loaded} bytes but should be ${spec.bytes} — ` +
      `the download was truncated or is the wrong file. Please try again.`);
  }
  await idbPut(db, { id: fileId, bytes: loaded, chunks: idx, downloadedAt: Date.now() });
  return loaded;
}

export { MSG };
