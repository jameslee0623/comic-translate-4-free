// Inference logic ported from ogkalu2/comic-translate
// (Apache License 2.0, https://github.com/ogkalu2/comic-translate).
// LaMa-based manga inpainting. Verified contract (spike 3):
//   in:  image [1,3,h,w] float32 (/255 RGB), mask [1,1,h,w] float32 (0/1)
//   out: inpainted [1,3,h,w] float32
// Patch dims must be multiples of 8. All graph ops are WASM-safe
// (FFC is compiled to Cos/Sin/MatMul; no DFT op in the graph).
import { toNCHW, padToMod } from './image-ops.js';

// Tiled inpainting: LaMa's peak WASM memory scales with patch area, and a
// dense page can merge its text boxes into one huge patch. On Firefox the
// sessions run in-process in the background page, so a big enough patch
// aborts the run with a wasm out-of-memory (Chrome's offscreen process has
// more headroom but the same math applies). Patches larger than TILE_MAX on
// a side are therefore processed as overlapping full-resolution tiles and
// feather-blended back together: peak memory stays bounded by one tile while
// the output stays full-resolution — no quality loss from downscaling.
export const TILE_MAX = 1024;
const TILE_OVERLAP = 128;

// Tile origins/sizes covering [0, len): first tile starts at 0, last ends at
// len, neighbours overlap by >= TILE_OVERLAP, no tile exceeds TILE_MAX.
export function tileOrigins(len) {
  if (len <= TILE_MAX) return [{ o: 0, n: len }];
  const step = TILE_MAX - TILE_OVERLAP;
  const count = Math.ceil((len - TILE_OVERLAP) / step);
  const tiles = [];
  for (let i = 0; i < count; i++) {
    const o = Math.round(i * (len - TILE_MAX) / (count - 1));
    tiles.push({ o, n: Math.min(TILE_MAX, len - o) });
  }
  return tiles;
}

function cropRGBA(rgba, w, x, y, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let r = 0; r < ch; r++)
    out.set(rgba.subarray(((y + r) * w + x) * 4, ((y + r) * w + x + cw) * 4), r * cw * 4);
  return out;
}

function cropMask(mask01, w, x, y, cw, ch) {
  const out = new Uint8Array(cw * ch);
  for (let r = 0; r < ch; r++)
    out.set(mask01.subarray((y + r) * w + x, (y + r) * w + x + cw), r * cw);
  return out;
}

export class Inpainter {
  constructor() { this.session = null; }

  async load(modelBytes, executionProviders = ['wasm']) {
    if (this.session) return;
    // Bytes go straight to ORT — no Blob/object-URL round trip (see detector.js).
    const u8 = modelBytes instanceof Uint8Array ? modelBytes : new Uint8Array(modelBytes);
    this.session = await ort.InferenceSession.create(u8, { executionProviders });
  }

  get loaded() { return !!this.session; }

  // Drop the loaded session so the next inference re-reads the model file
  // from IndexedDB (needed after a re-download; otherwise old bytes stay live).
  reset() { this.session = null; }

  // rgba: Uint8ClampedArray RGBA, mask01: Uint8Array 0/1 (same w/h).
  // Returns RGBA Uint8ClampedArray of the inpainted patch. Oversized patches
  // are tiled (see above); isCancelled is an optional () => bool checked
  // between tiles.
  async inpaintPatch(rgba, mask01, w, h, isCancelled) {
    if (w <= TILE_MAX && h <= TILE_MAX) return this.inpaintPatchSingle(rgba, mask01, w, h);
    return this.inpaintPatchTiled(rgba, mask01, w, h, isCancelled);
  }

  // One LaMa run on a patch that fits in TILE_MAX. Unchanged port logic.
  async inpaintPatchSingle(rgba, mask01, w, h) {
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

  // Full-resolution tiled inpaint for patches larger than TILE_MAX.
  // Tiles overlap by >= TILE_OVERLAP and are combined with an online
  // weighted average: each tile's weight ramps linearly 0 -> 1 over the
  // overlap zone at its interior edges, so seams crossfade instead of
  // cutting. Only one tile's LaMa run is live at a time, bounding peak
  // WASM memory; out/wsum are plain JS arrays.
  async inpaintPatchTiled(rgba, mask01, w, h, isCancelled) {
    const xs = tileOrigins(w), ys = tileOrigins(h);
    const out = new Uint8ClampedArray(w * h * 4);
    const wsum = new Float32Array(w * h);
    for (const { o: tx, n: tw } of xs) {
      const leftIn = tx > 0, rightIn = tx + tw < w;
      for (const { o: ty, n: th } of ys) {
        if (isCancelled && isCancelled()) throw new Error('cancelled');
        const topIn = ty > 0, botIn = ty + th < h;
        const tileOut = await this.inpaintPatchSingle(
          cropRGBA(rgba, w, tx, ty, tw, th), cropMask(mask01, w, tx, ty, tw, th), tw, th);
        for (let ly = 0; ly < th; ly++) {
          let wy = 1;
          if (topIn && ly < TILE_OVERLAP) wy = Math.min(wy, ly / TILE_OVERLAP);
          if (botIn && ly > th - 1 - TILE_OVERLAP) wy = Math.min(wy, (th - 1 - ly) / TILE_OVERLAP);
          const gy = ty + ly;
          for (let lx = 0; lx < tw; lx++) {
            let wx = 1;
            if (leftIn && lx < TILE_OVERLAP) wx = Math.min(wx, lx / TILE_OVERLAP);
            if (rightIn && lx > tw - 1 - TILE_OVERLAP) wx = Math.min(wx, (tw - 1 - lx) / TILE_OVERLAP);
            const wt = wx * wy;
            if (wt <= 0) continue;
            const gi = gy * w + tx + lx, go = gi * 4, to = (ly * tw + lx) * 4;
            const ws = wsum[gi], wn = ws + wt;
            const k1 = ws / wn, k2 = wt / wn;
            out[go] = out[go] * k1 + tileOut[to] * k2;
            out[go + 1] = out[go + 1] * k1 + tileOut[to + 1] * k2;
            out[go + 2] = out[go + 2] * k1 + tileOut[to + 2] * k2;
            out[go + 3] = 255;
            wsum[gi] = wn;
          }
        }
      }
    }
    return out;
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
