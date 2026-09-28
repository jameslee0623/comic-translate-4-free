// Pororo Korean OCR via the brainocr ONNX export in ogkalu/pororo.
// Recognition model only (the extension already detects text with RT-DETR;
// pororo's CRAFT detector is not needed).
//
// Faithful port of kakaobrain/pororo's brainOCR INFERENCE path, verified
// against the pororo source on 2026-09-28
// (pororo/models/brainOCR/{brainocr,recognition,utils}.py):
//
//   crop -> grayscale
//        -> get_image_list: resize to (int(64*w/h), 64), BILINEAR
//           (cv2.resize with interpolation=Image.ANTIALIAS; in the PIL of
//           that era ANTIALIAS==1==cv2.INTER_LINEAR)
//        -> AlignCollate: adjust_contrast_grey(target=0.5)
//        -> AlignCollate: width capped at imgW=100 from ocr-opt.txt — wider
//           lines are SQUISHED to (100, 64) with BICUBIC
//           (image.resize((resized_w, imgH), Image.BICUBIC))
//        -> NormalizePAD: ToTensor [0,1] -> (x - 0.5) / 0.5
//        -> brainocr [1,1,64,W] -> [1,seq,2589]
//        -> CTC greedy decode: argmax per step, collapse repeats, drop
//           class 0 (blank); class c>0 -> charset line c-1
//           (pororo's build_vocab prepends '[blank]' to the charset).
//
// The width-100 cap is load-bearing, not incidental: the model was trained
// with the same AlignCollate, and dropping the cap measurably hurts accuracy
// on wide lines (verified: 4/4 Korean test crops decode exactly with the cap,
// 1/4 without).
//
// kakaobrain/pororo is Apache License 2.0
// (https://github.com/kakaobrain/pororo).

import { toGrayU8 } from './image-ops.js';

const IMG_H = 64;
const IMG_W = 100; // imgW from ocr-opt.txt: wider lines are squished to this
const CONTRAST_TARGET = 0.5; // adjust_contrast default in brainocr __call__

// Bilinear resize of a single-channel image (matches cv2.INTER_LINEAR).
function resizeBilinearGray(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    let sy = (y + 0.5) * yr - 0.5;
    sy = sy < 0 ? 0 : sy > sh - 1 ? sh - 1 : sy;
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), wy = sy - y0;
    for (let x = 0; x < dw; x++) {
      let sx = (x + 0.5) * xr - 0.5;
      sx = sx < 0 ? 0 : sx > sw - 1 ? sw - 1 : sx;
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), wx = sx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1];
      const c = src[y1 * sw + x0], d = src[y1 * sw + x1];
      out[y * dw + x] = a * (1 - wx) * (1 - wy) + b * wx * (1 - wy)
        + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return out;
}

// adjust_contrast_grey from pororo (EasyOCR): stretch the histogram when the
// image's contrast is below target. contrast = (p90-p10)/max(10, p90+p10).
function adjustContrastGrey(gray) {
  // gray: Uint8 values (pororo runs this on the uint8 grayscale image).
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  const pct = q => {
    const want = (q / 100) * total;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= want) return v;
    }
    return 255;
  };
  const high = pct(90), low = pct(10);
  const contrast = (high - low) / Math.max(10, high + low);
  if (contrast >= CONTRAST_TARGET) return gray;
  const ratio = 200.0 / Math.max(10, high - low);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    let v = (gray[i] - low + 25) * ratio;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

// Bicubic (Catmull-Rom) resize of a single-channel image, like PIL BICUBIC
// which pororo uses.
function resizeBicubicGray(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const sx = sw / dw, sy = sh / dh;
  const kernel = t => {
    const a = Math.abs(t);
    if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a <= 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };
  for (let y = 0; y < dh; y++) {
    const gy = (y + 0.5) * sy - 0.5;
    const y0 = Math.floor(gy);
    for (let x = 0; x < dw; x++) {
      const gx = (x + 0.5) * sx - 0.5;
      const x0 = Math.floor(gx);
      let acc = 0, wsum = 0;
      for (let j = -1; j <= 2; j++) {
        const yy = Math.min(sh - 1, Math.max(0, y0 + j));
        const wy = kernel(gy - (y0 + j));
        for (let i = -1; i <= 2; i++) {
          const xx = Math.min(sw - 1, Math.max(0, x0 + i));
          const w = wy * kernel(gx - (x0 + i));
          acc += src[yy * sw + xx] * w;
          wsum += w;
        }
      }
      out[y * dw + x] = acc / wsum;
    }
  }
  return out;
}

function preprocessCrop(rgba, w, h) {
  // 1-2. grayscale, then bilinear resize to (int(64*w/h), 64)
  // (pororo's get_image_list via cv2.resize)
  const gray = toGrayU8(rgba, w, h);
  const w1 = Math.max(1, Math.floor(IMG_H * (w / h)));
  const resized = resizeBilinearGray(gray, w, h, w1, IMG_H);
  // Back to uint8, like pororo's np.array(image.convert("L")) input.
  const u8 = new Uint8ClampedArray(resized.length);
  for (let i = 0; i < u8.length; i++) u8[i] = resized[i];
  // 3. AlignCollate: adjust_contrast_grey(target=0.5)
  let img = adjustContrastGrey(u8);
  // 4. AlignCollate: cap width at imgW (BICUBIC squish for wider lines)
  let dw = w1;
  if (dw > IMG_W) {
    img = resizeBicubicGray(img, dw, IMG_H, IMG_W, IMG_H);
    dw = IMG_W;
  }
  // 5. NormalizePAD: ToTensor [0,1], then (x - 0.5) / 0.5
  const chw = new Float32Array(dw * IMG_H);
  for (let i = 0; i < chw.length; i++) chw[i] = (img[i] / 255 - 0.5) / 0.5;
  return { data: chw, w: dw };
}

function ctcGreedyDecode(logits, seqLen, numClasses, charset) {
  // logits: Float32Array [seqLen, numClasses]
  let prev = -1;
  let text = '';
  for (let t = 0; t < seqLen; t++) {
    const row = t * numClasses;
    let best = 0;
    for (let c = 1; c < numClasses; c++) {
      if (logits[row + c] > logits[row + best]) best = c;
    }
    if (best !== 0 && best !== prev) {
      // class c -> charset line c-1 ('[blank]' occupies class 0)
      if (best - 1 < charset.length) text += charset[best - 1];
    }
    prev = best;
  }
  return text;
}

export class PororoOCR {
  constructor() {
    this.session = null;
    this.charset = null;
  }

  async load(modelUrl, charsetText, executionProviders = ['wasm']) {
    if (this.session) return;
    this.session = await ort.InferenceSession.create(modelUrl, { executionProviders });
    this.charset = charsetText.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);
  }

  get loaded() { return !!this.session; }

  reset() { this.session = null; this.charset = null; }

  async ocrSingle(rgba, w, h) {
    const { data, w: dw } = preprocessCrop(rgba, w, h);
    const feeds = {};
    feeds[this.session.inputNames[0]] = new ort.Tensor('float32', data, [1, 1, IMG_H, dw]);
    const out = await this.session.run(feeds);
    const t = out[this.session.outputNames[0]];
    const seqLen = t.dims[1], numClasses = t.dims[2];
    const text = ctcGreedyDecode(t.data, seqLen, numClasses, this.charset);
    return text.trim();
  }

  async ocrCrops(crops) {
    const out = [];
    for (const c of crops) out.push(await this.ocrSingle(c.rgba, c.w, c.h));
    return out;
  }
}
