// Model inventory: exact HuggingFace artifacts (verified 2026-09-27).
// Downloaded on first use into IndexedDB ('ct-db'/'models'), never bundled.
import { openDb, idbGet, idbPut, idbDel, MSG } from './contracts.js';

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

export const MODEL_GROUPS = [
  {
    id: 'detector', label: 'Bubble/text detector (RT-DETR-v2)', required: true,
    files: [
      { id: 'detector', file: 'detector-v4-s_int8.onnx', bytes: 11120765,
        url: hf('ogkalu/comic-text-and-bubble-detector', 'detector-v4-s_int8.onnx') },
    ],
  },
  {
    id: 'ocr', label: 'manga-ocr Japanese OCR (KV split)',
    files: [
      { id: 'ocr-encoder', file: 'encoder.onnx', bytes: 17070003,
        url: hf('ogkalu/manga-ocr-mobile', 'encoder.onnx') },
      { id: 'ocr-decoder-init', file: 'decoder_init.onnx', bytes: 24875052,
        url: hf('ogkalu/manga-ocr-mobile', 'decoder_init.onnx') },
      { id: 'ocr-decoder-step', file: 'decoder_step.onnx', bytes: 22776797,
        url: hf('ogkalu/manga-ocr-mobile', 'decoder_step.onnx') },
    ],
  },
  {
    id: 'inpaint', label: 'LaMa manga inpainter', required: true,
    files: [
      { id: 'inpaint', file: 'lama-manga-dynamic.onnx', bytes: 206291843,
        url: hf('ogkalu/lama-manga-onnx-dynamic', 'lama-manga-dynamic.onnx') },
    ],
  },
  {
    id: 'ocr-pororo', label: 'Pororo Korean OCR (brainocr)',
    files: [
      { id: 'ocr-pororo', file: 'brainocr.onnx', bytes: 76907335,
        url: hf('ogkalu/pororo', 'brainocr.onnx') },
    ],
  },
  {
    id: 'ocr-ppocr-en', label: 'PP-OCRv5 OCR (English)',
    files: [
      { id: 'ocr-ppocr-en', file: 'rec.onnx', bytes: 7830888,
        url: hf('monkt/paddleocr-onnx', 'languages/english/rec.onnx') },
    ],
  },
  {
    id: 'ocr-ppocr-latin', label: 'PP-OCRv5 OCR (French/German/Spanish/Italian/Portuguese/Dutch)',
    files: [
      { id: 'ocr-ppocr-latin', file: 'rec.onnx', bytes: 7862832,
        url: hf('monkt/paddleocr-onnx', 'languages/latin/rec.onnx') },
    ],
  },
  {
    id: 'ocr-ppocr-eslav', label: 'PP-OCRv5 OCR (Russian)',
    files: [
      { id: 'ocr-ppocr-eslav', file: 'rec.onnx', bytes: 7870092,
        url: hf('monkt/paddleocr-onnx', 'languages/eslav/rec.onnx') },
    ],
  },
  {
    id: 'ocr-ppocr-chinese', label: 'PP-OCRv5 OCR (Chinese Simplified/Traditional)',
    files: [
      { id: 'ocr-ppocr-chinese', file: 'rec.onnx', bytes: 84468836,
        url: hf('monkt/paddleocr-onnx', 'languages/chinese/rec.onnx') },
    ],
  },
];

// OCR engine routing by source language (LANGS in shared/settings.js):
//   ja          -> manga-ocr ('ocr' group; manga-specialized, kept for Japanese)
//   ko          -> Pororo brainocr ('ocr-pororo' group)
//   zh-CN/zh-TW -> PP-OCRv5 chinese ('ocr-ppocr-chinese' group)
//   ru          -> PP-OCRv5 eslav ('ocr-ppocr-eslav' group)
//   en          -> PP-OCRv5 english ('ocr-ppocr-en' group)
//   everything else (fr/de/es/it/pt/nl) -> PP-OCRv5 latin ('ocr-ppocr-latin' group)
export function ocrEngineForLang(lang) {
  if (lang === 'ko') return 'ocr-pororo';
  if (lang === 'ja') return 'ocr';
  if (lang === 'en') return 'ocr-ppocr-en';
  if (lang === 'zh-CN' || lang === 'zh-TW') return 'ocr-ppocr-chinese';
  if (lang === 'ru') return 'ocr-ppocr-eslav';
  return 'ocr-ppocr-latin';
}

// PP-OCRv5 character dictionaries, bundled (one char per line, UTF-8).
// These are the exact dict.txt files shipped with the monkt/paddleocr-onnx
// rec.onnx exports (verified byte-identical in order and content against the
// official PaddlePaddle PP-OCRv5 character_dict for English on 2026-09-28).
export const PPOCR_DICT_ASSET = {
  'ocr-ppocr-en': 'src/offscreen/ml/dicts/ppocr-english.txt',
  'ocr-ppocr-latin': 'src/offscreen/ml/dicts/ppocr-latin.txt',
  'ocr-ppocr-eslav': 'src/offscreen/ml/dicts/ppocr-eslav.txt',
  'ocr-ppocr-chinese': 'src/offscreen/ml/dicts/ppocr-chinese.txt',
};

// Pororo brainocr charset, bundled (one char per line, UTF-8).
// Extracted from the `character` field of ocr-opt.txt next to brainocr.onnx
// in ogkalu/pororo (2588 chars; model class c>0 maps to line c-1, class 0 is
// the CTC blank — see pororo's build_vocab which prepends '[blank]').
export const PORORO_CHARSET_ASSET = 'src/offscreen/ml/pororo-charset.txt';

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
    out.push({ id: g.id, label: g.label, required: !!g.required, downloaded: done, sizeMismatch, files });
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
