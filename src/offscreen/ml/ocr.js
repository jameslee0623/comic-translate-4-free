// Inference logic ported from ogkalu2/comic-translate
// (Apache License 2.0, https://github.com/ogkalu2/comic-translate).
// manga-ocr (Japanese) via the KV-cache ONNX split from ogkalu/manga-ocr-mobile.
// Faithful port of comic-translate's modules/ocr/manga_ocr/mobile/onnx_engine.py,
// verified against the repo's own test set (spike 2).
//
// Pipeline per crop:
//   aspect-fit resize onto a WHITE 224x224 canvas, /255, RGB CHW (no grayscale,
//   no mean/std norm) -> encoder [1,196,256]
//   -> decoder_init(input_ids=[[2]]) -> logits + self k/v + cross k/v
//   -> autoregressive decoder_step loop:
//        position_ids = min(cacheLen + 1, 127)   (saturates!)
//        scatter each step's k/v slice into cache dim 3 at index cacheLen
//        stop at EOS (3) or 256 tokens
//   -> decode (skip ids < 5) -> postprocess + pathological-output guards
import { resizeBilinearRGBA } from './image-ops.js';

const IMAGE_SIZE = 224, MAX_SEQ = 256, MAX_POS = 127;
const START = 2, EOS = 3, NUM_LAYERS = 4, NUM_HEADS = 4, HEAD_DIM = 64;

function h2z(s) {
  // jaconv.h2z(text, ascii=True, digit=True)
  return s.replace(/[\x21-\x7e]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

export function postProcess(text) {
  text = text.split(/\s+/).join('');
  text = text.replace(/…/g, '...');
  text = text.replace(/[・.]{2,}/g, m => '.'.repeat(m.length));
  text = h2z(text);
  text = text.replace(/[\-\u2010\u2011\u2012\u2013\u2014\u2015\u30FC\uff70\u2500\u2501~\u301c\uff5e\u2026\u2025\u30FB\uff65.。、，·•]{8,}/g, '');
  if (!text) return '';
  if (isPathologicalPunct(text) || isPathologicalSep(text) || isPathologicalKanaLoop(text)) return '';
  return text.replace(/([.．・･])\1{3,}/g, '$1$1$1');
}

function isPathologicalPunct(t) {
  if (t.length < 12) return false;
  if (!/^[.．・･。、，…―—\-~～「」『』（）()［］\[\]!?！？\s]+$/.test(t)) return false;
  const dots = (t.match(/[.．・･。、，…]/g) || []).length;
  return dots / t.length >= 0.85;
}
function isPathologicalSep(t) {
  return t.length >= 8 && /^[\-‐‑‒–—―ーｰ─━~〜～…‥・･.。,、，·•]+$/.test(t);
}
function isPathologicalKanaLoop(t) {
  if (t.length < 12) return false;
  const m = t.match(/([ぁ-ゖァ-ヺ])\1{7,}/);
  if (!m) return false;
  const run = m[0].length;
  return run >= 16 || run / t.length >= 0.5;
}

function argmax(a) { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi; }

// scatter [4,1,4,1,64] slice into [4,1,4,256,64] cache at dim-3 index p
function scatterSlice(cache, slice, p) {
  for (let l = 0; l < NUM_LAYERS; l++) {
    for (let hd = 0; hd < NUM_HEADS; hd++) {
      const cb = (l * NUM_HEADS + hd) * 256 * HEAD_DIM + p * HEAD_DIM;
      const sb = (l * NUM_HEADS + hd) * HEAD_DIM;
      for (let i = 0; i < HEAD_DIM; i++) cache[cb + i] = slice[sb + i];
    }
  }
}

function preprocessCrop(rgba, w, h) {
  const scale = Math.min(IMAGE_SIZE / w, IMAGE_SIZE / h);
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
  const small = resizeBilinearRGBA(rgba, w, h, dw, dh);
  const ox = Math.floor((IMAGE_SIZE - dw) / 2), oy = Math.floor((IMAGE_SIZE - dh) / 2);
  const chw = new Float32Array(3 * IMAGE_SIZE * IMAGE_SIZE).fill(1.0);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const s = (y * dw + x) * 4, dx = x + ox, dy = y + oy;
      chw[dy * IMAGE_SIZE + dx] = small[s] / 255;
      chw[IMAGE_SIZE * IMAGE_SIZE + dy * IMAGE_SIZE + dx] = small[s + 1] / 255;
      chw[2 * IMAGE_SIZE * IMAGE_SIZE + dy * IMAGE_SIZE + dx] = small[s + 2] / 255;
    }
  }
  return chw;
}

function cropRGBA(src, sw, x1, y1, x2, y2) {
  const w = x2 - x1, h = y2 - y1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    out.set(src.subarray(((y1 + y) * sw + x1) * 4, ((y1 + y) * sw + x2) * 4), y * w * 4);
  }
  return { data: out, w, h };
}

export class MangaOCR {
  constructor() {
    this.encoder = null; this.decInit = null; this.decStep = null;
    this.vocab = null;
  }

  async load(encUrl, initUrl, stepUrl, vocabText, executionProviders = ['wasm']) {
    if (this.encoder) return;
    const opts = { executionProviders };
    this.encoder = await ort.InferenceSession.create(encUrl, opts);
    this.decInit = await ort.InferenceSession.create(initUrl, opts);
    this.decStep = await ort.InferenceSession.create(stepUrl, opts);
    this.vocab = vocabText.split('\n').map(l => l.replace(/\r$/, ''));
  }

  get loaded() { return !!this.encoder; }

  // Drop loaded sessions so the next inference re-reads model files from
  // IndexedDB (needed after a re-download; otherwise old bytes stay live).
  reset() { this.encoder = null; this.decInit = null; this.decStep = null; }

  // crops: [{rgba, w, h}] -> [text]
  async ocrCrops(crops) {
    const out = [];
    for (const c of crops) out.push(await this.ocrSingle(c.rgba, c.w, c.h));
    return out;
  }

  async ocrSingle(rgba, w, h) {
    const chw = preprocessCrop(rgba, w, h);
    const encIn = {}, decIn = {}, stepIn = {};
    encIn[this.encoder.inputNames[0]] = new ort.Tensor('float32', chw, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
    const encOut = await this.encoder.run(encIn);
    const hidden = encOut[this.encoder.outputNames[0]];

    const i64 = (v) => new ort.Tensor('int64', BigInt64Array.from([BigInt(v)]), [1, 1]);
    decIn[this.decInit.inputNames[0]] = hidden;
    decIn[this.decInit.inputNames[1]] = i64(START);
    const initOut = await this.decInit.run(decIn);
    const names = this.decInit.outputNames;
    const crossK = initOut[names[3]].data, crossV = initOut[names[4]].data;

    const selfK = new Float32Array(NUM_LAYERS * NUM_HEADS * MAX_SEQ * HEAD_DIM);
    const selfV = new Float32Array(NUM_LAYERS * NUM_HEADS * MAX_SEQ * HEAD_DIM);
    scatterSlice(selfK, initOut[names[1]].data, 0);
    scatterSlice(selfV, initOut[names[2]].data, 0);

    const sNames = this.decStep.outputNames;
    const tokenIds = [START];
    let next = argmax(initOut[names[0]].data);
    let cacheLen = 1, cur = 0;
    if (next !== EOS) { tokenIds.push(next); cur = next; }
    while (tokenIds.length < MAX_SEQ && cacheLen < MAX_SEQ && next !== EOS) {
      stepIn[this.decStep.inputNames[0]] = hidden;
      stepIn[this.decStep.inputNames[1]] = i64(cur);
      stepIn[this.decStep.inputNames[2]] = i64(Math.min(cacheLen + 1, MAX_POS));
      stepIn[this.decStep.inputNames[3]] = new ort.Tensor('float32', selfK, [NUM_LAYERS, 1, NUM_HEADS, MAX_SEQ, HEAD_DIM]);
      stepIn[this.decStep.inputNames[4]] = new ort.Tensor('float32', selfV, [NUM_LAYERS, 1, NUM_HEADS, MAX_SEQ, HEAD_DIM]);
      stepIn[this.decStep.inputNames[5]] = new ort.Tensor('float32', crossK, [NUM_LAYERS, 1, NUM_HEADS, 196, HEAD_DIM]);
      stepIn[this.decStep.inputNames[6]] = new ort.Tensor('float32', crossV, [NUM_LAYERS, 1, NUM_HEADS, 196, HEAD_DIM]);
      const stepOut = await this.decStep.run(stepIn);
      scatterSlice(selfK, stepOut[sNames[1]].data, cacheLen);
      scatterSlice(selfV, stepOut[sNames[2]].data, cacheLen);
      cacheLen++;
      next = argmax(stepOut[sNames[0]].data);
      if (next === EOS) break;
      tokenIds.push(next); cur = next;
    }
    const text = tokenIds
      .filter(t => t >= 5 && t < this.vocab.length)
      .map(t => this.vocab[t]).join('');
    return postProcess(text);
  }

  // Crop helper used by the pipeline: expand box 5%, clamp, crop from page RGBA.
  cropForBlock(pageRgba, pw, ph, xyxy, bubbleXyxy) {
    let box = xyxy;
    if (!box && bubbleXyxy) box = bubbleXyxy;
    if (!box) return null;
    const [x1, y1, x2, y2] = box;
    const w = x2 - x1, h = y2 - y1;
    const ex = (w * 5) / 100, ey = (h * 5) / 100;
    const cx1 = Math.max(0, Math.floor(x1 - ex)), cy1 = Math.max(0, Math.floor(y1 - ey));
    const cx2 = Math.min(pw, Math.ceil(x2 + ex)), cy2 = Math.min(ph, Math.ceil(y2 + ey));
    if (cx2 <= cx1 || cy2 <= cy1) return null;
    return cropRGBA(pageRgba, pw, cx1, cy1, cx2, cy2);
  }
}
