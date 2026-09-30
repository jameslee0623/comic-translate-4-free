// Inference logic ported from ogkalu2/comic-translate
// (Apache License 2.0, https://github.com/ogkalu2/comic-translate).
// TextBlock: the unit of translation. Port of modules/utils/textblock.py (fields that
// the extension pipeline actually uses). Plain JSON-serializable objects.

export function makeTextBlock(o = {}) {
  return {
    xyxy: o.xyxy || null,           // [x1,y1,x2,y2] text box (float)
    bubble_xyxy: o.bubble_xyxy || null,
    text_class: o.text_class || 'text_free', // 'text_bubble' | 'text_free'
    text: o.text || '',
    translation: o.translation || '',
    source_lang: o.source_lang || 'ja',
    target_lang: o.target_lang || 'en',
    font_color: o.font_color || null, // css color detected from image
    direction: o.direction || 'horizontal', // or 'vertical'
    min_font_size: o.min_font_size || 0,
    max_font_size: o.max_font_size || 0,
    alignment: o.alignment || 'center',
    line_spacing: o.line_spacing || 1,
    render_xyxy: o.render_xyxy || null, // computed render area (stage 7)
    render_font_size: o.render_font_size || 0,
  };
}

export function center(b) {
  const [x1, y1, x2, y2] = b.xyxy;
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

// Reading order: top-to-bottom, then right-to-left for vertical/JP text.
export function sortBlocks(blocks, rtl = true) {
  return [...blocks].sort((a, b) => {
    const ca = center(a), cb = center(b);
    const ay = (a.xyxy[0] + a.xyxy[2]) / 2, by = (b.xyxy[0] + b.xyxy[2]) / 2;
    // rough row grouping: same row if y-centers within half of min height
    const ha = a.xyxy[3] - a.xyxy[1], hb = b.xyxy[3] - b.xyxy[1];
    if (Math.abs(ca[1] - cb[1]) < Math.min(ha, hb) * 0.5) {
      return rtl ? cb[0] - ca[0] : ca[0] - cb[0];
    }
    return ca[1] - cb[1];
  });
}

export function shrinkBbox(xyxy, pct) {
  const [x1, y1, x2, y2] = xyxy;
  const w = x2 - x1, h = y2 - y1;
  return [x1 + w * pct, y1 + h * pct, x2 - w * pct, y2 - h * pct];
}

export function clampBox(xyxy, w, h) {
  let [x1, y1, x2, y2] = xyxy;
  x1 = Math.max(0, Math.min(w, x1)); x2 = Math.max(0, Math.min(w, x2));
  y1 = Math.max(0, Math.min(h, y1)); y2 = Math.max(0, Math.min(h, y2));
  return [x1, y1, x2, y2];
}

// adjust_text_line_coordinates port: expand by x%/y% of box size, clamp to image.
export function adjustTextLineCoords(xyxy, expXpct, expYpct, imgW, imgH) {
  const [x1, y1, x2, y2] = xyxy;
  const w = x2 - x1, h = y2 - y1;
  const ex = (w * expXpct) / 100, ey = (h * expYpct) / 100;
  const nx1 = Math.max(0, Math.floor(x1 - ex)), ny1 = Math.max(0, Math.floor(y1 - ey));
  const nx2 = Math.min(imgW, Math.ceil(x2 + ex)), ny2 = Math.min(imgH, Math.ceil(y2 + ey));
  return [nx1, ny1, nx2, ny2];
}

function boxArea(xyxy) {
  return Math.max(0, xyxy[2] - xyxy[0]) * Math.max(0, xyxy[3] - xyxy[1]);
}

export function boxIoU(a, b) {
  const ix1 = Math.max(a[0], b[0]), iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]), iy2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (!inter) return 0;
  return inter / (boxArea(a) + boxArea(b) - inter);
}

// Merge overlapping text boxes (port of merge_overlapping_boxes, IoU-based).
export function mergeOverlappingBoxes(boxes, iouThresh = 0.3) {
  const boxesLeft = boxes.map(b => [...b]);
  const merged = [];
  while (boxesLeft.length) {
    const cur = boxesLeft.pop();
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      for (let i = boxesLeft.length - 1; i >= 0; i--) {
        if (boxIoU(cur, boxesLeft[i]) > iouThresh) {
          const o = boxesLeft.splice(i, 1)[0];
          cur[0] = Math.min(cur[0], o[0]); cur[1] = Math.min(cur[1], o[1]);
          cur[2] = Math.max(cur[2], o[2]); cur[3] = Math.max(cur[3], o[3]);
          didMerge = true;
        }
      }
    }
    merged.push(cur);
  }
  return merged;
}
