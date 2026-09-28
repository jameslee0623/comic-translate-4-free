// Low-level image ops for the ML host. All typed-array based, no DOM needed.
// Binary masks are Uint8Array with values 0/1 unless noted.

export function resizeBilinearRGBA(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    // center-aligned sampling: dst pixel center -> src coords
    let sy = (y + 0.5) * yr - 0.5;
    sy = sy < 0 ? 0 : sy > sh - 1 ? sh - 1 : sy;
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), wy = sy - y0;
    for (let x = 0; x < dw; x++) {
      let sx = (x + 0.5) * xr - 0.5;
      sx = sx < 0 ? 0 : sx > sw - 1 ? sw - 1 : sx;
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), wx = sx - x0;
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c], b = src[(y0 * sw + x1) * 4 + c];
        const cc = src[(y1 * sw + x0) * 4 + c], d = src[(y1 * sw + x1) * 4 + c];
        out[o + c] = a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + cc * (1 - wx) * wy + d * wx * wy;
      }
    }
  }
  return out;
}

// RGBA Uint8 -> Float32 NCHW RGB, /255
export function toNCHW(rgba, w, h) {
  const out = new Float32Array(3 * h * w);
  for (let i = 0; i < w * h; i++) {
    const s = i * 4;
    out[i] = rgba[s] / 255;
    out[w * h + i] = rgba[s + 1] / 255;
    out[2 * w * h + i] = rgba[s + 2] / 255;
  }
  return out;
}

export function toGrayU8(rgba, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return out;
}

// Otsu's method -> threshold in [0,255]
export function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thresh = t; }
  }
  return thresh;
}

// Two-pass connected components with stats (union-find). Returns labels Int32Array
// (0 = background, 1..N) and stats array indexed by label.
export function connectedComponentsWithStats(binary, w, h, connectivity = 8) {
  const labels = new Int32Array(w * h);
  const parent = [0];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };

  const nb4 = [[-1, 0], [0, -1]];
  const nb8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1]];
  const nbs = connectivity === 8 ? nb8 : nb4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!binary[i]) continue;
      const neighborLabels = [];
      for (const [dy, dx] of nbs) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
        const li = ny * w + nx;
        if (binary[li] && labels[li] > 0) neighborLabels.push(labels[li]);
      }
      if (!neighborLabels.length) {
        parent.push(parent.length);
        labels[i] = parent.length - 1;
      } else {
        const m = Math.min(...neighborLabels.map(find));
        labels[i] = m;
        for (const l of neighborLabels) union(m, l);
      }
    }
  }
  // second pass: flatten + relabel + stats
  const remap = new Int32Array(parent.length);
  const stats = [{ left: 0, top: 0, width: 0, height: 0, area: 0 }]; // index 0 = bg
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!labels[i]) continue;
    const r = find(labels[i]);
    if (!remap[r]) { remap[r] = ++n; stats.push({ left: w, top: h, width: 0, height: 0, area: 0 }); }
    const nl = remap[r];
    labels[i] = nl;
    const st = stats[nl], x = i % w, y = (i / w) | 0;
    st.area++;
    if (x < st.left) st.left = x;
    if (y < st.top) st.top = y;
    if (x > st.left + st.width) st.width = x - st.left;
    if (y > st.top + st.height) st.height = y - st.top;
  }
  // width/height are currently max offsets; convert to spans
  for (let k = 1; k < stats.length; k++) { stats[k].width++; stats[k].height++; }
  return { numLabels: n, labels, stats };
}

// Binary dilate with square kernel kx×ky, iterations. Input/output Uint8 0/1.
// Border: replicate (clamped coordinates).
export function dilate(src, w, h, k, iterations = 1) {
  const r = Math.floor(k / 2);
  let cur = src;
  for (let it = 0; it < iterations; it++) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let dy = -r; dy <= r && !v; dy++) {
          const ny = dy < -y ? 0 : dy > h - 1 - y ? h - 1 : y + dy;
          for (let dx = -r; dx <= r; dx++) {
            const nx = dx < -x ? 0 : dx > w - 1 - x ? w - 1 : x + dx;
            if (cur[ny * w + nx]) { v = 1; break; }
          }
        }
        out[y * w + x] = v;
      }
    }
    cur = out;
  }
  return cur;
}

export function erode(src, w, h, k, iterations = 1) {
  const r = Math.floor(k / 2);
  let cur = src;
  for (let it = 0; it < iterations; it++) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 1;
        for (let dy = -r; dy <= r && v; dy++) {
          const ny = dy < -y ? 0 : dy > h - 1 - y ? h - 1 : y + dy;
          for (let dx = -r; dx <= r; dx++) {
            const nx = dx < -x ? 0 : dx > w - 1 - x ? w - 1 : x + dx;
            if (!cur[ny * w + nx]) { v = 0; break; }
          }
        }
        out[y * w + x] = v;
      }
    }
    cur = out;
  }
  return cur;
}

export function morphClose(src, w, h) {
  return erode(dilate(src, w, h, 3, 1), w, h, 3, 1);
}

// Fill holes in a binary mask (0/1): flood fill background from borders, invert.
export function fillHoles(src, w, h) {
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (visited[i] || src[i]) continue;
    visited[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = src[i] || !visited[i] ? 1 : 0;
  return out;
}

export function padToMod(rgba, w, h, mod) {
  const pw = Math.ceil(w / mod) * mod, ph = Math.ceil(h / mod) * mod;
  if (pw === w && ph === h) return { data: rgba, w, h };
  const out = new Uint8ClampedArray(pw * ph * 4).fill(0);
  for (let y = 0; y < h; y++) {
    out.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * pw * 4);
  }
  return { data: out, w: pw, h: ph };
}

// Histogram of u8 data -> {bgVal} dominant bin center over `bins` bins in [0,256)
export function dominantBinCenter(data, bins = 16) {
  const hist = new Uint32Array(bins);
  for (let i = 0; i < data.length; i++) hist[Math.min(bins - 1, (data[i] * bins) >> 8)]++;
  let bi = 0;
  for (let b = 1; b < bins; b++) if (hist[b] > hist[bi]) bi = b;
  return (bi + 0.5) * (256 / bins);
}

// Mean brightness of RGBA pixels in [0,1]. Used to catch blank captures:
// an all-black (or empty) capture fed to the detector yields 2 bogus
// full-page boxes, so the pipeline validates this before detecting.
export function meanBrightness(rgba) {
  const n = rgba.length >>> 2;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
  return sum / (n * 3 * 255);
}
