// RT-DETR-v2 bubble/text detector (ogkalu/comic-text-and-bubble-detector,
// Apache License 2.0). Box geometry ported from ogkalu2/comic-translate
// (Apache License 2.0, https://github.com/ogkalu2/comic-translate).
// Verified contract (spike 1):
//   in:  images [1,3,640,640] float32 (/255, RGB), orig_target_sizes int64 [[w,h]]
//   out: labels [1,300], boxes [1,300,4] (original-image coords), scores [1,300]
// Labels: 0 = bubble, 1 = text_bubble, 2 = text_free. NMS-free.
import { resizeBilinearRGBA, toNCHW } from './image-ops.js';

const SIZE = 640;

export class Detector {
  constructor() { this.session = null; }

  async load(modelBytes, executionProviders = ['wasm']) {
    if (this.session) return;
    // Bytes go straight to ORT — no Blob/object-URL round trip. (Blobs were
    // never revoked, leaking every model's bytes for the page's lifetime,
    // and the blob + ORT's blob-fetch doubled the transient peak.)
    const u8 = modelBytes instanceof Uint8Array ? modelBytes : new Uint8Array(modelBytes);
    this.session = await ort.InferenceSession.create(u8, { executionProviders });
  }

  get loaded() { return !!this.session; }

  // Drop the loaded session so the next inference re-reads the model file
  // from IndexedDB (needed after a re-download; otherwise the old bytes stay live).
  reset() { this.session = null; }

  // rgba: Uint8ClampedArray, w/h: image dims. Returns [{xyxy:[x1,y1,x2,y2], label, score}]
  async detect(rgba, w, h, threshold = 0.3) {
    const resized = resizeBilinearRGBA(rgba, w, h, SIZE, SIZE);
    const nchw = toNCHW(resized, SIZE, SIZE);
    const feeds = {
      images: new ort.Tensor('float32', nchw, [1, 3, SIZE, SIZE]),
      orig_target_sizes: new ort.Tensor('int64', BigInt64Array.from([BigInt(w), BigInt(h)]), [1, 2]),
    };
    const out = await this.session.run(feeds);
    const labels = out.labels.data, boxes = out.boxes.data, scores = out.scores.data;
    const kept = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] >= threshold) {
        kept.push({
          xyxy: [boxes[i * 4], boxes[i * 4 + 1], boxes[i * 4 + 2], boxes[i * 4 + 3]],
          label: Number(labels[i]), // int64 -> BigInt without this; breaks === 0 checks
          score: scores[i],
        });
      }
    }
    kept.sort((a, b) => b.score - a.score);
    return kept;
  }
}
