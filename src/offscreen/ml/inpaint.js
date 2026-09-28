// Inference logic ported from ogkalu2/comic-translate
// (Apache License 2.0, https://github.com/ogkalu2/comic-translate).
// LaMa-based manga inpainting. Verified contract (spike 3):
//   in:  image [1,3,h,w] float32 (/255 RGB), mask [1,1,h,w] float32 (0/1)
//   out: inpainted [1,3,h,w] float32
// Patch dims must be multiples of 8. All graph ops are WASM-safe
// (FFC is compiled to Cos/Sin/MatMul; no DFT op in the graph).
import { toNCHW, padToMod } from './image-ops.js';

export class Inpainter {
  constructor() { this.session = null; }

  async load(modelBlobUrl, executionProviders = ['wasm']) {
    if (this.session) return;
    this.session = await ort.InferenceSession.create(modelBlobUrl, { executionProviders });
  }

  get loaded() { return !!this.session; }

  // Drop the loaded session so the next inference re-reads the model file
  // from IndexedDB (needed after a re-download; otherwise old bytes stay live).
  reset() { this.session = null; }

  // rgba: Uint8ClampedArray RGBA, mask01: Uint8Array 0/1 (same w/h).
  // Returns RGBA Uint8ClampedArray of the inpainted patch.
  async inpaintPatch(rgba, mask01, w, h) {
    const p = padToMod(rgba, w, h, 8);
    const mw = p.w, mh = p.h;
    const imgNCHW = toNCHW(p.data, mw, mh);
    const maskNCHW = new Float32Array(mw * mh);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) maskNCHW[y * mw + x] = mask01[y * w + x] ? 1 : 0;

    const out = await this.session.run({
      image: new ort.Tensor('float32', imgNCHW, [1, 3, mh, mw]),
      mask: new ort.Tensor('float32', maskNCHW, [1, 1, mh, mw]),
    });
    const d = out.inpainted.data;
    const res = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        res[o] = Math.max(0, Math.min(255, d[y * mw + x] * 255));
        res[o + 1] = Math.max(0, Math.min(255, d[mw * mh + y * mw + x] * 255));
        res[o + 2] = Math.max(0, Math.min(255, d[2 * mw * mh + y * mw + x] * 255));
        res[o + 3] = 255;
      }
    }
    return res;
  }
}

// Merge overlapping padded boxes -> patch list (port of merge_overlapping_padded_boxes).
export function mergePaddedBoxes(entries, pad, imgW, imgH) {
  // entries: [{bounds:[x1,y1,x2,y2]}]
  let boxes = entries.map(e => {
    const [x1, y1, x2, y2] = e.bounds;
    return [
      Math.max(0, x1 - pad), Math.max(0, y1 - pad),
      Math.min(imgW, x2 + pad), Math.min(imgH, y2 + pad),
    ];
  });
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) {
          boxes[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          boxes.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}
