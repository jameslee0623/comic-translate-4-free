// Background service worker: pipeline orchestration, model management,
// translation APIs, capture, debug emission. ML inference itself lives in
// the offscreen document; pure-JS stages (blocks, mask) run here.
import { MSG } from '../shared/contracts.js';
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
import { detectPageLang } from '../shared/lang-detect.js';
import { mlHostAlive, ensureMlHost, callMl, makeCanvas, canvasToBlob, directHandlers } from './ml-bridge.js';
import {
  initPageCache, buildCacheKey, pageCacheGet, pageCachePut,
  pageCacheStats, clearPageCache,
} from '../shared/page-cache.js';
import { displayHost, hostOf, isSiteAllowed, imageHostOrigins } from '../shared/site-access.js';

// Translated-page cache is session-scoped: initPageCache() wipes the store on
// every browser startup (via a chrome.storage.session marker) and the
// get/put/stats helpers await that check before touching the store.
initPageCache();

// Content script path for scripting.executeScript.
// Chrome: service worker, paths relative to extension root.
// Firefox: background page at src/background/, Firefox resolves `files`
//   relative to the calling page (not the extension root), so we go up one.
const CONTENT_SCRIPT_FILES = (typeof window !== 'undefined' && window.document)
  ? ['../content/content.js']
  : ['src/content/content.js'];

// ---------------------------------------------------------------- site access

// scripting.executeScript needs a host permission for the tab's origin. That
// permission is only granted when the user adds the site through the popup
// (a click = the user gesture permissions.request requires) — a site typed
// into Settings never gets it. Without it every run dies here, silently as far
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
    `"${host}" is allowed but the extension has no access to it, so nothing can be translated. ` +
    `Open the extension popup on this site and click "Grant access".`);
}

// ---------------------------------------------------------------- state
const runs = new Map();          // runId -> {cancelled, tabId, stage}
let currentRun = null;           // {runId, stage, progress} | null
let runSeq = 0;                  // ensures runId uniqueness within the same millisecond

const isCancelled = runId => runs.get(runId)?.cancelled;
function checkCancelled(runId) {
  if (isCancelled(runId)) throw Object.assign(new Error('cancelled'), { cancelled: true });
}

// Firefox runs the ML host in-process in this same page (background-ff.js),
// so long tiled inpaints can report per-tile progress straight into the
// run's progress bar. (On Chrome the handlers live in the offscreen document
// and never see this hook.) Each run registers its own updater below.
globalThis.__ctInpaintProgress = (runId, frac) => {
  try {
    const r = runs.get(runId);
    if (r && typeof r.onInpaintProgress === 'function') r.onInpaintProgress(frac);
  } catch { /* progress must never break the pipeline */ }
};

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
// Capture resolution budget: scale by AREA, not max dimension. A maxDim cap
// crushes long strips (413x15402 -> 69x2560: text becomes undetectable mush
// and the re-render is blurry). 6.5MP keeps strips at full res while still
// bounding huge squares (8000x8000 -> 2560x2560, as before).
const CAPTURE_MAX_PIXELS = 2560 * 2560;
function bitmapToRGBA(bmp, maxPixels = CAPTURE_MAX_PIXELS) {
  const scale = Math.min(1, Math.sqrt(maxPixels / (bmp.width * bmp.height)));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  return { rgba: img.data, w, h };
}

// Decode a data-URL image into RGBA pixels. The content script transports
// binary as data URL strings because raw ArrayBuffers are silently emptied
// by extension messaging (verified in both directions).
async function dataUrlToRGBA(dataUrl, maxPixels = CAPTURE_MAX_PIXELS) {
  const blob = await (await fetch(dataUrl)).blob();
  return bitmapToRGBA(await createImageBitmap(blob), maxPixels);
}

// Direct download of the page image (needs the host permission the popup
// requests on click). Full resolution, no viewport limits.
// Referrer strategy: try WITHOUT a Referer first, then with the page origin.
// Pages with `Referrer-Policy: same-origin` load their cross-origin images
// with NO Referer, and some hosts/WAFs 403 anything else (myreadingmanga);
// hosts with hotlink protection 403 requests with NO Referer. Trying both
// covers both kinds; only a 403 falls through to the next attempt.
async function fetchImagePixels(url, referrer) {
  // Mimic the page's <img> load: image Accept header, user cookies, and the
  // Priority header browsers send on subresource image loads. (Sec-Fetch-Dest
  // can't be forged — fetch always sends `empty`, never `image` — so a strict
  // bot filter can still tell us apart.)
  const base = {
    credentials: 'include',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Priority: 'i',
    },
  };
  const tries = [{ ...base, referrerPolicy: 'no-referrer' }];
  if (referrer) tries.push({ ...base, referrer, referrerPolicy: 'strict-origin-when-cross-origin' });
  let lastErr = new Error('image download failed');
  for (const init of tries) {
    let res;
    try { res = await fetch(url, init); }
    catch (e) { lastErr = e; break; }
    if (res.ok) return bitmapToRGBA(await createImageBitmap(await res.blob()));
    lastErr = new Error('image download failed: HTTP ' + res.status);
    if (res.status !== 403) break;
  }
  throw lastErr;
}

// Pipeline input: the page's own picture — never a screenshot of the page.
// Tier 1a: pixels straight from the page canvas (works when the image host
// sends CORS headers). Tier 1b: download inside the page (content script),
// so the request carries the page's real referrer policy and cookies —
// exactly like the page's own <img> load. Tier 1c: background fetch of the
// image URL (needs the host permission the popup requests on click). If none
// can read the picture we throw an actionable error; there is no screenshot
// fallback.
async function getPipelineImage(tabId, settings, tabUrl, opts = {}) {
  // Manual send (right-click "Send to comic-translate-4-free"): translate
  // this exact image, bypassing the minimum image size — the user picked it.
  const manualSrc = opts.srcUrl || null;
  const minSize = settings.minImageSize || 500;
  const tooSmall = (w, h) => {
    if (Math.max(w, h) < minSize) {
      throw new Error(`page image is ${w}×${h}px — below the minimum image size of ${minSize}px (change it in Settings)`);
    }
  };
  let info = null;
  try {
    info = manualSrc
      ? (await chrome.tabs.sendMessage(tabId, { type: 'ct/find-image-by-src', srcUrl: manualSrc }))?.image || null
      : (await chrome.tabs.sendMessage(tabId, { type: 'ct/find-image' }))?.image || null;
  }
  catch { info = null; }
  if (!info || !info.src) {
    throw new Error(manualSrc
      ? 'could not find that image on the page anymore — it may have been removed or the page reloaded'
      : 'no picture found on this page — the extension translates the page\'s own picture, not a screenshot of the page');
  }
  if (!manualSrc) tooSmall(info.w || 0, info.h || 0);
  const failures = [];
  // Tier 1a: pixels straight from the page. Skipped when the page already
  // shows our translated render (info.translated): the canvas would hand back
  // the translated pixels, so the pipeline would translate the translation
  // and the page-cache key would never match. The download tier below fetches
  // the ORIGINAL url the content script reported, so pixels and cache key
  // stay correct and revisits hit the cache.
  if (!info.translated) {
    try {
      const p = await chrome.tabs.sendMessage(tabId,
        manualSrc ? { type: 'ct/get-image-pixels', srcUrl: manualSrc } : { type: 'ct/get-image-pixels' });
      if (p && p.ok && typeof p.dataUrl === 'string') {
        const { rgba, w, h } = await dataUrlToRGBA(p.dataUrl);
        // A blank (all-black) capture fed to the detector yields 2 bogus
        // full-page boxes, so validate the pixels before accepting them.
        if (meanBrightness(rgba) >= 0.004) return { rgba, w, h, mode: 'replace', tier: 'page-canvas' };
        failures.push('page canvas returned blank pixels');
      } else {
        failures.push('page canvas: ' + String((p && p.error) || 'no pixels').slice(0, 100));
      }
    } catch (e) { failures.push('page canvas: ' + String((e && e.message) || e).slice(0, 100)); }
  } else {
    failures.push('page canvas skipped (already showing the translated render)');
  }
  // Tier 1b: download inside the PAGE (content script). The browser applies the
  // page's real referrer policy and cookies — exactly like the page's own
  // <img> load. Some image hosts / WAFs (e.g. Cloudflare) 403 the service
  // worker's fetch because its Referer and Sec-Fetch-* headers don't match
  // what the page itself sends; this tier is indistinguishable from the page
  // loading the image itself. The extension's host permissions let the
  // content script read the cross-origin response bytes.
  try {
    const f = await chrome.tabs.sendMessage(tabId, { type: 'ct/fetch-image-bytes', srcUrl: info.src });
    if (f && f.ok && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) {
      const { rgba, w, h } = await dataUrlToRGBA(f.dataUrl);
      if (!manualSrc) tooSmall(w, h);
      return { rgba, w, h, mode: 'replace', tier: 'page-fetch' };
    }
    failures.push('page download: ' + String((f && f.error) || 'no bytes').slice(0, 100));
  } catch (e) { failures.push('page download: ' + String((e && e.message) || e).slice(0, 100)); }
  // Tier 1c: background fetch of the image URL (for an already-translated
  // page this is the ORIGINAL url, so the pixels — and the cache key — are
  // the originals, not the render).
  try {
    const { rgba, w, h } = await fetchImagePixels(info.src, tabUrl);
    if (!manualSrc) tooSmall(w, h);
    return { rgba, w, h, mode: 'replace', tier: 'worker-fetch' };
  } catch (e) { failures.push('download: ' + String((e && e.message) || e).slice(0, 120)); }
  let imgHost = '';
  try { imgHost = new URL(info.src).hostname; } catch { /* keep it empty */ }
  // Name the base domain, not the exact host: on sites with random per-visit
  // image subdomains the exact hostname is meaningless to the user, and the
  // grant the popup requests covers the base.
  const imgHostLabel = imgHost ? displayHost(imgHost) : '';
  // An HTTP status means the request went out — access was granted and the
  // SERVER refused it. Don't send the user on another grant-access errand.
  const serverRefused = /HTTP (401|403)/.test(failures.join(';'));
  // A revisit of an already-translated page downloads the ORIGINAL url the
  // content script stashed. Some hosts hand out expiring image links
  // (keystamp=...), so on revisit that saved link is dead — the fix is a
  // page reload for a fresh link, not another access grant.
  const staleOriginal = !!info.translated;
  const grantable = !serverRefused && !!imgHost && !staleOriginal;
  const err = new Error(
    `couldn't read the page's picture (${failures.join('; ')}). ` +
    (serverRefused
      ? `The image server${imgHostLabel ? ' (' + imgHostLabel + ')' : ''} refused the download${staleOriginal ? ' — the saved image link has likely expired' : ' even though access was granted'}. The page's own download attempt was blocked before it got an answer (cross-origin restrictions), and the background download got an HTTP refusal — this points to bot protection (e.g. Cloudflare) telling our automated download apart from the page's own image load, rather than a permission problem. This can be intermittent (works sometimes, blocked other times). Reload the page and try again; if it persists, wait a bit and retry — repeated attempts can trigger rate limiting.`
      : imgHost
        ? staleOriginal
          ? `The picture lives on ${imgHostLabel} but its saved image link no longer loads (these links expire, or the access grant was revoked) — reload the page for a fresh link and translate again; if the popup offers it, grant access to ${imgHostLabel} first.`
          : `The picture is hosted on ${imgHostLabel} — click "Allow ${imgHostLabel}" in the notice on the page, or grant it from the extension popup ("Grant access to ${imgHostLabel}").`
        : `If the picture is hosted on another site, open the extension popup on this page and click "Grant access".`));
  // The pill renders an "Allow <host>" button for this case (see broadcastError).
  if (grantable) err.grantHost = imgHost;
  // A server refusal (403) can be worked around by opening the image URL
  // directly in a tab: there it's same-origin, so the canvas tier reads it
  // with no download. The manual-send handler uses this for an automatic
  // background-tab fallback.
  if (serverRefused && info.src) err.fallbackUrl = info.src;
  throw err;
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

function broadcastError(runId, error, grant) {
  // The failed run's image host is kept on currentRun so the popup can offer
  // a one-click grant for exactly that host (ct/get-status -> refreshSite).
  currentRun = { runId, stage: 'error', progress: 0, error,
    ...(grant && grant.host ? { grantHost: grant.host, grantLabel: grant.label || grant.host } : {}) };
  const payload = { type: MSG.RUN_PROGRESS, runId, stage: 'error', error };
  if (grant && grant.host) { payload.grantHost = grant.host; payload.grantLabel = grant.label || grant.host; }
  chrome.runtime.sendMessage(payload).catch(() => {});
  const tabId = runs.get(runId)?.tabId;
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { ...payload, direct: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------- page cache
// Incognito tabs never touch the page cache — no reads, no writes. When the
// tab can't be inspected we err on the side of not caching.
async function isIncognitoTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab.incognito;
  } catch {
    return true;
  }
}

// Send the render payload to the page and verify it landed. Shared by the
// live pipeline and the page-cache hit path (which re-sends a stored entry).
// extra.srcUrl names the exact <img> for the manual-send path; the auto
// path omits it and the page replaces its detected main image.
async function sendRender(tabId, runId, mode, imageDataUrl, w, h, blocks, timings, debug, extra = {}) {
  const renderRes = await chrome.tabs.sendMessage(tabId, {
    type: MSG.RENDER, runId, mode,
    imageDataUrl, width: w, height: h,
    blocks, timings, debug,
    ...(extra.srcUrl ? { srcUrl: extra.srcUrl } : {}),
  });
  // Surface a content-side render failure instead of silently reporting
  // "done" while the original image is still on the page.
  if (!renderRes || renderRes.ok === false) {
    throw new Error('render failed: ' + String((renderRes && renderRes.error) || 'no response from page'));
  }
  if (renderRes.replaced === false) {
    throw new Error('render failed: could not find the page image to replace');
  }
  return renderRes;
}

// Cache hit: re-send the stored translated page. The runId is the one the
// page already knows (RUN_STARTED went out before capture), and the message
// shape is identical to the live pipeline's — the content script can't tell
// the difference, and re-composites the text with the CURRENT font settings.
async function renderFromPageCache(tabId, runId, entry, settings, timings, srcUrl) {
  checkCancelled(runId);
  setProgress(runId, 'render', 0.96);
  const t0 = performance.now();
  await sendRender(tabId, runId, entry.mode || 'replace',
    entry.imageDataUrl, entry.width, entry.height, entry.blocks,
    { ...timings, cacheHit: Math.round(performance.now() - t0) },
    settings.debugMode, { srcUrl });
  setProgress(runId, 'done', 1);
  return { runId, ok: true, cached: true };
}

// ---------------------------------------------------------------- pipeline
// opts.srcUrl: manual send (right-click) — translate this exact image,
// bypassing the minimum image size. Otherwise the auto path.
async function runPipeline(tabId, opts = {}) {
  const manualSrc = opts.srcUrl || null;
  const runId = 'run-' + Date.now().toString(36) + '-' + (runSeq++) + '-' + Math.random().toString(36).slice(2, 8);
  runs.set(runId, { cancelled: false, tabId });
  const settings = await getSettings();
  const timings = {};
  const pipelineT0 = performance.now(); // overall wall-clock for this run
  // Firefox: pre-load the 206MB LaMa first, before detector/OCR fragment the
  // WASM heap. A fragmented heap can't provide the contiguous block LaMa needs.
  if (directHandlers()) {
    try { await callMl({ type: MSG.ML_ENSURE, model: 'inpaint' }); } catch (e) { /* loaded on demand */ }
  }
  const pxKeys = []; // IDB pixel-bus keys created this run; dropped in finally
  let result;
  try {
    // Inject the overlay early so debug-stage payloads have a panel to land in.
    // content.js guards against double-injection; the canvas stays empty until render.
    // Gate on the host permission first: without it injection always fails, and
    // the error below names the fix instead of a cryptic browser message.
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const tabUrl = (tab && tab.url) || '';
    const tabHost = hostOf(tabUrl);
    if (tabHost && !(await hasHostAccess(tabHost))) {
      throw settings.allowAllSites
        ? new Error('"Allow all sites" is on, but the extension no longer has access to all sites (the permission may have been revoked) — reopen Settings → Site access and turn it back on.')
        : hostAccessError(tabHost);
    }
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
    const { rgba, w, h, mode, tier } = await getPipelineImage(tabId, settings, tabUrl, { srcUrl: manualSrc });
    timings.capture = Math.round(performance.now() - t0);
    const capMean = meanBrightness(rgba);
    if (capMean < 0.004) {
      throw new Error(
        `captured image came back blank (all pixels black) via "${tier}" — ` +
        `the page's picture could not be read. Reload the page and try again; ` +
        `if it persists, the site may be blocking pixel access.`);
    }
    // The data-URL image is only built in debug mode — in normal runs this
    // PNG encode of the full page is pure overhead.
    await emitDebug(runId, tabId, settings, 'capture',
      { title: `Captured page — ${tier}, mean brightness ${capMean.toFixed(3)}`, image: settings.debugMode ? await rgbaToDataURL(rgba, w, h) : null, w, h, ms: timings.capture });

    // ---- 1b. page cache: a page translated earlier in this session renders
    // instantly — no detection, OCR, inpaint, or translation. The stored entry
    // is re-sent as ct/render, so the content script re-composites the text
    // with the CURRENT font settings; font-size tweaks never invalidate it.
    // An early return inside try still runs the finally below (runs.delete +
    // dropping staged pixel payloads), so cleanup is unchanged.
    checkCancelled(runId);
    let cacheHit = null;
    try {
      if (!(await isIncognitoTab(tabId))) {
        cacheHit = await pageCacheGet(await buildCacheKey(rgba, w, h, settings));
      }
    } catch (e) {
      console.warn('[ct] page-cache lookup failed:', String((e && e.message) || e).slice(0, 120));
    }
    if (cacheHit) {
      return await renderFromPageCache(tabId, runId, cacheHit, settings, timings, manualSrc);
    }

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
      image: settings.debugMode ? await rgbaToDataURL(rgba, w, h) : null,
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
      // Per-crop OCR diagnostics for the debug panel: char count and whether
      // this crop needed the Baberu ~64-char-ceiling chunked re-OCR.
      const ocrStats = new Map();
      if (crops.length) {
        const r = await callMlChecked(runId, {
          type: MSG.ML_OCR, runId, sourceLang: settings.sourceLang,
          crops: crops.map(({ id, key, width, height }) => ({ id, key, width, height })),
        });
        ocrMs = r.ms;
        ocrEngineLabel = (MODEL_GROUPS.find(g => g.id === r.engine) || {}).label || r.engine || '';
        for (const res of r.results) {
          blocks[res.id].text = res.text;
          ocrStats.set(res.id, { chars: res.chars, chunks: res.chunks, hitCeiling: res.hitCeiling, stopped: res.stopped, skipped: !!res.skipped });
        }
      }
      timings.ocr = ocrMs;
      setProgress(runId, 'ocr', 0.55);
      const ocrThumbs = [];
      // Thumbnails are debug-panel only — skip the 40 canvas encodes in normal runs.
      if (settings.debugMode) {
        for (const c of crops.slice(0, 40)) {
          ocrThumbs.push({
            id: c.id, text: blocks[c.id].text,
            ...(ocrStats.get(c.id) || {}),
            thumb: await rgbaToDataURL(c.data, c.width, c.height, 200),
          });
        }
      }
      const ocrTextCount = blocks.filter(b => b.text && b.text.trim()).length;
      const clippedCount = [...ocrStats.values()].filter(s => s.hitCeiling).length;
      await emitDebug(runId, tabId, settings, 'ocr', {
        title: `OCR — ${crops.length} crops, ${ocrTextCount} with text${ocrEngineLabel ? ` (${ocrEngineLabel})` : ''}` +
          (clippedCount ? `, ${clippedCount} hit the 64-char model cap (re-OCR'd in chunks)` : ''),
        crops: ocrThumbs, ms: ocrMs,
      });
    }

    // Auto-detect source language: Baberu reads all four scripts, so vote
    // across the OCR'd blocks. Undetectable -> 'ja', the old default.
    let effSettings = settings;
    if (settings.sourceLang === 'auto') {
      const detected = detectPageLang(blocks.map(b => b.text));
      effSettings = { ...settings, sourceLang: detected || 'ja' };
      for (const b of blocks) b.source_lang = effSettings.sourceLang;
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
    // Long tiled inpaints feed per-tile progress through this (Firefox only —
    // the ML host shares this page). The pill keeps moving instead of looking
    // stalled at one percentage for minutes.
    runs.get(runId).onInpaintProgress = (frac) => parProgress('inpaint', frac);
    const runTranslate = async () => {
      parProgress('translate', 0);
      const t0t = performance.now();
      const translated = await translateBlocks(blocks, effSettings);
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
    };
    const runMask = async () => {
      parProgress('mask', 0);
      const t0m = performance.now();
      const pageGray = toGrayU8(rgba, w, h);
      const { mask: fullMask, entries } = generateMask(rgba, w, h, pageGray, blocks, 5);
      const maskMs = Math.round(performance.now() - t0m);
      parProgress('mask', 1);
      await emitDebug(runId, tabId, settings, 'mask', {
        title: `Mask — ${entries.length} block masks`,
        mask: settings.debugMode ? await rgbaToDataURL(maskToRGBA(fullMask, w, h), w, h) : null, ms: maskMs,
      });
      return { fullMask, entries, maskMs };
    };
    const runInpaint = async ({ fullMask, entries, maskMs }) => {
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
        image: settings.debugMode ? await rgbaToDataURL(inpainted, w, h) : null, ms: inpaintMs,
      });
      return { inpainted, inpaintMs, maskMs, totalInpaintMs };
    };

    // Firefox runs ML in-process on a single thread: WASM inpaint blocks the
    // event loop, freezing the parallel translate branch and the UI. Run the
    // stages sequentially there; Chrome keeps the parallel pipeline (ML is in
    // the offscreen document on its own thread).
    let translateOut, inpaintOut;
    if (directHandlers()) {
      // Firefox: translation runs on a Web Worker (own thread), mask → inpaint
      // runs on the main thread. The worker's network I/O is not blocked when
      // WASM inpaint hogs the main thread.
      const t0t = performance.now();
      const workerUrl = chrome.runtime.getURL('src/background/translate-worker.js');
      const tWorker = new Worker(workerUrl, { type: 'module' });
      const translateP = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          tWorker.terminate();
          reject(new Error('translate worker timeout'));
        }, 180000);
        tWorker.onmessage = (e) => {
          clearTimeout(timeout);
          tWorker.terminate();
          if (e.data.ok) resolve(e.data.translated);
          else reject(new Error(e.data.error));
        };
        tWorker.onerror = (err) => {
          clearTimeout(timeout);
          tWorker.terminate();
          reject(err instanceof Error ? err : new Error(String(err)));
        };
        tWorker.postMessage({
          blocks: blocks.map(b => ({ text: b.text })),
          settings,
        });
      });
      // Main thread: mask → inpaint (linear, WASM may block but worker continues)
      // If mask/inpaint throws first, translateP would reject with no handler
      // (unhandled rejection) and the worker would linger until its timeout —
      // attach a handler and stop the worker on the way out.
      translateP.catch(() => {});
      let maskRes, translated;
      try {
        maskRes = await runMask();
        inpaintOut = await runInpaint(maskRes);
        // Collect translation from worker
        translated = await translateP;
      } catch (e) {
        try { tWorker.terminate(); } catch { /* already terminated */ }
        throw e;
      }
      try { tWorker.terminate(); } catch { /* already terminated by onmessage */ }
      checkCancelled(runId);
      blocks.forEach((b, i) => { b.translation = translated[i]; });
      const translateMs = Math.round(performance.now() - t0t);
      parProgress('translate', 1);
      await emitDebug(runId, tabId, settings, 'translate', {
        title: `Translation — ${BACKEND_LABEL[settings.translationBackend] || settings.translationBackend}`,
        rows: blocks.map(b => ({ text: b.text, translation: b.translation })),
        ms: translateMs,
      });
      translateOut = { translateMs };
    } else {
      const maskP = runMask();
      const inpaintP = maskP.then(runInpaint);
      const translateP = runTranslate();
      [translateOut, inpaintOut] = await Promise.all([translateP, inpaintP]);
    }
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
    await sendRender(tabId, runId, mode, finalDataUrl, w, h, blocks, timings, settings.debugMode, { srcUrl: manualSrc });
    // ---- 9. page cache: remember this translated page for instant revisits.
    // Best-effort — a cache failure must never fail the run. Skipped in
    // incognito; a cancelled run never reaches this point (it throws above).
    try {
      if (!(await isIncognitoTab(tabId))) {
        await pageCachePut(await buildCacheKey(rgba, w, h, settings), {
          imageDataUrl: finalDataUrl, width: w, height: h, blocks, mode,
        });
      }
    } catch (e) {
      console.warn('[ct] page-cache write failed:', String((e && e.message) || e).slice(0, 120));
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
      broadcastError(runId, msg, e && e.grantHost ? { host: e.grantHost, label: displayHost(e.grantHost) } : null);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
        // Show the debug panel on failure too (emitDebug sets debug:true and
        // respects debugMode) — otherwise a capture-stage failure leaves
        // James with only the error text and no stage/tier diagnostics.
        await emitDebug(runId, tabId, settings, 'error', { title: 'Error', error: msg });
      } catch { /* ignore */ }
    }
    result = { runId, ok: false, error: msg, cancelled: !!(e && e.cancelled),
      ...(e && e.fallbackUrl ? { fallbackUrl: e.fallbackUrl } : {}) };
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
// Fires the pipeline automatically when an allowed page finishes loading —
// no button click needed. One run per page load; only for the active tab.
const autoFired = new Map(); // tabId -> {url, at}
chrome.tabs.onRemoved.addListener(tabId => autoFired.delete(tabId));

// First install: flag the popup to send the user straight to the models
// section of the Settings page (download button highlighted) on first open.
chrome.runtime.onInstalled.addListener(details => {
  if (!details || details.reason !== 'install') return;
  chrome.storage.local.get('settings').then(({ settings }) => {
    if (settings && settings.firstRun) return;
    chrome.storage.local.set({ settings: { ...(settings || {}), firstRun: true } }).catch(() => {});
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo || changeInfo.status !== 'complete') return;
  (async () => {
    try {
      const settings = await getSettings();
      if (!settings.autoTranslateOnLoad) return;
      if (!tab || !tab.active) return; // translate what you're looking at
      const host = hostOf(tab.url || '');
      if (!host || (!settings.allowAllSites && !isSiteAllowed(host, settings.siteWhitelist || []))) return;
      const url = tab.url;
      const prev = autoFired.get(tabId);
      const now = Date.now();
      if (prev && prev.url === url && now - prev.at < 120000) return; // same load, don't double-fire
      // Same page and a run for this tab is still working: a late 'complete'
      // (slow iframe, ad slot, …) is not a new page and must not kill the run
      // and restart it from scratch. This matters more now that tiled inpaint
      // can keep a run busy for many minutes. Backstop: if it has been wedged
      // for >15min, let the restart through anyway.
      // (Checked against the live runs map — not a recorded run id — so the
      // guard works while the run is in flight, which is when it matters.)
      if (prev && prev.url === url && now - prev.at < 900000) {
        for (const [, r] of runs) {
          if (r.tabId === tabId && !r.cancelled) return;
        }
      }
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
// ------------------------------------------- right-click "send this image"
// The menu item appears on images on sites that pass the site-access gate:
// documentUrlPatterns mirrors the whitelist (omitted entirely when "Allow
// all sites" is on, since the gate passes everywhere then; no item at all
// when nothing is allowed). A click sends that exact image through the
// pipeline — bypassing the minimum image size — and the translated picture
// replaces it in place. The page cache keys on image content, so it works
// for manual sends too.
const CTX_MENU_ID = 'ct-send-image';
function menuPatternsFor(settings) {
  if (settings.allowAllSites) return null;
  const hosts = settings.siteWhitelist || [];
  if (!hosts.length) return [];
  return hosts.flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]);
}
async function refreshContextMenu() {
  if (!chrome.contextMenus || !chrome.contextMenus.create) return;
  try {
    await chrome.contextMenus.removeAll();
    const settings = await getSettings().catch(() => ({}));
    const patterns = menuPatternsFor(settings);
    if (patterns && !patterns.length) return; // nothing allowed: no menu item
    const props = {
      id: CTX_MENU_ID,
      title: chrome.i18n.getMessage('ctx_send_image') || 'Send to comic-translate-4-free',
      contexts: ['image'],
    };
    if (patterns) props.documentUrlPatterns = patterns;
    await chrome.contextMenus.create(props);
  } catch (e) {
    console.warn('[ct] context menu setup failed:', String((e && e.message) || e).slice(0, 120));
  }
}
// Manual send: the right-clicked image goes through the pipeline like a page
// run — same gate, same stages, same page cache, in-place replace.
async function handleTranslateImage(tabId, srcUrl) {
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || /^chrome:\/\//.test(tab.url || '')) return;
    const settings = await getSettings();
    const host = hostOf(tab.url);
    if (!host) return;
    if (!settings.allowAllSites && !isSiteAllowed(host, settings.siteWhitelist || [])) {
      // Unreachable in practice (the menu patterns mirror this gate);
      // best-effort: surface it on the page's pill when a content script
      // can be injected (the menu click is a user gesture).
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.RUN_PROGRESS, direct: true, stage: 'error',
          error: `"${host}" is not in your site access list — allow it from the popup or Settings, or turn on "Allow all sites"`,
        });
      } catch { /* no page access: stay silent */ }
      return;
    }
    // Any in-flight run for this tab is dropped first — the new request wins.
    await cancelRunsForTab(tabId);
    const r = await runPipeline(tabId, { srcUrl });
    // 403 fallback: the image server refused our download, but opening the
    // image URL directly makes it same-origin, so the canvas tier can read it
    // with no download at all. Do that in a background tab automatically.
    if (!r.ok && r.fallbackUrl) {
      await fallbackTranslateInNewTab(tabId, r.fallbackUrl);
    }
  } catch (e) {
    console.warn('[ct] manual image send failed:', String((e && e.message) || e).slice(0, 160));
  }
}

// 403 fallback for "Send to comic-translate-4-free": open the image URL in a
// background tab and translate it there. In its own tab the picture is
// same-origin, so tier 1a (page canvas) reads the pixels directly — no
// download, no bot-protection fight.
async function fallbackTranslateInNewTab(origTabId, imageUrl) {
  const notice = (text, sticky) =>
    chrome.tabs.sendMessage(origTabId, { type: MSG.PILL_NOTICE, text, sticky }).catch(() => {});
  await notice('Direct download blocked — translating in a background tab…', true);
  let newTab = null;
  try {
    newTab = await chrome.tabs.create({ url: imageUrl, active: false });
  } catch { /* popup blocker or invalid URL */ }
  if (!newTab || newTab.id == null) {
    await notice('Could not open a background tab for the image.', false);
    return;
  }
  const newTabId = newTab.id;
  try {
    // Wait for the image document to finish loading (its <img> is the page).
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for the image tab to load')), 30000);
      const listener = (tabId, changeInfo) => {
        if (tabId === newTabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Already loaded (fast cache hit): don't wait for an event that fired.
      chrome.tabs.get(newTabId).then(t => {
        if (t && t.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }).catch(() => {});
    });
    const r = await runPipeline(newTabId, { srcUrl: imageUrl });
    if (r.ok) {
      // Show the finished translation.
      await chrome.tabs.update(newTabId, { active: true }).catch(() => {});
      await notice('Translation ready.', false);
    } else {
      throw new Error(r.error || 'translation failed');
    }
  } catch (e) {
    await chrome.tabs.remove(newTabId).catch(() => {});
    await notice('Background-tab translation failed: ' + String((e && e.message) || e).slice(0, 120), false);
  }
}
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!info || info.menuItemId !== CTX_MENU_ID) return;
    if (!tab || tab.id == null || !info.srcUrl) return;
    // Return the promise so the worker stays alive for the run.
    return handleTranslateImage(tab.id, info.srcUrl);
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) refreshContextMenu().catch(() => {});
});
refreshContextMenu().catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Pill "Allow <host>" button (content script). permissions.request() must be
  // called synchronously in the message turn — the click's user gesture only
  // survives one sync hop across sendMessage, so nothing may be awaited first
  // (same constraint as the popup's grant button; see requestSiteAccessNow).
  if (msg && msg.type === MSG.GRANT_IMAGE_HOST && msg.host) {
    let req;
    try {
      req = chrome.permissions.request({ origins: imageHostOrigins(msg.host) });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e).slice(0, 120) });
      return false;
    }
    Promise.resolve(req).then(granted => {
      if (granted && sender.tab && sender.tab.id != null) {
        // Access granted — re-run the pipeline so the user doesn't have to
        // click Translate again. Failures surface through the normal pill.
        runPipeline(sender.tab.id).catch(() => {});
      }
      sendResponse({ ok: !!granted });
    }, () => sendResponse({ ok: false }));
    return true;
  }
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
          if (!settings.allowAllSites && !isSiteAllowed(host, settings.siteWhitelist || [])) {
            throw new Error(`"${host}" is not in your site access list — allow it from the popup or Settings, or turn on "Allow all sites"`);
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
        case MSG.PAGE_CACHE_STATS: {
          sendResponse({ ok: true, ...(await pageCacheStats()) });
          break;
        }
        case MSG.CLEAR_PAGE_CACHE: {
          const st = await pageCacheStats();
          await clearPageCache();
          sendResponse({ ok: true, count: st.count, bytes: st.bytes });
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
