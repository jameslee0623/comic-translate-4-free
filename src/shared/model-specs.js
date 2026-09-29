// Model inventory: exact HuggingFace artifacts (verified 2026-09-27).
// Downloaded on first use into IndexedDB ('ct-db'/'models'), never bundled.
import { openDb, idbGet, idbPut, idbDel, MSG } from './contracts.js';

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
    id: 'ocr-ppocr-ko', labelKey: 'model_ko', label: 'PP-OCRv5 OCR (Korean, official 2025 model)',
    files: [
      { id: 'ocr-ppocr-ko', file: 'inference.onnx', bytes: 13418787,
        url: hf('PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx', 'inference.onnx') },
    ],
  },
  {
    id: 'ocr-baberu', labelKey: 'model_baberu', label: 'Baberu OCR (Japanese + English + Chinese Simplified, manga-trained)',
    files: [
      { id: 'ocr-baberu-vision', file: 'vision_int4.onnx', bytes: 52293486,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/vision_int4.onnx') },
      { id: 'ocr-baberu-prefill', file: 'decoder_prefill_int8.onnx', bytes: 35133596,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/decoder_prefill_int8.onnx') },
      { id: 'ocr-baberu-step', file: 'decoder_step_int8.onnx', bytes: 33929034,
        url: hf('genshiai-daichi/baberu-ocr', 'onnx/decoder_step_int8.onnx') },
    ],
  },
  {
    id: 'ocr-ppocrv6', labelKey: 'model_zh_tw', label: 'PP-OCRv6 OCR (Chinese Traditional)',
    files: [
      { id: 'ocr-ppocrv6', file: 'inference.onnx', bytes: 21159378,
        url: hf('PaddlePaddle/PP-OCRv6_small_rec_onnx', 'inference.onnx') },
    ],
  },
];

// OCR engine routing by source language (LANGS in shared/settings.js):
//   ja      -> Baberu ('ocr-baberu' group; trilingual, manga-trained,
//              beats manga-ocr on Manga109)
//   ko      -> PP-OCRv5 Korean ('ocr-ppocr-ko' group; official 2025 model)
//   en      -> Baberu ('ocr-baberu' group; trained on manga bubbles)
//   zh-CN   -> Baberu ('ocr-baberu' group)
//   zh-TW   -> PP-OCRv6 small ('ocr-ppocrv6' group; first line with explicit
//              Traditional Chinese support)
// (manga-ocr removed 2026-09-29: superseded by Baberu for Japanese.
// Pororo + PP-OCRv5 en/chinese models removed 2026-09-28: superseded.)
export function ocrEngineForLang(lang) {
  if (lang === 'ko') return 'ocr-ppocr-ko';
  if (lang === 'ja') return 'ocr-baberu';
  if (lang === 'en') return 'ocr-baberu';
  if (lang === 'zh-CN') return 'ocr-baberu';
  if (lang === 'zh-TW') return 'ocr-ppocrv6';
  return 'ocr-baberu'; // fallback: only ja/en/ko/zh are offered as source languages
}

// PP-OCR character dictionaries, bundled (one char per line, UTF-8).
// The v5/v6 dicts are the exact character_dict lists from the official
// PaddlePaddle inference.yml configs (extracted 2026-09-28).
export const PPOCR_DICT_ASSET = {
  'ocr-ppocr-ko': 'src/offscreen/ml/dicts/ppocr-korean.txt',
  'ocr-ppocrv6': 'src/offscreen/ml/dicts/ppocrv6.txt',
};

// Baberu character vocab, bundled (JSON array; id>=4 -> charset[id-4]).
// From genshiai-daichi/baberu-ocr tokenizer/vocab.json.
export const BABERU_VOCAB_ASSET = 'src/offscreen/ml/dicts/baberu-vocab.json';

export const ALL_FILES = MODEL_GROUPS.flatMap(g =>
  g.files.map(f => ({ ...f, group: g.id, groupLabel: g.label })));

export async function getModelStatus() {
  const db = await openDb();
  const out = [];
  for (const g of MODEL_GROUPS) {
    const files = [];
    let done = true, sizeMismatch = false;
    for (const f of g.files) {
      const rec = await idbGet(db, f.id);
      const bytesOk = !!rec && rec.bytes === f.bytes;
      files.push({
        id: f.id, file: f.file, bytes: rec ? rec.bytes : 0,
        expectedBytes: f.bytes, downloaded: !!rec, bytesOk,
      });
      if (!rec) { done = false; continue; }
      if (!bytesOk) { done = false; sizeMismatch = true; }
    }
    out.push({ id: g.id, label: g.label, labelKey: g.labelKey, required: !!g.required, downloaded: done, sizeMismatch, files });
  }
  return out;
}

export async function deleteModelGroup(groupId) {
  const db = await openDb();
  const g = MODEL_GROUPS.find(x => x.id === groupId);
  if (!g) return;
  for (const f of g.files) {
    const rec = await idbGet(db, f.id).catch(() => null);
    if (rec && rec.chunks) await deleteChunks(db, f.id, rec.chunks);
    await idbDel(db, f.id);
  }
}

// One-time cleanup for model files whose groups were removed from
// MODEL_GROUPS (Latin/Russian PP-OCRv5, 2026-09-28; Pororo + PP-OCRv5
// en/chinese, superseded 2026-09-28; manga-ocr encoder/decoder, superseded
// 2026-09-29 by Baberu): with no group row left in the UI
// there'd be no way to delete them otherwise.
const PRUNED_MODEL_IDS = ['ocr-ppocr-latin', 'ocr-ppocr-eslav', 'ocr-pororo', 'ocr-ppocr-en', 'ocr-ppocr-chinese', 'ocr-encoder', 'ocr-decoder-init', 'ocr-decoder-step'];
export async function pruneRemovedModels() {
  const db = await openDb();
  for (const id of PRUNED_MODEL_IDS) {
    try {
      const rec = await idbGet(db, id).catch(() => null);
      if (!rec) continue;
      if (rec.chunks) await deleteChunks(db, id, rec.chunks);
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
  // Already cached (either storage format) with the right size? Skip.
  const existing = await idbGet(db, fileId);
  if (existing && spec && spec.bytes && existing.bytes === spec.bytes) return existing.bytes;
  // Clear any stale or partial records before writing.
  if (existing) {
    if (existing.chunks) await deleteChunks(db, fileId, existing.chunks);
    await idbDel(db, fileId);
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed (${resp.status}) for ${fileId}`);
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
    const { done, value } = await reader.read();
    if (done) break;
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
  try { await reader.cancel(); } catch { /* stream already closed */ }
  console.log('[ct-dl] stream done, loaded=' + loaded);
  await flushChunk();
  if (spec && spec.bytes && loaded !== spec.bytes) {
    await deleteChunks(db, fileId, idx); // don't leave a bad partial file
    throw new Error(
      `downloaded ${fileId} is ${loaded} bytes but should be ${spec.bytes} — ` +
      `the download was truncated or is the wrong file. Please try again.`);
  }
  console.log('[ct-dl] chunks written: ' + idx);
  await idbPut(db, { id: fileId, bytes: loaded, chunks: idx, downloadedAt: Date.now() });
  console.log('[ct-dl] manifest written');
  return loaded;
}

export { MSG };
