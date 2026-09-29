// Baberu OCR via the official ONNX exports in genshiai-daichi/baberu-ocr
// (Apache License 2.0, https://huggingface.co/genshiai-daichi/baberu-ocr).
//
// Character-level OCR trained specifically on modern manga speech bubbles
// (EN/ZH/JA). Three ONNX graphs, smallest tier:
//   vision_int4.onnx           (52.3MB)  crop -> vision_embeds
//   decoder_prefill_int8.onnx  (35.1MB)  vision_embeds + BOS -> logits + KV cache
//   decoder_step_int8.onnx     (33.9MB)  token + pos + KV cache -> logits + KV cache
//
// Faithful port of the repo's onnx_infer.py (pure-numpy host loop), verified
// against it on 2026-09-28:
//
//   crop -> RGB BICUBIC resize to 224x224 (whole crop, aspect NOT preserved)
//        -> (x/255 - mean) / std, ImageNet mean/std, CHW
//        -> vision [1,3,224,224] -> vision_embeds
//        -> prefill(vision_embeds, input_ids=[[BOS]]) -> logits + 12 past tensors
//        -> autoregressive step loop:
//             repetition_penalty 1.2 on all previously emitted ids
//             symbol-aware content-run cap: a letter/number id emitted 12 times
//               in a row gets -inf (kills repetition loops)
//             stop at EOS or 128 tokens
//        -> decode: ids 0..3 are <pad>/<bos>/<eos>/<unk>, id>=4 -> charset[id-4]
export const BABERU_IMG = 224;
const BOS = 1, EOS = 2;
const MAX_NEW_TOKENS = 128;
const REPETITION_PENALTY = 1.2;
const MAX_CONTENT_RUN = 12;
const NUM_LAYERS = 6;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// Bicubic (Catmull-Rom) resize of RGBA, like PIL BICUBIC which the reference
// preprocessing uses.
function resizeBicubicRGBA(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  const kernel = t => {
    const a = Math.abs(t);
    if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a <= 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };
  for (let y = 0; y < dh; y++) {
    const gy = (y + 0.5) * yr - 0.5;
    const y0 = Math.floor(gy);
    for (let x = 0; x < dw; x++) {
      const gx = (x + 0.5) * xr - 0.5;
      const x0 = Math.floor(gx);
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let j = -1; j <= 2; j++) {
          const yy = Math.min(sh - 1, Math.max(0, y0 + j));
          const wy = kernel(gy - (y0 + j));
          for (let i = -1; i <= 2; i++) {
            const xx = Math.min(sw - 1, Math.max(0, x0 + i));
            acc += src[(yy * sw + xx) * 4 + c] * wy * kernel(gx - (x0 + i));
          }
        }
        out[(y * dw + x) * 4 + c] = acc;
      }
    }
  }
  return out;
}

function preprocessCrop(rgba, w, h) {
  const small = resizeBicubicRGBA(rgba, w, h, BABERU_IMG, BABERU_IMG);
  const chw = new Float32Array(3 * BABERU_IMG * BABERU_IMG);
  const plane = BABERU_IMG * BABERU_IMG;
  for (let i = 0; i < plane; i++) {
    chw[i] = (small[i * 4] / 255 - MEAN[0]) / STD[0];
    chw[plane + i] = (small[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    chw[2 * plane + i] = (small[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return chw;
}

const EXCLUDED_RUN = new Set(['ー', 'ｰ', '〜', '~']);
// onnx_infer.py content_ids: single char, not in "ーｰ〜~", unicodedata
// category L* or N*. JS approximation via unicode property escapes.
function isContentChar(ch) {
  if ([...ch].length !== 1 || EXCLUDED_RUN.has(ch)) return false;
  return /\p{L}|\p{N}/u.test(ch);
}

export class BaberuOCR {
  constructor() {
    this.vis = null; this.pre = null; this.stp = null;
    this.id2ch = null; this.contentIds = null;
  }

  get loaded() { return !!this.vis; }

  reset() { this.vis = null; this.pre = null; this.stp = null; }

  async load(visUrl, preUrl, stepUrl, vocabJson, executionProviders = ['wasm']) {
    if (this.vis) return;
    const opts = { executionProviders };
    this.vis = await ort.InferenceSession.create(visUrl, opts);
    this.pre = await ort.InferenceSession.create(preUrl, opts);
    this.stp = await ort.InferenceSession.create(stepUrl, opts);
    const charset = JSON.parse(vocabJson);
    this.id2ch = new Map();
    this.contentIds = new Set();
    for (let i = 0; i < charset.length; i++) {
      this.id2ch.set(i + 4, charset[i]);
      if (isContentChar(charset[i])) this.contentIds.add(i + 4);
    }
  }

  _feed(session, obj) {
    // Map by name so graph renames don't silently misfeed.
    const feed = {};
    for (const n of session.inputNames) {
      if (n in obj) feed[n] = obj[n];
    }
    return feed;
  }

  _pastNames() {
    const names = [];
    for (const n of this.stp.inputNames) {
      if (/past/i.test(n)) names.push(n);
    }
    // Fall back to the documented order if names don't match.
    if (names.length !== 2 * NUM_LAYERS) {
      names.length = 0;
      for (let i = 0; i < NUM_LAYERS; i++) names.push(`past_k${i}`);
      for (let i = 0; i < NUM_LAYERS; i++) names.push(`past_v${i}`);
    }
    return names;
  }

  async ocrSingle(rgba, w, h) {
    const chw = preprocessCrop(rgba, w, h);
    const i64 = (v) => new ort.Tensor('int64', BigInt64Array.from([BigInt(v)]), [1, 1]);
    const visIn = this._feed(this.vis, { pixel_values: new ort.Tensor('float32', chw, [1, 3, BABERU_IMG, BABERU_IMG]) });
    if (!visIn || Object.keys(visIn).length === 0) {
      // Extremely defensive: feed positionally if no name matched.
      visIn[this.vis.inputNames[0]] = new ort.Tensor('float32', chw, [1, 3, BABERU_IMG, BABERU_IMG]);
    }
    const visOut = await this.vis.run(visIn);
    const visEmbeds = visOut[this.vis.outputNames[0]];

    const preIn = this._feed(this.pre, {
      vision_embeds: visEmbeds,
      input_ids: i64(BOS),
    });
    const preOut = await this.pre.run(preIn);
    const preNames = this.pre.outputNames;
    const preLogits = preOut[preNames[0]];
    // prefill logits are [1, 257, vocab] (256 vision + 1 BOS): take the last row.
    const pv = preLogits.dims[preLogits.dims.length - 1];
    let logits = preLogits.data.slice(preLogits.data.length - pv);
    let present = preNames.slice(1).map(n => preOut[n]);

    const pastNames = this._pastNames();
    const seqLen = visEmbeds.dims[1];
    let pos = seqLen + 1;
    const seq = [BOS], toks = [];
    const vocabSize = this.id2ch.size + 4;

    for (let step = 0; step < MAX_NEW_TOKENS; step++) {
      // repetition_penalty 1.2 over previously emitted ids (incl. BOS).
      const seen = new Set(seq);
      for (const tid of seen) {
        if (tid < vocabSize) {
          const s = logits[tid];
          logits[tid] = s < 0 ? s * REPETITION_PENALTY : s / REPETITION_PENALTY;
        }
      }
      // Symbol-aware content-run cap: 12 identical letter/number ids in a row
      // -> -inf (matches onnx_infer.py; kills repetition loops).
      if (toks.length && this.contentIds.has(toks[toks.length - 1])) {
        const last = toks[toks.length - 1];
        let run = 0;
        for (let i = toks.length - 1; i >= 0 && toks[i] === last; i--) run++;
        if (run >= MAX_CONTENT_RUN && last < vocabSize) logits[last] = -Infinity;
      }
      let nxt = 0;
      for (let i = 1; i < vocabSize && i < logits.length; i++) {
        if (logits[i] > logits[nxt]) nxt = i;
      }
      if (nxt === EOS) break;
      toks.push(nxt);
      seq.push(nxt);
      if (toks.length >= MAX_NEW_TOKENS) break;
      const feed = this._feed(this.stp, {
        input_ids: i64(nxt),
        position_ids: i64(pos),
      });
      for (let i = 0; i < pastNames.length && i < present.length; i++) {
        feed[pastNames[i]] = present[i];
      }
      const out = await this.stp.run(feed);
      const names = this.stp.outputNames;
      const flat = out[names[0]];
      // logits layout [1, 1, vocab] -> last row.
      const n = flat.data.length, v = flat.dims[flat.dims.length - 1];
      logits = flat.data.slice(n - v);
      present = names.slice(1).map(nm => out[nm]);
      pos++;
    }
    let text = '';
    for (const id of toks) {
      const ch = this.id2ch.get(id);
      if (ch !== undefined) text += ch;
    }
    return text;
  }

  async ocrCrops(crops) {
    const out = [];
    for (const c of crops) out.push(await this.ocrSingle(c.rgba, c.w, c.h));
    return out;
  }
}
