// Background service worker: pipeline orchestration, model management,
// translation APIs, capture, debug emission. ML inference itself lives in
// the offscreen document; pure-JS stages (blocks, mask) run here.
import { MSG, STAGES, STAGE_LABEL } from '../shared/contracts.js';
import { MODEL_GROUPS, getModelStatus, deleteModelGroup } from '../shared/model-specs.js';
import { getSettings } from '../shared/settings.js';
import {
  makeTextBlock, mergeOverlappingBoxes, sortBlocks,
  boxIoU, clampBox,
} from '../shared/textblock.js';
import { toGrayU8, meanBrightness } from '../offscreen/ml/image-ops.js';
import { pixelPut, pixelTake, pixelDrop } from '../shared/pixel-bus.js';
import { generateMask } from '../offscreen/ml/mask.js';
import { mergePaddedBoxes } from '../offscreen/ml/inpaint.js';
import { translateBlocks, checkAzure, checkLmStudio, BACKEND_LABEL } from './translators.js';
import { mlHostAlive, ensureMlHost, callMl, makeCanvas, canvasToBlob } from './ml-bridge.js';

// Content script path for scripting.executeScript.
// Chrome: service worker, paths relative to extension root.
// Firefox: background page at src/background/, Firefox resolves `files`
//   relative to the calling page (not the extension root), so we go up one.
const CONTENT_SCRIPT_FILES = (typeof window !== 'undefined' && window.document)
  ? ['../content/content.js']
  : ['src/content/content.js'];

// ---------------------------------------------------------------- site whitelist
function hostOf(url) {
  try {
    const u = new URL(url || '');
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.toLowerCase();
  } catch { return null; }
}

// Exact hostname or parent-domain match: 'example.com' covers 'img.example.com'.
function isWhitelisted(host, list) {
  const h = (host || '').toLowerCase();
  return (list || []).some(e => {
    const w = String(e || '').toLowerCase().trim();
    return w && (h === w || h.endsWith('.' + w));
  });
}

// scripting.executeScript needs a host permission for the tab's origin. That
// permission is only granted when the user adds the site through the popup
// (a click = the user gesture permissions.request requires) — a site typed
// into Options never gets it. Without it every run dies here, silently as far
// as the page is concerned (nothing can be injected to show an error).
async function hasHostAccess(host) {
  try {
    // permissions.contains needs a granted SUPERSET of the queried pattern:
    // a manifest-baked `http://127.0.0.1/*` grant does NOT satisfy a
    // `*://127.0.0.1/*` query, so also accept the scheme-specific grants.
    if (await chrome.permissions.contains({ origins: [`*://${host}/*`] })) return true;
    if (await chrome.permissions.contains({ origins: [`http://${host}/*`] })) return true;
    return await chrome.permissions.contains({ origins: [`https://${host}/*`] });
  } catch { return true; } // check unavailable: let the injection attempt decide
}

function hostAccessError(host) {
  return new Error(
    `"${host}" is whitelisted but the extension has no access to it, so nothing can be translated. ` +
    `Open the extension popup on this site and click "Grant access".`);
}

// ---------------------------------------------------------------- state
const runs = new Map();          // runId -> {cancelled, tabId, stage}
let currentRun = null;           // {runId, stage, progress} | null

const isCancelled = runId => runs.get(runId)?.cancelled;
function checkCancelled(runId) {
  if (isCancelled(runId)) throw Object.assign(new Error('cancelled'), { cancelled: true });
}

// ML call that honours cancellation: if the ML host aborted the work because
// the run was cancelled (ML_CANCEL), surface the quiet 'cancelled' shape
// instead of a scary host error.
async function callMlChecked(runId, msg) {
  try {
    return await callMl(msg);
  } catch (e) {
    checkCancelled(runId);
    throw e;
  }
}

// Cancel every in-flight run for a tab, now. Marks them (stage boundaries
// abort) and tells the ML host to stop burning CPU on them too.
async function cancelRunsForTab(tabId) {
  const ids = [];
  for (const [id, r] of runs) {
    if (r.tabId === tabId) { r.cancelled = true; ids.push(id); }
  }
  for (const id of ids) {
    try { await callMl({ type: MSG.ML_CANCEL, runId: id }); } catch { /* host may be down */ }
  }
  return ids.length;
}

// ---------------------------------------------------------------- ML host (see ml-bridge.js)
// Chrome runs inference in an offscreen document; Firefox runs it in-process
// in the background page (no offscreen API there).

// ---------------------------------------------------------------- capture
function bitmapToRGBA(bmp, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  return { rgba: img.data, w, h };
}

// Direct download of the page image (needs the host permission the popup
// requests on click). Full resolution, no viewport limits.
async function fetchImagePixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('image download failed: HTTP ' + res.status);
  return bitmapToRGBA(await createImageBitmap(await res.blob()), 2560);
}

// Pipeline input: the page's own picture — never a screenshot of the page.
// Tier 1a: pixels straight from the page canvas (works when the image host
// sends CORS headers). Tier 1b: background fetch of the image URL (needs the
// host permission the popup requests on click). If neither can read the
// picture we throw an actionable error; there is no screenshot fallback.
async function getPipelineImage(tabId, settings) {
  const minSize = settings.minImageSize || 500;
  const tooSmall = (w, h) => {
    if (Math.max(w, h) < minSize) {
      throw new Error(`page image is ${w}×${h}px — below the minimum image size of ${minSize}px (change it in Options)`);
    }
  };
  let info = null;
  try { info = (await chrome.tabs.sendMessage(tabId, { type: 'ct/find-image' }))?.image || null; }
  catch { info = null; }
  if (!info || !info.src) {
    throw new Error('no picture found on this page — the extension translates the page\'s own picture, not a screenshot of the page');
  }
  tooSmall(info.w || 0, info.h || 0);
  const failures = [];
  // Tier 1a: pixels straight from the page.
  try {
    const p = await chrome.tabs.sendMessage(tabId, { type: 'ct/get-image-pixels' });
    if (p && p.ok) {
      const rgba = new Uint8ClampedArray(p.data);
      // A blank (all-black) capture fed to the detector yields 2 bogus
      // full-page boxes, so validate the pixels before accepting them.
      if (meanBrightness(rgba) >= 0.004) return { rgba, w: p.w, h: p.h, mode: 'replace', tier: 'page-canvas' };
      failures.push('page canvas returned blank pixels');
    } else {
      failures.push('page canvas: ' + String((p && p.error) || 'no pixels').slice(0, 100));
    }
  } catch (e) { failures.push('page canvas: ' + String((e && e.message) || e).slice(0, 100)); }
  // Tier 1b: background fetch of the image URL.
  try {
    const { rgba, w, h } = await fetchImagePixels(info.src);
    tooSmall(w, h);
    return { rgba, w, h, mode: 'replace', tier: 'worker-fetch' };
  } catch (e) { failures.push('download: ' + String((e && e.message) || e).slice(0, 120)); }
  let imgHost = '';
  try { imgHost = new URL(info.src).hostname; } catch { /* keep it empty */ }
  throw new Error(
    `couldn't read the page's picture (${failures.join('; ')}). ` +
    (imgHost
      ? `The picture is hosted on ${imgHost} — open the extension popup on this page and click "Grant access to ${imgHost}".`
      : `If the picture is hosted on another site, open the extension popup on this page and click "Grant access".`));
}

// ---------------------------------------------------------------- pixel helpers
function cropRGBA(src, sw, x1, y1, x2, y2) {
  const w = x2 - x1, h = y2 - y1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    out.set(src.subarray(((y1 + y) * sw + x1) * 4, ((y1 + y) * sw + x2) * 4), y * w * 4);
  }
  return { data: out, w, h };
}

function cropMask1(src, sw, x1, y1, x2, y2) {
  const w = x2 - x1, h = y2 - y1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(src.subarray((y1 + y) * sw + x1, (y1 + y) * sw + x2), y * w);
  return out;
}

function pasteRGBA(dst, dw, src, x, y) {
  const w = src.w, h = src.h;
  for (let r = 0; r < h; r++) {
    dst.set(src.data.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * dw + x) * 4);
  }
}

function cssColor(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Foreground (text) color: mean color of the minority-polarity pixels in the box.
function extractFgColor(rgba, w, xyxy) {
  const [x1, y1, x2, y2] = xyxy.map(v => Math.max(0, Math.round(v)));
  let dark = 0, light = 0, dr = 0, dg = 0, db = 0, lr = 0, lg = 0, lb = 0;
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const o = (y * w + x) * 4;
      const lum = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
      if (lum < 128) { dark++; dr += rgba[o]; dg += rgba[o + 1]; db += rgba[o + 2]; }
      else { light++; lr += rgba[o]; lg += rgba[o + 1]; lb += rgba[o + 2]; }
    }
  }
  if (dark === 0 && light === 0) return '#000000';
  // text is usually the minority polarity
  if (dark <= light && dark > 0) return cssColor(dr / dark, dg / dark, db / dark);
  if (light > 0) return cssColor(lr / light, lg / light, lb / light);
  return cssColor(dr / dark, dg / dark, db / dark);
}

// Crop bounds for OCR: text box expanded 5%, bubble fallback (port of the
// Python adjust_text_line_coordinates usage in the OCR stage of
// ogkalu2/comic-translate, Apache License 2.0).
function cropForBlock(rgba, pw, ph, xyxy, bubbleXyxy) {
  const box = xyxy || bubbleXyxy;
  if (!box) return null;
  const [x1, y1, x2, y2] = box;
  const ex = ((x2 - x1) * 5) / 100, ey = ((y2 - y1) * 5) / 100;
  const cx1 = Math.max(0, Math.floor(x1 - ex)), cy1 = Math.max(0, Math.floor(y1 - ey));
  const cx2 = Math.min(pw, Math.ceil(x2 + ex)), cy2 = Math.min(ph, Math.ceil(y2 + ey));
  if (cx2 <= cx1 || cy2 <= cy1) return null;
  return { ...cropRGBA(rgba, pw, cx1, cy1, cx2, cy2), x: cx1, y: cy1 };
}

// ---------------------------------------------------------------- blocks
function buildBlocks(detections, w, h, rgba, settings) {
  const bubbles = detections.filter(d => d.label === 0).map(d => d.xyxy);
  const textBoxes = detections.filter(d => d.label !== 0).map(d => d.xyxy);
  const merged = mergeOverlappingBoxes(textBoxes, 0.3);
  const blocks = merged.map(xyxy => {
    const b = makeTextBlock({ xyxy: clampBox(xyxy, w, h) });
    const cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
    let best = null, bestScore = 0;
    for (const bb of bubbles) {
      const inside = cx >= bb[0] && cx <= bb[2] && cy >= bb[1] && cy <= bb[3];
      const score = (inside ? 1 : 0) + boxIoU(xyxy, bb);
      if (score > bestScore) { bestScore = score; best = bb; }
    }
    if (best && bestScore > 0.05) {
      b.text_class = 'text_bubble';
      b.bubble_xyxy = best;
    }
    b.font_color = extractFgColor(rgba, w, b.xyxy);
    b.source_lang = settings.sourceLang;
    b.target_lang = settings.targetLang;
    return b;
  });
  return sortBlocks(blocks, true);
}

// ---------------------------------------------------------------- debug helpers
async function rgbaToDataURL(rgba, w, h, maxDim = 420) {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
  const src = makeCanvas(w, h);
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const c = makeCanvas(dw, dh);
  c.getContext('2d').drawImage(src, 0, 0, dw, dh);
  const blob = await canvasToBlob(c, 'image/png');
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return 'data:image/png;base64,' + btoa(bin);
}

function maskToRGBA(mask, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 255 : 0;
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

async function emitDebug(runId, tabId, settings, stage, payload) {
  if (!settings.debugMode) return;
  try {
    // Race against a timeout: on some browsers tabs.sendMessage can hang
    // (neither resolve nor reject), which would stall the pipeline — the
    // mask branch must resolve so inpaint can start.
    await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: MSG.DEBUG_STAGE, runId, stage, payload, debug: true,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('emitDebug timeout')), 5000)),
    ]);
  } catch { /* content script not there yet or send hung */ }
}

function setProgress(runId, stage, progress) {
  currentRun = { runId, stage, progress };
  const payload = { type: MSG.RUN_PROGRESS, runId, stage, progress };
  chrome.runtime.sendMessage(payload).catch(() => {});
  // Targeted copy for the tab's status pill (broadcasts reach every tab).
  const tabId = runs.get(runId)?.tabId;
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { ...payload, direct: true }).catch(() => {});
  }
}

function broadcastError(runId, error) {
  currentRun = { runId, stage: 'error', progress: 0, error };
  const payload = { type: MSG.RUN_PROGRESS, runId, stage: 'error', error };
  chrome.runtime.sendMessage(payload).catch(() => {});
  const tabId = runs.get(runId)?.tabId;
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { ...payload, direct: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------- pipeline
async function runPipeline(tabId) {
  const runId = 'run-' + Date.now().toString(36);
  runs.set(runId, { cancelled: false, tabId });
  const settings = await getSettings();
  const timings = {};
  const pipelineT0 = performance.now(); // overall wall-clock for this run
  const pxKeys = []; // IDB pixel-bus keys created this run; dropped in finally
  let result;
  try {
    // Inject the overlay early so debug-stage payloads have a panel to land in.
    // content.js guards against double-injection; the canvas stays empty until render.
    // Gate on the host permission first: without it injection always fails, and
    // the error below names the fix instead of a cryptic browser message.
    const tabHost = hostOf((await chrome.tabs.get(tabId).catch(() => null))?.url || '');
    if (tabHost && !(await hasHostAccess(tabHost))) throw hostAccessError(tabHost);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/host permission/i.test(msg) && tabHost) throw hostAccessError(tabHost);
      throw new Error('could not access this tab (extension pages and some sites block injection): ' + msg.slice(0, 100));
    }
    // Tell the page this run is the current one. A render from any older run
    // (e.g. a page the user already left) is ignored by the content script.
    try {
      await chrome.tabs.sendMessage(tabId, { type: MSG.RUN_STARTED, runId });
    } catch { /* content script not there yet */ }
    // ---- 1. capture: the page's own picture (min-size gated), else viewport
    setProgress(runId, 'capture', 0.02);
    let t0 = performance.now();
    const { rgba, w, h, mode, tier } = await getPipelineImage(tabId, settings);
    timings.capture = Math.round(performance.now() - t0);
    const capMean = meanBrightness(rgba);
    if (capMean < 0.004) {
      throw new Error(
        `captured image came back blank (all pixels black) via "${tier}" — ` +
        `the page's picture could not be read. Reload the page and try again; ` +
        `if it persists, the site may be blocking pixel access.`);
    }
    await emitDebug(runId, tabId, settings, 'capture',
      { title: `Captured page — ${tier}, mean brightness ${capMean.toFixed(3)}`, image: await rgbaToDataURL(rgba, w, h), w, h, ms: timings.capture });

    // ---- 2. detection (+ tall-image slicing)
    checkCancelled(runId);
    setProgress(runId, 'detect', 0.1);
    t0 = performance.now();
    let detections, detectInputMean = null;
    if (h / w > 3.5) {
      detections = await detectSliced(rgba, w, h, settings.detectionThreshold, runId, pxKeys);
    } else {
      // NOTE: pixel bytes go through the IDB pixel bus — chrome.runtime
      // messaging drops ArrayBuffers sent from the service worker.
      const pxKey = `detect:${runId}`;
      pxKeys.push(pxKey);
      await pixelPut(pxKey, rgba.buffer);
      const r = await callMlChecked(runId, { type: MSG.ML_DETECT, key: pxKey, width: w, height: h, threshold: settings.detectionThreshold, runId });
      detections = r.boxes;
      timings.detect = r.ms;
      detectInputMean = r.inputMean;
      if (detectInputMean != null && detectInputMean < 0.004) {
        throw new Error(`the detector received a blank image (input mean ${detectInputMean}) ` +
          `although the capture looked fine (mean ${capMean.toFixed(3)}) — pixel data was lost ` +
          `between capture and detection. Reload the page and try again.`);
      }
    }
    if (!timings.detect) timings.detect = Math.round(performance.now() - t0);
    setProgress(runId, 'detect', 0.25);
    await emitDebug(runId, tabId, settings, 'detect', {
      title: `Detection — ${detections.length} boxes @ ≥${settings.detectionThreshold}` +
        (detectInputMean != null ? ` (detector input mean ${detectInputMean})` : ''),
      boxes: detections, w, h, threshold: settings.detectionThreshold, ms: timings.detect,
      image: await rgbaToDataURL(rgba, w, h),
    });

    // ---- 3. text blocks
    checkCancelled(runId);
    t0 = performance.now();
    const blocks = buildBlocks(detections, w, h, rgba, settings);
    timings.blocks = Math.round(performance.now() - t0);
    setProgress(runId, 'blocks', 0.3);
    await emitDebug(runId, tabId, settings, 'blocks', {
      title: `Text blocks — ${blocks.length}`,
      blocks: blocks.map((b, i) => ({
        i, text_class: b.text_class,
        xyxy: b.xyxy.map(v => Math.round(v)),
        bubble_xyxy: b.bubble_xyxy ? b.bubble_xyxy.map(v => Math.round(v)) : null,
        font_color: b.font_color,
      })),
      ms: timings.blocks,
    });

    // ---- 4. OCR (sequential — the mask stage needs blk.text, so it must
    // wait for OCR; see buildBlockMaskData's `if (!blk.text ...)` guard).
    checkCancelled(runId);
    setProgress(runId, 'ocr', 0.38);
    {
      const crops = [];
      for (const [i, b] of blocks.entries()) {
        const c = cropForBlock(rgba, w, h, b.xyxy, b.bubble_xyxy);
        if (!c) continue;
        const pxKey = `ocr:${runId}:${i}`;
        pxKeys.push(pxKey);
        await pixelPut(pxKey, c.data.buffer);
        crops.push({ id: i, key: pxKey, data: c.data, width: c.w, height: c.h, x: c.x, y: c.y, bw: b.xyxy[2] - b.xyxy[0], bh: b.xyxy[3] - b.xyxy[1] });
      }
      let ocrMs = 0, ocrEngineLabel = '';
      if (crops.length) {
        const r = await callMlChecked(runId, {
          type: MSG.ML_OCR, runId, sourceLang: settings.sourceLang,
          crops: crops.map(({ id, key, width, height }) => ({ id, key, width, height })),
        });
        ocrMs = r.ms;
        ocrEngineLabel = (MODEL_GROUPS.find(g => g.id === r.engine) || {}).label || r.engine || '';
        for (const res of r.results) blocks[res.id].text = res.text;
      }
      timings.ocr = ocrMs;
      setProgress(runId, 'ocr', 0.55);
      const ocrThumbs = [];
      for (const c of crops.slice(0, 40)) {
        ocrThumbs.push({
          id: c.id, text: blocks[c.id].text,
          thumb: await rgbaToDataURL(c.data, c.width, c.height, 200),
        });
      }
      await emitDebug(runId, tabId, settings, 'ocr', {
        title: `OCR — ${crops.length} crops${ocrEngineLabel ? ` (${ocrEngineLabel})` : ''}`, crops: ocrThumbs, ms: ocrMs,
      });
    }

    // ---- 5+6+7. translate || (mask -> inpaint). Translate and mask both need
    // only the OCR text and are independent of each other (translate: network
    // I/O here; mask: CPU here). Inpaint needs the mask, so it chains off the
    // mask promise and starts as soon as the mask is done — it does not wait
    // for translate. Render waits for both translate and inpaint.
    checkCancelled(runId);
    const par = { translate: 0, mask: 0, inpaint: 0 };
    let parMax = 0.58;
    const parProgress = (branch, frac) => {
      par[branch] = frac;
      parMax = Math.max(parMax, 0.58 + 0.32 * (par.translate + par.mask + par.inpaint) / 3);
      setProgress(runId, branch, parMax);
    };
    const translateP = (async () => {
      parProgress('translate', 0);
      const t0t = performance.now();
      const translated = await translateBlocks(blocks, settings);
      checkCancelled(runId);
      blocks.forEach((b, i) => { b.translation = translated[i]; });
      const translateMs = Math.round(performance.now() - t0t);
      parProgress('translate', 1);
      await emitDebug(runId, tabId, settings, 'translate', {
        title: `Translation — ${BACKEND_LABEL[settings.translationBackend] || settings.translationBackend}`,
        rows: blocks.map(b => ({ text: b.text, translation: b.translation })),
        ms: translateMs,
      });
      return { translateMs };
    })();
    const maskP = (async () => {
      parProgress('mask', 0);
      const t0m = performance.now();
      const pageGray = toGrayU8(rgba, w, h);
      const { mask: fullMask, entries } = generateMask(rgba, w, h, pageGray, blocks, 5);
      const maskMs = Math.round(performance.now() - t0m);
      parProgress('mask', 1);
      await emitDebug(runId, tabId, settings, 'mask', {
        title: `Mask — ${entries.length} block masks`,
        mask: await rgbaToDataURL(maskToRGBA(fullMask, w, h), w, h), ms: maskMs,
      });
      return { fullMask, entries, maskMs };
    })();
    const inpaintP = maskP.then(async ({ fullMask, entries, maskMs }) => {
      checkCancelled(runId);
      parProgress('inpaint', 0);
      const t0i = performance.now();
      const patchBoxes = mergePaddedBoxes(entries, 8, w, h);
      const patches = [];
      for (const [i, pb] of patchBoxes.entries()) {
        checkCancelled(runId);
        const [x1, y1, x2, y2] = pb.map(Math.round);
        const pxKey = `inpaint:${runId}:${i}`;
        const maskKey = `inpaint-mask:${runId}:${i}`;
        pxKeys.push(pxKey, maskKey);
        await pixelPut(pxKey, cropRGBA(rgba, w, x1, y1, x2, y2).data.buffer);
        await pixelPut(maskKey, cropMask1(fullMask, w, x1, y1, x2, y2).buffer);
        patches.push({ id: i, x: x1, y: y1, key: pxKey, maskKey, width: x2 - x1, height: y2 - y1 });
      }
      const inpainted = new Uint8ClampedArray(rgba);
      let inpaintMs = 0;
      if (patches.length) {
        const r = await callMlChecked(runId, {
          type: MSG.ML_INPAINT, runId,
          patches: patches.map(({ id, key, maskKey, width, height }) => ({ id, key, maskKey, width, height })),
        });
        inpaintMs = r.ms;
        for (const res of r.results) {
          const p = patches[res.id];
          pxKeys.push(res.key);
          const buf = await pixelTake(res.key);
          pasteRGBA(inpainted, w, { data: new Uint8ClampedArray(buf), w: p.width, h: p.height }, p.x, p.y);
        }
      }
      const totalInpaintMs = Math.round(performance.now() - t0i);
      parProgress('inpaint', 1);
      await emitDebug(runId, tabId, settings, 'inpaint', {
        title: `Inpaint — ${patches.length} patches`,
        image: await rgbaToDataURL(inpainted, w, h), ms: inpaintMs,
      });
      return { inpainted, inpaintMs, maskMs, totalInpaintMs };
    });

    const [translateOut, inpaintOut] = await Promise.all([translateP, inpaintP]);
    timings.translate = translateOut.translateMs;
    timings.mask = inpaintOut.maskMs;
    timings.inpaint = inpaintOut.totalInpaintMs;
    const { inpainted } = inpaintOut;

    // ---- 8. render: translated text composited onto the image.
    // mode 'replace' swaps the page's original <img>; 'overlay' shows it in the overlay.
    // NOTE: the finished picture travels as a PNG data URL — raw pixel buffers
    // don't survive chrome.tabs messaging from the service worker either.
    checkCancelled(runId);
    setProgress(runId, 'render', 0.96);
    const finalDataUrl = await rgbaToDataURL(inpainted, w, h, Math.max(w, h));
    // Same tick as the send below: a cancellation can never slip in between
    // and let a stale render reach the tab.
    checkCancelled(runId);
    timings.total = Math.round(performance.now() - pipelineT0);
    const renderRes = await chrome.tabs.sendMessage(tabId, {
      type: MSG.RENDER, runId, mode,
      imageDataUrl: finalDataUrl, width: w, height: h,
      blocks, timings, debug: settings.debugMode,
    });
    // Surface a content-side render failure instead of silently reporting
    // "done" while the original image is still on the page.
    if (!renderRes || renderRes.ok === false) {
      throw new Error('render failed: ' + String((renderRes && renderRes.error) || 'no response from page'));
    }
    if (renderRes.replaced === false) {
      throw new Error('render failed: could not find the page image to replace');
    }
    setProgress(runId, 'done', 1);
    result = { runId, ok: true };
  } catch (e) {
    let msg;
    if (e && e.cancelled) {
      setProgress(runId, 'cancelled', 0);
      msg = 'cancelled';
    } else {
      msg = String((e && e.message) || e);
      broadcastError(runId, msg);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
        await chrome.tabs.sendMessage(tabId, { type: MSG.DEBUG_STAGE, runId, stage: 'error', payload: { title: 'Error', error: msg } });
      } catch { /* ignore */ }
    }
    result = { runId, ok: false, error: msg, cancelled: !!(e && e.cancelled) };
  } finally {
    runs.delete(runId);
    // Drop any pixel payloads this run staged but never got taken.
    for (const k of pxKeys) await pixelDrop(k);
  }
  return result;
}

// Tall-image detection: vertical slices (ratio 3.0, overlap 0.2), merge.
async function detectSliced(rgba, w, h, threshold, runId, pxKeys) {
  const sliceH = Math.round(w * 3.0);
  const step = Math.round(sliceH * 0.8);
  const all = [];
  for (let y0 = 0; y0 < h; y0 += step) {
    checkCancelled(runId);
    const y1 = Math.min(h, y0 + sliceH);
    const c = cropRGBA(rgba, w, 0, y0, w, y1);
    const pxKey = `detect:${runId}:slice${y0}`;
    pxKeys.push(pxKey);
    await pixelPut(pxKey, c.data.buffer);
    const r = await callMlChecked(runId, {
      type: MSG.ML_DETECT, key: pxKey, width: w, height: c.h, threshold, runId,
    });
    for (const b of r.boxes) {
      all.push({ ...b, xyxy: [b.xyxy[0], b.xyxy[1] + y0, b.xyxy[2], b.xyxy[3] + y0] });
    }
    if (y1 >= h) break;
  }
  return all;
}

// ---------------------------------------------------------------- auto-translate on page load
// Fires the pipeline automatically when a whitelisted page finishes loading —
// no button click needed. One run per page load; only for the active tab.
const autoFired = new Map(); // tabId -> {url, at}
chrome.tabs.onRemoved.addListener(tabId => autoFired.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo || changeInfo.status !== 'complete') return;
  (async () => {
    try {
      const settings = await getSettings();
      if (!settings.autoTranslateOnLoad) return;
      if (!tab || !tab.active) return; // translate what you're looking at
      const host = hostOf(tab.url || '');
      if (!host || !isWhitelisted(host, settings.siteWhitelist || [])) return;
      const url = tab.url;
      const prev = autoFired.get(tabId);
      const now = Date.now();
      if (prev && prev.url === url && now - prev.at < 120000) return; // same load, don't double-fire
      // New page: drop whatever the tab was doing and start fresh immediately.
      // A stale run must never finish on top of the new page.
      await cancelRunsForTab(tabId);
      autoFired.set(tabId, { url, at: now });
      const r = await runPipeline(tabId);
      if (!r.ok && !r.cancelled) console.warn('[ct] auto-translate failed:', String(r.error).slice(0, 160));
    } catch (e) {
      console.warn('[ct] auto-translate error:', String((e && e.message) || e).slice(0, 120));
    }
  })();
});

// ---------------------------------------------------------------- message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case MSG.TRANSLATE_PAGE: {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || tab.id == null) throw new Error('no active tab');
          if (/^chrome:\/\//.test(tab.url || '')) throw new Error('cannot run on chrome:// pages');
          const settings = await getSettings();
          const host = hostOf(tab.url);
          if (!host) throw new Error('cannot determine the site of this tab');
          if (!isWhitelisted(host, settings.siteWhitelist || [])) {
            throw new Error(`"${host}" is not in your site whitelist — add it from the popup or Options to translate here`);
          }
          // Awaited (not fire-and-forget): the worker stays alive for the whole run.
          // Any in-flight run for this tab is dropped first — the new request wins.
          await cancelRunsForTab(tab.id);
          const r = await runPipeline(tab.id);
          sendResponse(r.ok ? { ok: true, runId: r.runId } : { ok: false, error: r.error });
          break;
        }
        case MSG.CHECK_AZURE: {
          const s = await getSettings();
          sendResponse(await checkAzure(s));
          break;
        }
        case MSG.CHECK_LMSTUDIO: {
          const s = await getSettings();
          sendResponse(await checkLmStudio(s));
          break;
        }
        case MSG.CANCEL_RUN: {
          for (const [, r] of runs) r.cancelled = true;
          for (const [id] of runs) {
            try { await callMl({ type: MSG.ML_CANCEL, runId: id }); } catch { /* host may be down */ }
          }
          sendResponse({ ok: true });
          break;
        }
        case MSG.GET_STATUS: {
          sendResponse({ ok: true, status: currentRun || { stage: 'idle', progress: 0 } });
          break;
        }
        case MSG.GET_MODELS: {
          sendResponse({ ok: true, models: await getModelStatus() });
          break;
        }
        case MSG.DOWNLOAD_MODEL: {
          await ensureMlHost();
          // fire-and-forget; progress arrives via MODEL_PROGRESS broadcasts
          callMl({ type: MSG.ML_DOWNLOAD, fileId: msg.fileId }).then(
            () => chrome.runtime.sendMessage({
              type: MSG.MODEL_PROGRESS, fileId: msg.fileId, done: true,
            }).catch(() => {}),
            e => chrome.runtime.sendMessage({
              type: MSG.MODEL_PROGRESS, fileId: msg.fileId,
              error: String((e && e.message) || e),
            }).catch(() => {}),
          );
          sendResponse({ ok: true });
          break;
        }
        case MSG.DELETE_MODEL: {
          await deleteModelGroup(msg.id);
          // Drop any loaded session built from the deleted bytes.
          try { await callMl({ type: MSG.ML_RESET, group: msg.id }); } catch { /* offscreen not up */ }
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});
