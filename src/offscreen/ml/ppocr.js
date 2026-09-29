// PP-OCR text recognition via PaddlePaddle's official ONNX exports
// (PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx and
// PaddlePaddle/PP-OCRv6_small_rec_onnx, both Apache License 2.0).
//
// Faithful port of PaddleOCR's rec inference preprocessing (RecResizeImg +
// NormalizeImage + CTCLabelDecode, verified against PaddlePaddle's official
// PP-OCRv5 inference config on 2026-09-28):
//
//   crop -> RGB resize to height 48 keeping aspect (bilinear)
//        -> (x/255 - 0.5) / 0.5, CHW
//        -> rec.onnx [1,3,48,W] -> [1,seq,numClasses]
//        -> CTC greedy decode: argmax per step, collapse repeats, drop
//           class 0 (blank); dict line i -> class i+1
//           (PaddleOCR prepends 'blank' to the dict).
//
// The exported models report one more class than dict+blank
// (e.g. english: 438 classes vs 436 dict lines + blank). That trailing class
// is the SPACE: the official PP-OCRv5 rec config trains/infers with
// use_space_char=true, which appends ' ' after the dict
// (PaddleOCR's CTCLabelDecode then maps the last class to ' ').
//
// PaddleOCR is Apache License 2.0 (https://github.com/PaddlePaddle/PaddleOCR).

import { resizeBilinearRGBA } from './image-ops.js';

const IMG_H = 48;
const MAX_W = 1600; // bound memory/time on pathological aspect ratios

function preprocessCrop(rgba, w, h) {
  const dw = Math.max(1, Math.min(MAX_W, Math.round(IMG_H * (w / h))));
  const small = resizeBilinearRGBA(rgba, w, h, dw, IMG_H);
  const chw = new Float32Array(3 * IMG_H * dw);
  const plane = IMG_H * dw;
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < dw; x++) {
      const s = (y * dw + x) * 4, d = y * dw + x;
      chw[d] = (small[s] / 255 - 0.5) / 0.5;
      chw[plane + d] = (small[s + 1] / 255 - 0.5) / 0.5;
      chw[2 * plane + d] = (small[s + 2] / 255 - 0.5) / 0.5;
    }
  }
  return { data: chw, w: dw };
}

function ctcGreedyDecode(logits, seqLen, numClasses, dict) {
  // use_space_char=true in the official config appends ' ' after the dict,
  // so exactly one class beyond dict+blank is the space character.
  const spaceClass = (numClasses === dict.length + 2) ? numClasses - 1 : -1;
  let prev = -1;
  let text = '';
  for (let t = 0; t < seqLen; t++) {
    const row = t * numClasses;
    let best = 0;
    for (let c = 1; c < numClasses; c++) {
      if (logits[row + c] > logits[row + best]) best = c;
    }
    if (best === 0 || best === prev) { prev = best; continue; }
    text += (best === spaceClass) ? ' '
      : (best - 1 < dict.length ? dict[best - 1] : '');
    prev = best;
  }
  return text;
}

export class PPOCRV5 {
  constructor() {
    this.session = null;
    this.dict = null;
  }

  async load(modelBytes, dictText, executionProviders = ['wasm']) {
    if (this.session) return;
    // Bytes go straight to ORT — no Blob/object-URL round trip (see detector.js).
    const u8 = modelBytes instanceof Uint8Array ? modelBytes : new Uint8Array(modelBytes);
    this.session = await ort.InferenceSession.create(u8, { executionProviders });
    this.dict = dictText.split('\n').map(l => l.replace(/\r$/, ''));
    // A trailing newline yields a final empty entry — not a character.
    if (this.dict.length && this.dict[this.dict.length - 1] === '') this.dict.pop();
  }

  get loaded() { return !!this.session; }

  reset() { this.session = null; this.dict = null; }

  async ocrSingle(rgba, w, h) {
    const { data, w: dw } = preprocessCrop(rgba, w, h);
    const feeds = {};
    feeds[this.session.inputNames[0]] = new ort.Tensor('float32', data, [1, 3, IMG_H, dw]);
    const out = await this.session.run(feeds);
    const t = out[this.session.outputNames[0]];
    const seqLen = t.dims[1], numClasses = t.dims[2];
    return ctcGreedyDecode(t.data, seqLen, numClasses, this.dict).trim();
  }

  async ocrCrops(crops) {
    const out = [];
    for (const c of crops) out.push(await this.ocrSingle(c.rgba, c.w, c.h));
    return out;
  }
}
