// Background service worker: pipeline orchestration, model management,
// translation APIs, capture, debug emission. ML inference itself lives in
// the offscreen document; pure-JS stages (blocks, mask) run here.
import { MSG } from '../shared/contracts.js';
import { MODEL_GROUPS, getModelStatus, deleteModelGroup, computeModelFingerprint } from '../shared/model-specs.js';
import { getSettings } from '../shared/settings.js';
import {
  makeTextBlock, mergeOverlappingBoxes, sortBlocks,
  boxIoU, clampBox, dedupAndMergeSeams, mergeBoxesByCost,
  INPAINT_COST, INPAINT_COST_SPREAD, patchCostMs, TILE_MAX,
} from '../shared/textblock.js';
import { toGrayU8, meanBrightness, renderScale, resizeBilinearRGBA } from '../shared/image-ops.js';
import { pixelPut, pixelTake, pixelDrop, pixelPruneRun } from '../shared/pixel-bus.js';
import { generateMask, detectContentMaskInBbox } from '../shared/mask.js';
import { translateBlocks, checkAzure, checkLmStudio, BACKEND_LABEL, BACKEND_SHORT_LABEL } from './translators.js';
import { detectPageLang } from '../shared/lang-detect.js';
import { mlHostAlive, ensureMlHost, callMl, cancelMlForRun, runGpuInpaint, cancelGpuInpaint, runChromeGpuInpaint, cancelChromeGpuInpaint, notifyChromeGpuProgress, makeCanvas, canvasToBlob, directHandlers, WEBP_TYPE, WEBP_QUALITY, setMlAlarmRecoveryHook } from './ml-bridge.js';
import {
  initPageCache, buildCacheKey, buildCacheKeyTier1, buildCacheKeyTier2,
  pageCacheGet, pageCachePut,
  pageCacheStats, clearPageCache,
} from '../shared/page-cache.js';
import { baseDomain, displayHost, hostOf, isSiteAllowed, imageHostOrigins, originAccessPatterns } from '../shared/site-access.js';

// Translated-page cache is session-scoped: initPageCache() wipes the store on
// every browser startup (via a chrome.storage.session marker) and the
// get/put/stats helpers await that check before touching the store.
// DIAGNOSTIC (temporary): panel log buffer. The console does not work
// for this user (pastes are samples, Objects cannot be opened), so the
// log also goes to our own debug panel on the page, where it can be
// copied in full. diagPush logs to console AND buffers (cap 200).
// Defined here (before any use) so top-level calls cannot hit TDZ.
const diagLogBuf = [];
function diagPush(line) {
  try {
    // 1.4.0 (m7): only real failure/recovery/timeout lines go out as
    // console.error. Benign diagnostic lines (loaded, keepalive,
    // thread-info, start/done, tiles) go to console.debug, so the
    // console is not a wall of red "errors" that are not errors. The
    // panel-log buffer is unchanged (every line is still buffered).
    const s = String(line);
    if (/fail|error|timeout|watchdog|orphan|alarm/i.test(s)) console.error('[ct-diag] ' + line);
    else if (typeof console.debug === 'function') console.debug('[ct-diag] ' + line);
    else console.log('[ct-diag] ' + line);
    diagLogBuf.push('[ct-diag] ' + line);
    if (diagLogBuf.length > 200) diagLogBuf.shift();
  } catch {}
}

// 2.1.20: bench trace — every bench line, persisted. diagPush alone is
// in-memory, so a worker restart wipes the bench lines before the next
// run's log can show them. benchTracePush also appends the line to
// storage.local 'benchTrace' (last 100 lines), so the next run can show
// the full trace even after a restart. Writes are chained so they land
// in order. Fire-and-forget: never blocks the pipeline.
let benchTraceChain = Promise.resolve();
function benchTracePush(line) {
  try { diagPush(line); } catch {}
  benchTraceChain = benchTraceChain.then(async () => {
    try {
      const saved = await chrome.storage.local.get('benchTrace');
      const arr = (saved && Array.isArray(saved.benchTrace)) ? saved.benchTrace : [];
      arr.push({ line: String(line), at: new Date().toISOString() });
      await chrome.storage.local.set({ benchTrace: arr.slice(-100) });
    } catch {}
  }).catch(() => {});
}

// 2.1.29: retired bench lines. 2.1.25 removed these from live code, but
// they live on in the persisted benchTrace and replay into every run's
// log. Filter them out of the replay (and purge them at run start).
// Fresh live lines still show when they actually happen: pings only
// start when the bench is not done, and a fresh "bench done, stopping
// pings" is pushed live when pings stop. Real events are kept: bench
// started, per-count timings, saves, "bench done best N", trigger
// delivered/failed, errors.
const BENCH_TRACE_RETIRED = [
  'already measured',
  'run ok, checking saved count',
  'pings starting',
  'bench done, stopping pings',
];
function benchTraceIsRetired(line) {
  const s = String(line || '');
  for (const p of BENCH_TRACE_RETIRED) { if (s.indexOf(p) !== -1) return true; }
  return false;
}

// 2.0.27: LEARNED inpaint merge spread. The merge charges a merged
// patch at perPxMs * spread (textblock.js) — the spread is how much
// more a big tile costs per pixel than a small one. It was a fixed
// 1.3, measured once on one M4 GPU and applied to every path, which
// is a guess, not a measurement. Now each path (gpu / wasm / wasm1)
// starts at 1.3 and learns its own value from real runs: after an
// inpaint run, every merged patch compares its actual ms against the
// base-model prediction (no spread); the per-pixel part of the ratio
// is the measured spread for that patch. The stored spread moves 10%
// toward the median ratio of the run's merged patches (damping), so
// one noisy run cannot swing it — that is the overfitting guard, along
// with the [1.0, 2.0] clamp and keeping the three paths separate.
// Stored in chrome.storage.local (mirrored to sync, like the thread
// bench) so it survives restarts; a missing value means 1.3.
const INPAINT_SPREAD_KEY = 'inpaintSpread';
const INPAINT_SPREAD_MIN = 1.0;
const INPAINT_SPREAD_MAX = 2.0;
const INPAINT_SPREAD_LEARN = 0.1;
let inpaintSpreadCache = null;
async function readInpaintSpread() {
  if (inpaintSpreadCache) return inpaintSpreadCache;
  const d = { gpu: INPAINT_COST_SPREAD, wasm: INPAINT_COST_SPREAD, wasm1: INPAINT_COST_SPREAD };
  try {
    const got = await chrome.storage.local.get(INPAINT_SPREAD_KEY);
    const s = got && got[INPAINT_SPREAD_KEY];
    if (s && typeof s === 'object') {
      for (const k of ['gpu', 'wasm', 'wasm1']) {
        const v = Number(s[k]);
        if (Number.isFinite(v)) d[k] = Math.min(INPAINT_SPREAD_MAX, Math.max(INPAINT_SPREAD_MIN, v));
      }
    }
  } catch {}
  inpaintSpreadCache = d;
  return d;
}
async function saveInpaintSpread(map) {
  inpaintSpreadCache = { ...map };
  try { await chrome.storage.local.set({ [INPAINT_SPREAD_KEY]: { ...map, updatedAt: new Date().toISOString() } }); } catch {}
  try { await chrome.storage.sync.set({ [INPAINT_SPREAD_KEY]: { ...map, updatedAt: new Date().toISOString() } }); } catch {}
}
// 1.4.0 (m6): each run's (and each recovery's) panel log is its own.
// Called at run start and at recovery start, before any diagPush for
// that run/recovery, so a sent log never carries the tail of older runs.
// EXCEPTION (2.0.17): keep 'threads bench' lines. The benchmark runs
// after a run ends, so its lines land in the buffer AFTER that run's log
// was already sent to the panel — wiping them here deleted the only
// panel copy, and the numbers never appeared anywhere James looks.
// Kept lines ride into the next run's log instead.
function clearDiagLog() {
  try {
    const keep = diagLogBuf.filter((l) => l.includes('threads bench'));
    diagLogBuf.length = 0;
    for (const l of keep) diagLogBuf.push(l);
  } catch {}
}
initPageCache();

// DIAGNOSTIC (temporary): proves this build loaded, so a paste without
// this line means the old build ran, not this diagnostic.
diagPush('diagnostic loaded');

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
// NOTE: this checks the PAGE host. For the image-host grant patterns see
// originAccessPatterns() in shared/site-access.js — keep the two in sync
// conceptually (page host = exact, image host = base domain).
async function hasPageHostAccess(host) {
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

// Long tiled inpaints report per-tile progress straight into the run's
// progress bar. Firefox runs the ML host in-process in this same page
// (background-ff.js); Chrome's offscreen document forwards its reports here
// via ML_INPAINT_PROGRESS (see offscreen-progress.js). Each run registers
// its own updater below.
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
    // tabId rides along so the alarm backup (ml-bridge.js) can tell the
    // tab's pill the run failed even if this worker died mid-call.
    return await callMl(msg, { tabId: runs.get(runId)?.tabId });
  } catch (e) {
    checkCancelled(runId);
    throw e;
  }
}

// Shared abort sequence for a single run: mark cancelled, abort in-flight
// translation network requests, and kill the Firefox translate worker.
// cancelRunsForTab (tab-scoped, below) and the CANCEL_RUN handler (popup
// Cancel button) both use this so cancellation is complete on every path.
function abortRunResources(id, r) {
  r.cancelled = true;
  // Deliberate drop (Cancel button or superseded run): its later errors
  // must stay quiet. Distinct from the branch-dead abort below, whose
  // original failure must still surface (see branchError).
  r.userCancelled = true;
  // Abort in-flight translation network requests immediately instead of
  // waiting for the stage boundary.
  try { r.abortController?.abort(); } catch {}
  // Firefox: translation runs on a Web Worker — terminate it now instead
  // of waiting for completion or the 60s backstop. The stored killer
  // also rejects the pending promise so `await translateP` doesn't hang.
  try { r.killTranslateWorker?.(Object.assign(new Error('cancelled'), { cancelled: true })); } catch {}
  try { r.translateWorker?.terminate(); } catch {}
  // Also stop in-flight ML work now instead of waiting for the stage to
  // finish (up to 120s for inpaint). See ml-bridge cancelMlForRun: the
  // flag is broadcast to every host, and the worker is terminated when
  // no other run shares it.
  try { cancelMlForRun(id); } catch {}
  // GPU1: the GPU worker is likewise a separate Worker instance, not
  // covered by cancelMlForRun's shared-worker broadcast — terminate
  // it too (reclaims GPU buffers; cancel never falls back to WASM).
  try { cancelGpuInpaint(id); } catch {}
  // GPU1-Chrome: the Chrome GPU worker is owned by the offscreen
  // document, not by this worker — cancel it too (ML_CANCEL to the
  // doc stops the run's GPU loop but keeps the shared worker alive
  // for the next run; the ML_CANCEL broadcast below does the same;
  // both are idempotent).
  try { cancelChromeGpuInpaint(id); } catch {}
}

async function cancelRunsForTab(tabId) {
  const ids = [];
  for (const [id, r] of runs) {
    if (r.tabId === tabId) {
      abortRunResources(id, r);
      ids.push(id);
    }
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
  // Cookie policy: never send the user's cookies to an arbitrary image host
  // (the 403-retry path can hit attacker-controlled URLs). `credentials:
  // 'include'` is only used when the image host is same-site with the page
  // (same eTLD+1 via baseDomain — covers the page's own CDN subdomains);
  // otherwise default to 'omit'. The request still mimics the page's <img>
  // via the image Accept header and referrer strategy, just without cookies.
  const imgHost = hostOf(url) || '';
  const pageHost = hostOf(referrer) || '';
  const sameSite = !!imgHost && !!pageHost &&
    (imgHost === pageHost || baseDomain(imgHost) === baseDomain(pageHost));
  // Mimic the page's <img> load: image Accept header and the Priority
  // header browsers send on subresource image loads. (Sec-Fetch-Dest can't
  // be forged — fetch always sends `empty`, never `image` — so a strict bot
  // filter can still tell us apart.)
  const base = {
    credentials: sameSite ? 'include' : 'omit',
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
    if (res.ok) {
      const blob = await res.blob();
      return { ...bitmapToRGBA(await createImageBitmap(blob)), bytes: blob.size };
    }
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
// Multi-pic: at most this many pictures per run (James's old design used 50).
const MAX_IMAGES_PER_PAGE = 50;

// Inventory: every picture on the page worth translating, top to bottom.
// Manual send (right-click): this exact image, bypassing the minimum size.
// Otherwise the page's own inventory (ct/list-images), filtered by the
// minimum image size (displayed, the default — 500 — everywhere, James's
// order), capped at MAX_IMAGES_PER_PAGE. Returns {images, skipped, ignored}.
async function getPipelineImages(tabId, settings, tabUrl, opts = {}) {
  const manualSrc = opts.srcUrl || null;
  const minSize = settings.minImageSize || 500;
  if (manualSrc) {
    let info = null;
    try { info = (await chrome.tabs.sendMessage(tabId, { type: 'ct/find-image-by-src', srcUrl: manualSrc }))?.image || null; }
    catch { info = null; }
    if (!info || !info.src) {
      throw new Error('could not find that image on the page anymore — it may have been removed or the page reloaded');
    }
    return { images: [info], skipped: [], ignored: 0 };
  }
  let list = [], total = 0;
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'ct/list-images' });
    list = r?.images || [];
    total = r?.total || list.length;
    if (r?.diag) for (const l of String(r.diag).split('\n')) diagPush('inventory-diag ' + l);
    // Permission for EVERY big picture's host — including the ones that did
    // not make the inventory — so a missing grant on a 403 CDN host is
    // visible in the same log, not just the gate's view of the listed ones.
    if (Array.isArray(r?.bigSrcs) && r.bigSrcs.length) {
      try {
        const missing = await checkImageHostPermissions(r.bigSrcs.map(src => ({ src })));
        const hosts = [...new Set(r.bigSrcs.map(s => { try { return new URL(s).hostname.toLowerCase(); } catch { return ''; } }).filter(Boolean))];
        diagPush('inventory-diag big-pic hosts: ' + hosts.join(', ') + ' — missing permission: ' + (missing.length ? missing.join(', ') : 'none'));
      } catch (e) { diagPush('inventory-diag host permission check failed: ' + String((e && e.message) || e).slice(0, 80)); }
    }
  } catch { list = []; }
  if (!list.length) {
    throw new Error('no pictures found on this page — the extension translates the page\'s own pictures, not a screenshot of the page');
  }
  // The minimum-size gate uses the DISPLAYED size (what the user sees) —
  // collectPageImages returns the on-screen w/h. A big file shown small does
  // not run. This is the only size gate: the capture tiers do not re-check
  // the file size, so a picture that displays big runs even if its file is small.
  const eligible = list.filter(im => Math.max(im.w || 0, im.h || 0) >= minSize);
  const skipped = [];
  if (list.length - eligible.length) skipped.push(`${list.length - eligible.length} below the minimum image size of ${minSize}px (change it in Settings)`);
  const picked = eligible.slice(0, MAX_IMAGES_PER_PAGE);
  if (eligible.length - picked.length) skipped.push(`${eligible.length - picked.length} over the ${MAX_IMAGES_PER_PAGE}-image per-run cap`);
  if (!picked.length) throw new Error(`no usable pictures on this page (${skipped.join('; ')}).`);
  // Pictures the inventory never considered (icons, spacers, hidden or
  // still-loading <img>) — reported so untranslated ones are accounted for.
  return { images: picked, skipped, ignored: Math.max(0, total - list.length) };
}

// One picture's pixels, loaded just before its stages run and released after.
// Tier 1a: pixels straight from the page canvas by uid. Skipped when the page
// already shows our translated render (info.translated): the canvas would hand
// back the translated pixels, so the pipeline would translate the translation
// and the page-cache key would never match. The download tiers below fetch the
// ORIGINAL url the content script reported, so pixels and cache key stay
// correct and revisits hit the cache.
// Tier 1b: download inside the PAGE (content script) — the browser applies the
// page's real referrer policy and cookies, exactly like the page's own <img>
// load. Some image hosts / WAFs (e.g. Cloudflare) 403 the service worker's
// fetch because its Referer and Sec-Fetch-* headers don't match what the page
// itself sends; this tier is indistinguishable from the page loading the image
// itself. The extension's host permissions let the content script read the
// cross-origin response bytes.
// Tier 1c: background fetch of the image URL (for an already-translated page
// this is the ORIGINAL url, so the pixels — and the cache key — are the
// originals, not the render).
// Capture diagnostic: one entry per tier attempted ({tier, ms, ok, bytes?, error?}).
// Returned to the caller, which logs it — the log then names the path
// (page-canvas = local, page/worker-fetch = network download) and how long
// each attempt took, so a slow capture can be read as internet or local
// without a debug-mode run.
async function loadPipelineImagePixels(tabId, info, settings, tabUrl, opts = {}) {
  const failures = [];
  const attempts = [];
  if (!info.translated) {
    const a0 = performance.now();
    try {
      const p = await chrome.tabs.sendMessage(tabId,
        info.uid ? { type: 'ct/get-image-pixels-by-uid', uid: info.uid } : { type: 'ct/get-image-pixels', srcUrl: info.src });
      if (p && p.ok && typeof p.dataUrl === 'string') {
        const { rgba, w, h } = await dataUrlToRGBA(p.dataUrl);
        // A blank (all-black) capture fed to the detector yields 2 bogus
        // full-page boxes, so validate the pixels before accepting them.
        if (meanBrightness(rgba) >= 0.004) {
          attempts.push({ tier: 'page-canvas', ms: Math.round(performance.now() - a0), ok: true });
          return { rgba, w, h, mode: 'replace', tier: 'page-canvas', attempts };
        }
        failures.push('page canvas returned blank pixels');
      } else {
        failures.push('page canvas: ' + String((p && p.error) || 'no pixels').slice(0, 100));
      }
    } catch (e) { failures.push('page canvas: ' + String((e && e.message) || e).slice(0, 100)); }
    attempts.push({ tier: 'page-canvas', ms: Math.round(performance.now() - a0), ok: false, error: failures[failures.length - 1] });
  } else {
    failures.push('page canvas skipped (already showing the translated render)');
  }
  const b0 = performance.now();
  try {
    const f = await chrome.tabs.sendMessage(tabId, { type: 'ct/fetch-image-bytes', srcUrl: info.src });
    if (f && f.ok && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) {
      const { rgba, w, h } = await dataUrlToRGBA(f.dataUrl);
      const b64 = f.dataUrl.split(',')[1] || '';
      attempts.push({ tier: 'page-fetch', ms: Math.round(performance.now() - b0), ok: true, bytes: Math.round(b64.length * 3 / 4) });
      return { rgba, w, h, mode: 'replace', tier: 'page-fetch', attempts };
    }
    failures.push('page download: ' + String((f && f.error) || 'no bytes').slice(0, 100));
  } catch (e) { failures.push('page download: ' + String((e && e.message) || e).slice(0, 100)); }
  attempts.push({ tier: 'page-fetch', ms: Math.round(performance.now() - b0), ok: false, error: failures[failures.length - 1] });
  const c0 = performance.now();
  try {
    const { rgba, w, h, bytes } = await fetchImagePixels(info.src, tabUrl);
    attempts.push({ tier: 'worker-fetch', ms: Math.round(performance.now() - c0), ok: true, bytes });
    return { rgba, w, h, mode: 'replace', tier: 'worker-fetch', attempts };
  } catch (e) { failures.push('download: ' + String((e && e.message) || e).slice(0, 120)); }
  attempts.push({ tier: 'worker-fetch', ms: Math.round(performance.now() - c0), ok: false, error: failures[failures.length - 1] });
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
  // For auto-translate 403s (not manual sends — those trigger the automatic
  // background-tab fallback), lead with the bypass: right-click the picture
  // and use "Send to comic-translate-4-free". Localized via i18n (the menu
  // label itself is localized), with a blank line after the tip.
  const bypassTip = (serverRefused && !opts.srcUrl)
    ? (chrome.i18n.getMessage('err_bypass_tip',
        [chrome.i18n.getMessage('ctx_send_image') || 'Send to comic-translate-4-free'])
        || 'Tip: right-click the picture and choose "Send to comic-translate-4-free" to bypass this block.')
      + '\n\n'
    : '';
  const err = new Error(
    bypassTip +
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

// Mask-aware paste: only copies pixels where mask is non-zero.
// Used for inpaint compositing to avoid LaMa's slight alterations to
// unmasked areas (which cause visible blur when the whole patch is pasted).
function pasteMaskedRGBA(dst, dw, src, mask, x, y) {
  const w = src.w, h = src.h;
  for (let r = 0; r < h; r++) {
    const dstRow = (y + r) * dw;
    const srcRow = r * w;
    for (let c = 0; c < w; c++) {
      if (mask.data[srcRow + c]) {
        const di = (dstRow + x + c) * 4, si = (srcRow + c) * 4;
        dst[di] = src.data[si];
        dst[di + 1] = src.data[si + 1];
        dst[di + 2] = src.data[si + 2];
        dst[di + 3] = src.data[si + 3];
      }
    }
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
  // Bubbles whose text the detector missed: a bubble with no text box
  // inside it still contains words (the detector found the outline but
  // missed the text). Without this, that text is never translated — on
  // image 18/18 the detector found 21 boxes (12 bubbles + 9 texts) but
  // only 9 blocks, because 6 bubbles had no text box inside them.
  // Promote each such bubble to a text_bubble block. The OCR crop must
  // be tight around the WORDS, not the whole bubble: the full bubble
  // box is mostly empty space and border, so Baberu sees the text
  // small and misreads it (low-score text already reads poorly, and a
  // loose crop makes it worse — misread words cannot be translated, so
  // the output comes out mixed English and Chinese). Tighten the block
  // to the text content inside the bubble (mask.js content detection,
  // which already excludes the bubble outline); fall back to the full
  // bubble box if no content is found. A bubble that already has a
  // text box is skipped, so its text is not duplicated. If OCR finds
  // no text in a promoted bubble (false-positive outline), the block
  // is skipped downstream by the empty-text guard.
  let promotedCount = 0;
  for (const bb of bubbles) {
    const covered = blocks.some(b => {
      const [x1, y1, x2, y2] = b.xyxy;
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      return cx >= bb[0] && cx <= bb[2] && cy >= bb[1] && cy <= bb[3];
    });
    if (covered) continue;
    const tight = tightenBubbleToText(rgba, w, h, bb);
    const b = makeTextBlock({ xyxy: clampBox(tight || bb, w, h) });
    b.text_class = 'text_bubble';
    b.bubble_xyxy = bb;
    b.font_color = extractFgColor(rgba, w, b.xyxy);
    b.source_lang = settings.sourceLang;
    b.target_lang = settings.targetLang;
    blocks.push(b);
    promotedCount++;
  }
  const out = sortBlocks(blocks, true);
  // How many blocks came from bubbles with no text box (0 on a page
  // where detection is already good — the promotion is a no-op there).
  // The run logs it so over-firing on other pages is visible, not silent.
  out.promotedCount = promotedCount;
  return out;
}

// Tighten a bubble box to the words inside it (page coords), for the
// OCR crop of a promoted bubble. Uses the mask module's content
// detection (Otsu + connected components), which drops the bubble
// outline (it touches the crop edge and is one large component) and
// keeps the text. Returns null when no content is found.
function tightenBubbleToText(rgba, w, h, bubbleXyxy) {
  const [bx1, by1, bx2, by2] = bubbleXyxy.map(v => Math.round(v));
  const cx1 = Math.max(0, bx1), cy1 = Math.max(0, by1);
  const cx2 = Math.min(w, bx2), cy2 = Math.min(h, by2);
  if (cx2 <= cx1 || cy2 <= cy1) return null;
  const crop = cropRGBA(rgba, w, cx1, cy1, cx2, cy2);
  const mask = detectContentMaskInBbox(crop.data, crop.w, crop.h);
  let x1 = crop.w, y1 = crop.h, x2 = -1, y2 = -1;
  for (let y = 0; y < crop.h; y++) {
    for (let x = 0; x < crop.w; x++) {
      if (!mask[y * crop.w + x]) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return null;
  return [cx1 + x1, cy1 + y1, cx1 + x2 + 1, cy1 + y2 + 1];
}

// ---------------------------------------------------------------- debug helpers
async function rgbaToDataURL(rgba, w, h, maxDim = 420) {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
  // Canvas guard: the full-res src canvas can exceed browser limits on long
  // strips (e.g. 413x15402) even when the output is small. Downscale the
  // working buffer first if needed.
  const gs = renderScale(w, h);
  let gw = w, gh = h, grasp = rgba;
  if (gs < 1) {
    gw = Math.max(1, Math.round(w * gs)); gh = Math.max(1, Math.round(h * gs));
    grasp = resizeBilinearRGBA(rgba, w, h, gw, gh);
  }
  const src = makeCanvas(gw, gh);
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(grasp), gw, gh), 0, 0);
  const c = makeCanvas(dw, dh);
  c.getContext('2d').drawImage(src, 0, 0, dw, dh);
  const blob = await canvasToBlob(c, WEBP_TYPE, WEBP_QUALITY);
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return 'data:image/webp;base64,' + btoa(bin);
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

// DIAGNOSTIC (temporary): send the panel log WITHOUT the debugMode
// gate (emitDebug returns early when debugMode is off, so the user
// would never see it). Same 5s race + swallow as emitDebug, plus
// debug:true so the panel auto-shows and renders this tab at once.
// This function itself stays ungated: failure and recovery paths call
// it precisely because the user needs the log then. The SUCCESS path
// gates before calling (see there, 1.4.0 M1), so non-debug users do
// not get a panel pop on every good run.
async function sendDiagLog(tabId, runId) {
  try {
    await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: MSG.DEBUG_STAGE, runId, stage: 'diaglog',
        payload: { title: 'Diagnostic log', log: diagLogBuf.join('\n') },
        debug: true,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('sendDiagLog timeout')), 5000)),
    ]);
  } catch { /* content script not there yet or send hung */ }
}

// FIX1: persisted run records (Firefox background-death recovery).
// The in-memory runs map dies with the background page, so a run in flight
// when the background died would leave its pill frozen forever. A minimal
// record per run lives in storage.local (already permitted; storage.session
// availability on Firefox 115 is uncertain, so local is the safe choice).
// Written on run start + on stage change only (not on every progress tick,
// so a 100-tile inpaint costs ~8 writes, not 100+). Removed on run end
// (finally) and by the alarm/orphan recovery paths. Best-effort: every
// call is fire-and-forget and never throws into the pipeline. Single-run
// assumption: concurrent runs share one map key, so two runs starting in
// the same instant could clobber each other (read-modify-write); the
// common case (one run at a time) is exact.
const ACTIVE_RUNS_KEY = 'ct-active-runs';
const persistedStageByRun = new Map(); // runId -> last stage written
async function persistRunRecord(runId, tabId, stage) {
  try {
    const all = (await chrome.storage.local.get(ACTIVE_RUNS_KEY))[ACTIVE_RUNS_KEY] || {};
    const prev = all[runId];
    all[runId] = { tabId, stage, startedAt: (prev && prev.startedAt) || Date.now(), updatedAt: Date.now() };
    await chrome.storage.local.set({ [ACTIVE_RUNS_KEY]: all });
    persistedStageByRun.set(runId, stage);
  } catch {}
}
async function clearRunRecord(runId) {
  try {
    const all = (await chrome.storage.local.get(ACTIVE_RUNS_KEY))[ACTIVE_RUNS_KEY] || {};
    if (all[runId]) {
      delete all[runId];
      await chrome.storage.local.set({ [ACTIVE_RUNS_KEY]: all });
    }
    persistedStageByRun.delete(runId);
  } catch {}
}

// FIX2: run-scoped keep-alive. Firefox MV3 background.page is a
// non-persistent event page (MDN: `persistent` defaults to false in
// MV3 and setting it true is an error; the page may be unloaded when
// idle). Two runs in a row died mid-inpaint (~24s in) and were only
// recovered by FIX1 — prevention is needed, with recovery staying as
// backup. Two mechanisms, both opened on run start and closed in
// runPipeline finally (success, failure, cancel), so they never hold
// the background alive forever:
// (1) A long-lived runtime Port held open for the run. An open port is
// the standard event-page keep-alive: the page counts as active while
// any port is open. Self-connect (background connects to itself) with
// a top-level onConnect listener that accepts the keepalive name —
// without a listener the port is invalid immediately.
// (2) A periodic alarm (1 min) named ct-keepalive:<runId>. Each fire
// dispatches an event (activity) and, if the page was unloaded anyway,
// wakes a fresh page (which then runs FIX1 recovery instead of
// freezing). ml-bridge's onAlarm ignores non-ct-ml: names, and this
// listener ignores ct-ml: names, so neither interferes with ML alarms.
// Neither mechanism touches ML, timers, or recovery paths.
const keepAlivePorts = new Map(); // runId -> Port (outgoing end)
const keepAliveIncoming = new Set(); // incoming ends, held so they are not GC'd
function keepAliveStart(runId) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect) {
      const port = chrome.runtime.connect({ name: 'ct-keepalive' });
      port.onDisconnect.addListener(() => {
        keepAlivePorts.delete(runId);
        diagPush('keepalive port disconnected run ' + runId);
      });
      keepAlivePorts.set(runId, port);
      diagPush('keepalive started run ' + runId);
    }
  } catch {}
  try {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      const p = chrome.alarms.create('ct-keepalive:' + runId, { periodInMinutes: 1 });
      if (p && p.catch) p.catch(() => {});
    }
  } catch {}
}
function keepAliveStop(runId) {
  try {
    const port = keepAlivePorts.get(runId);
    if (port) { try { port.disconnect(); } catch {} keepAlivePorts.delete(runId); }
  } catch {}
  try {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      const p = chrome.alarms.clear('ct-keepalive:' + runId);
      if (p && p.catch) p.catch(() => {});
    }
  } catch {}
}
// FIX3: also accept the content-script-held keep-alive Port
// (ct-keepalive-tab). FIX2's self-connect Port (both ends in the
// background) did not prevent a third mid-inpaint death, so the hold
// must come from a DIFFERENT context: the tab's content script, which
// opens it on run-started and heartbeats every 20s. An open channel to
// another context, with messages across it, is the documented activity
// that keeps an event page / worker alive; a silent self-connect is
// not. Held in keepAliveIncoming so it is not GC'd. Heartbeats are
// activity only — never logged per-beat (that would flood the panel
// log) and never touch runs or ML.
// 2.0.24: also accept the benchmark keep-alive Port
// (ct-bench-keepalive). The offscreen doc opens it only while the
// thread benchmark measures and heartbeats every 20s, so the doc is
// not frozen/throttled mid-measurement; it disconnects when the bench
// ends or is cancelled. Same rule as the run keep-alive: a Port from a
// different context, with messages across it.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || (port.name !== 'ct-keepalive' && port.name !== 'ct-keepalive-tab' && port.name !== 'ct-bench-keepalive')) return;
    keepAliveIncoming.add(port);
    diagPush('keepalive port connected name ' + port.name);
    try { port.onMessage.addListener(() => { /* heartbeat activity only */ }); } catch {}
    port.onDisconnect.addListener(() => { keepAliveIncoming.delete(port); diagPush('keepalive port disconnected name ' + port.name); });
  });
}
if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || !alarm.name || !alarm.name.startsWith('ct-keepalive:')) return;
    // No-op: the dispatch itself is the activity signal. Never touch
    // runs, ML, or recovery here.
  });
}

// DIAGNOSTIC (temporary): count every failed progress send to the tab,
// so the log shows the TRUE total (not a pasted sample) plus when the
// tab last responded. Broadcast failures are not logged: the popup is
// normally closed, so those failures are expected, not a signal.
let diagProgressFails = 0;
let diagProgressLastOk = 0;
function setProgress(runId, stage, progress, extra = {}) {
  currentRun = { runId, stage, progress };
  // FIX1: persist stage changes only (not every progress tick, and never
  // 'done'/'cancelled' — the finally below clears the record anyway).
  // Fire-and-forget: never blocks progress updates.
  if (stage !== 'done' && stage !== 'cancelled' && persistedStageByRun.get(runId) !== stage) {
    const t = runs.get(runId)?.tabId;
    if (t != null) persistRunRecord(runId, t, stage);
  }
  const payload = { type: MSG.RUN_PROGRESS, runId, stage, progress, ...extra };
  chrome.runtime.sendMessage(payload).catch(() => {});
  // Targeted copy for the tab's status pill (broadcasts reach every tab).
  const tabId = runs.get(runId)?.tabId;
  if (tabId != null) {
    chrome.tabs.sendMessage(tabId, { ...payload, direct: true }).then(
      () => { diagProgressLastOk = Date.now(); },
      () => {
        diagProgressFails++;
        diagPush('progress send failed #' + diagProgressFails + ' run ' + runId + ' stage ' + stage + ' progress ' + progress + ' tab ' + tabId + ' lastOk ' + (diagProgressLastOk ? new Date(diagProgressLastOk).toISOString() : 'never'));
      }
    );
  }
}

function broadcastError(runId, error, grant) {
  // The failed run's image hosts are kept on currentRun so the popup can
  // offer a one-click grant for ALL of them at once (ct/get-status ->
  // refreshSite). One ask, every pic: the grant must cover every host the
  // run needs, not just the first one, or the user has to grant again for
  // the next host. grant.hosts is the full list; grant.host is the first
  // (kept for the single-host fallback and the label).
  currentRun = { runId, stage: 'error', progress: 0, error,
    ...(grant && grant.host ? { grantHost: grant.host, grantLabel: grant.label || grant.host } : {}),
    ...(grant && Array.isArray(grant.hosts) && grant.hosts.length ? { grantHosts: grant.hosts } : {}) };
  const payload = { type: MSG.RUN_PROGRESS, runId, stage: 'error', error };
  if (grant && grant.host) { payload.grantHost = grant.host; payload.grantLabel = grant.label || grant.host; }
  if (grant && Array.isArray(grant.hosts) && grant.hosts.length) payload.grantHosts = grant.hosts;
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
// extra.srcUrl names the exact <img> for the manual-send path; extra.uid
// names it for the multi-pic path; the auto path omits both and the page
// replaces its detected main image.
async function sendRender(tabId, runId, mode, imageDataUrl, w, h, blocks, timings, debug, extra = {}) {
  // DIAGNOSTIC (temporary): delivery is the decisive step — log the
  // attempt, any send failure, and the reply, so the log shows whether
  // the run finished inpaint and failed only at delivery.
  diagPush('sendRender attempt run ' + runId + ' tab ' + tabId + ' mode ' + mode);
  let renderRes;
  try {
    renderRes = await chrome.tabs.sendMessage(tabId, {
      type: MSG.RENDER, runId, mode,
      imageDataUrl, width: w, height: h,
      blocks, timings, debug,
      ...(extra.srcUrl ? { srcUrl: extra.srcUrl } : {}),
      ...(extra.uid ? { uid: extra.uid } : {}),
    });
  } catch (e) {
    diagPush('sendRender send failed run ' + runId + ' tab ' + tabId + ': ' + String((e && e.message) || e));
    throw e;
  }
  diagPush('sendRender reply run ' + runId + ' tab ' + tabId + ': ' + JSON.stringify(renderRes && { ok: renderRes.ok, replaced: renderRes.replaced, error: renderRes.error }));
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
// Tier-1 hit with a new targetLang: translate the OCR'd blocks only,
// skipping detect/OCR/inpaint entirely. Stores the Tier-2 entry for next time.
// uid names the <img> for the multi-pic render; onProgress maps the stage
// onto this image's slice of the run (defaults to the whole run).
async function renderFromTier1(tabId, runId, tier1Entry, tier2Key, settings, timings, srcUrl, rgba, w, h, mode, tier, uid, onProgress) {
  checkCancelled(runId);
  const progress = onProgress || ((stage, frac, extra) => setProgress(runId, stage, frac, extra || {}));
  progress('translate', 0.5);
  const t0 = performance.now();
  // Blocks from Tier-1 have OCR text but no translations.
  const blocks = tier1Entry.blocks.map(b => ({ ...b }));
  // Source language was resolved at Tier-1 write time — reuse it verbatim
  // instead of re-detecting (G10). Entries written before this field existed
  // fall back to detection.
  let effSettings = settings;
  if (settings.sourceLang === 'auto') {
    const resolved = tier1Entry.sourceLang || detectPageLang(blocks.map(b => b.text));
    effSettings = { ...settings, sourceLang: resolved || 'ja' };
  }
  const runController = runs.get(runId)?.abortController || new AbortController();
  // Tier-1 translate needs its own 30s abort (the full pipeline has one;
  // this path had none, so a stalled backend hung forever). Local
  // controller: aborting the run's controller would trip the
  // checkCancelled below even after a rescued translation.
  const translateController = new AbortController();
  if (runController.signal?.aborted) { try { translateController.abort(); } catch {} }
  else runController.signal?.addEventListener('abort', () => { try { translateController.abort(); } catch {} }, { once: true });
  const tier1TimeoutId = setTimeout(() => { try { translateController.abort(); } catch {} }, 30000);
  const failoverNotice = (p) => {
    if (p && p.failoverFrom && p.failoverTo) {
      chrome.tabs.sendMessage(tabId, {
        type: MSG.PILL_NOTICE,
        text: `Engine ${p.failoverFrom} failed — retrying with ${p.failoverTo}`,
        sticky: false,
      }).catch(() => {});
    }
  };
  let translated;
  try {
    translated = await translateBlocks(blocks, effSettings, failoverNotice, translateController.signal, 30000, () => runs.get(runId)?.cancelled === true);
  } finally {
    clearTimeout(tier1TimeoutId);
  }
  checkCancelled(runId);
  blocks.forEach((b, i) => { b.translation = translated[i]; });
  const translateMs = Math.round(performance.now() - t0);
  timings.translate = translateMs;
  // Store Tier-2 entry for next time.
  try {
    if (!(await isIncognitoTab(tabId))) {
      await pageCachePut(tier2Key, {
        translations: translated,
        targetLang: settings.targetLang,
        backend: settings.translationBackend,
      });
    }
  } catch (e) {
    console.warn('[ct] tier-2 cache write failed:', String((e && e.message) || e).slice(0, 120));
  }
  // Render with the translated blocks.
  const entry = { ...tier1Entry, blocks };
  return await renderFromPageCache(tabId, runId, entry, settings, timings, srcUrl, { uid, onProgress: progress });
}

async function renderFromPageCache(tabId, runId, entry, settings, timings, srcUrl, opts = {}) {
  checkCancelled(runId);
  // Multi-pic: the per-image loop owns progress (including the final
  // 'done'), so this only reports its own stage. The doneExtra is returned
  // for the loop to use on the final 'done'.
  const progress = opts.onProgress || ((stage, frac, extra) => setProgress(runId, stage, frac, extra || {}));
  progress('render', 0.96);
  const t0 = performance.now();
  await sendRender(tabId, runId, entry.mode || 'replace',
    entry.imageDataUrl, entry.width, entry.height, entry.blocks,
    { ...timings, cacheHit: Math.round(performance.now() - t0) },
    settings.debugMode, { srcUrl, uid: opts.uid });
  // Label the pill so a cache serve never looks like a fresh translate:
  // full hits say "from cache"; Tier-1-after-translate says which backend
  // actually translated (its blocks carry backendUsed from translateBlocks).
  // Without this, a cached run with Google blocked looked exactly like
  // Google working despite the block.
  const doneExtra = opts.fromCache
    ? { cached: true }
    : { backendLabel: BACKEND_SHORT_LABEL[entry.blocks?.[0]?.backendUsed || settings.translationBackend] || settings.translationBackend };
  return { runId, ok: true, cached: !!opts.fromCache, doneExtra };
}

// ---------------------------------------------------------------- pipeline
// opts.srcUrl: manual send (right-click) — translate this exact image,
// bypassing the minimum image size. Otherwise the auto path.
async function runPipeline(tabId, opts = {}) {
  const manualSrc = opts.srcUrl || null;
  const runId = 'run-' + Date.now().toString(36) + '-' + (runSeq++) + '-' + Math.random().toString(36).slice(2, 8);
  // AbortController for in-flight translation fetches — aborted on cancel so
  // a 50-block translate doesn't keep burning quota after the user cancelled.
  const abortController = new AbortController();
  runs.set(runId, { cancelled: false, tabId, abortController });
  clearDiagLog(); // 1.4.0 (m6): this run's panel log is its own, not the tail of older runs.
  // 2.1.20: show the persisted bench trace at the top of this run's log,
  // so one paste shows the full bench history (trigger, start, saves)
  // even after a worker restart wiped the in-memory lines.
  // 2.1.29: replay only the last 10 real lines (was 30), filter out the
  // retired lines, and trim the stored list to the last 5 real lines at
  // run start so the old noise is purged from storage, not just hidden.
  try {
    chrome.storage.local.get('benchTrace').then((saved) => {
      const arr = (saved && Array.isArray(saved.benchTrace)) ? saved.benchTrace : [];
      const kept = arr.filter((e) => e && !benchTraceIsRetired(e.line));
      for (const e of kept.slice(-10)) { try { diagPush('threads bench trace: ' + e.line); } catch {} }
      const trimmed = kept.slice(-5);
      if (trimmed.length !== arr.length) {
        try { chrome.storage.local.set({ benchTrace: trimmed }); } catch {}
      }
    }).catch(() => {});
  } catch {}
  persistRunRecord(runId, tabId, 'capture'); // FIX1: see helpers above.
  const settings = await getSettings();
  const timings = {};
  const pipelineT0 = performance.now(); // overall wall-clock for this run
  // Firefox: pre-load the 206MB LaMa first, before detector/OCR fragment the
  // WASM heap. A fragmented heap can't provide the contiguous block LaMa needs.
  if (directHandlers()) {
    try { await callMl({ type: MSG.ML_ENSURE, model: 'inpaint' }); } catch (e) { diagPush('inpaint preload failed, loading on demand: ' + String((e && e.message) || e).slice(0, 120)); }
  }
  const pxKeys = []; // IDB pixel-bus keys created this run; dropped in finally
  let result;
  try {
    keepAliveStart(runId); // FIX2: hold the background alive for this run only; released in finally.
    // MEASURE1: thread-info diagnostic (best-effort, never fails the run).
    // Served by the same ML host as compute (worker on Firefox, offscreen
    // doc on Chrome — see ML_WORKER_TYPES in ml-bridge.js), so the numbers
    // describe the realm actually running WASM, not the background page.
    try {
      const d = await callMl({ type: MSG.ML_DIAG, runId }, { tabId });
      diagPush('thread-info context ' + (d && d.context != null ? d.context : 'unknown')
        + ' sharedArrayBuffer ' + (d && d.sharedArrayBuffer ? 'yes' : 'no')
        + ' crossOriginIsolated ' + (d && d.crossOriginIsolated != null ? String(d.crossOriginIsolated) : 'unknown')
        + ' hardwareConcurrency ' + (d && d.hardwareConcurrency != null ? d.hardwareConcurrency : 'unknown')
        + ' numThreads ' + (d && d.numThreads != null ? d.numThreads : 'unknown'));
      // First-startup detection, ML-realm number: if onInstalled missed
      // it (or the SW number differed), this first run saves it. Only
      // saves when missing or changed, never blocks the run.
      saveDetectedCores(d && d.hardwareConcurrency, 'thread-info');
    } catch (e) {
      diagPush('thread-info failed: ' + String((e && e.message) || e).slice(0, 120));
    }
    // Chrome GPU1 (2.0.7): warm the shared GPU worker NOW, at pipeline
    // start, so the ~6s LaMa load overlaps detect/OCR/translate instead
    // of blocking the inpaint stage. Fire and forget — the run never
    // waits for it. If the worker is already warm this is ~free; if
    // warmup fails the normal GPU path still falls back to WASM.
    // Placed after ML_DIAG, so the offscreen doc is proven alive and
    // listening. Firefox already preloads above (awaited, for heap
    // reasons), so this is Chrome-only.
    if (!directHandlers()) {
      diagPush('inpaint gpu warmup start run ' + runId);
      try {
        const p = chrome.runtime.sendMessage({ type: MSG.ML_GPU_WARMUP, runId });
        if (p && p.catch) p.catch(() => {});
      } catch {}
    }
    // Inject the overlay early so debug-stage payloads have a panel to land in.
    // content.js guards against double-injection; the canvas stays empty until render.
    // Gate on the host permission first: without it injection always fails, and
    // the error below names the fix instead of a cryptic browser message.
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const tabUrl = (tab && tab.url) || '';
    const tabHost = hostOf(tabUrl);
    if (tabHost && !(await hasPageHostAccess(tabHost))) {
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
    // Auto-translate only: lazy pictures below the fold have not loaded
    // yet, so the inventory would skip them. Force the page to load
    // every picture first (content script scrolls through the page, then
    // jumps back). Best-effort with a timeout — a failure or timeout
    // must never block the run; translate whatever loaded.
    if (opts.auto && !manualSrc) {
      try {
        const r = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'ct/force-load-images' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('force-load timeout')), 20000)),
        ]);
        diagPush('force-load images: ' + (r && r.ok ? (r.loaded + '/' + r.total + ' loaded in ' + r.ms + 'ms (direct ' + (r.directTriggered || 0) + ', ' + (r.scrolled ? r.steps + ' scroll steps' : 'no scroll')) : 'failed: ' + String((r && r.error) || 'no reply').slice(0, 80)));
      } catch (e) {
        diagPush('force-load images skipped: ' + String((e && e.message) || e).slice(0, 80));
      }
    }
    // ---- 1. inventory: every qualifying picture on the page (multi-pic).
    // Each one then runs the full pipeline; per-image stage progress maps onto
    // its slice of the overall run, debug titles carry the image index, and one
    // bad picture never kills the rest of the run.
    const { images, skipped, ignored } = await getPipelineImages(tabId, settings, tabUrl, { srcUrl: manualSrc });
    if (skipped.length) diagPush('skipping page images: ' + skipped.join(' | ').slice(0, 300));
    // Permission gate: check EVERY picture's host before the run starts.
    // A picture whose host has no permission fails the background-tab read
    // and is lost for that run — there is no second chance, so the run must
    // not start until every host is permitted. Record the missing hosts (the
    // popup offers them) and stop with a clear error telling the user to
    // grant access first, then run again.
    const missingHosts = await checkImageHostPermissions(images);
    if (missingHosts.length) {
      for (const h of missingHosts) await recordMissingHost('https://' + h + '/');
      diagPush('permission gate: missing host permission for ' + missingHosts.join(', '));
      const label = displayHost(missingHosts[0]);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.PILL_NOTICE,
          text: `Pictures on ${label} need permission — open the popup and tap Grant access, then run translate again.`,
          sticky: true,
        });
      } catch { /* pill is best-effort */ }
      const gateErr = new Error(
        `Pictures on ${label} need permission — open the extension popup and tap "Grant access", then run translate again. (${missingHosts.length} host${missingHosts.length > 1 ? 's' : ''} missing permission)`,
      );
      gateErr.grantHost = missingHosts[0];
      gateErr.grantHosts = missingHosts;
      throw gateErr;
    }
    const doneImgs = [], failedImgs = [];
    // Skipped pictures (below min size, over the cap) count as "not
    // translated" in the run summary, so the user knows why some pictures
    // on the page did not change.
    if (skipped.length) failedImgs.push(...skipped);
    let fallbackUrl = null;
    let lastDoneExtra = null;
    const multi = images.length > 1;
    // GPU1 per-run downgrade: set on any GPU failure (error or hang),
    // so GPU is never retried again in THIS run. Next run tries GPU
    // fresh (per-run stick only, per spec). Shared across images in
    // this run; dies with the run in finally (runs.delete(runId)).
    let gpuDowngradedThisRun = false;
    // Per-image worker (nested: closes over runId, settings, tabId, tabUrl,
    // manualSrc, abortController, gpuDowngradedThisRun, opts). One image's
    // pixels are loaded just before its stages run; its pixel-bus keys are
    // dropped by the caller after each image, so only one image's bytes are
    // ever live alongside the WASM sessions.
    async function runOneImage(img, imgSetProgress, imgEmitDebug, imgTimings, imgPxKeys, imgT0, preCaptured) {
      // ---- 1. capture: the page's own picture (min-size gated), else viewport
      imgSetProgress('capture', 0.02);
      let t0 = performance.now();
      let rgba, w, h, mode, tier, attempts;
      // Per-image preCaptured wins (auto 403 fallback, one image at a time);
      // the run-level opts.preCaptured is the manual-send fallback for the
      // whole run. Either way the pixels were read from a background tab
      // where the image is same-origin, so skip the download tiers.
      const pre = preCaptured || opts.preCaptured;
      if (pre) {
        // 403 fallback: pixels were read from a background tab where the image
        // is same-origin. Skip the download tiers entirely; the rest of the
        // pipeline (detect → OCR → translate → inpaint → render) runs normally
        // on the original tab, replacing the picture in place.
        ({ rgba, w, h } = pre);
        mode = 'replace';
        tier = 'fallback-tab';
      } else {
        ({ rgba, w, h, mode, tier, attempts } = await loadPipelineImagePixels(tabId, img, settings, tabUrl, { srcUrl: manualSrc }));
      }
      imgTimings.capture = Math.round(performance.now() - t0);
      // Capture diagnostic: which tier ran, how long each attempt took, and
      // how big the download was — the log then answers "internet or local?"
      // on its own, no debug mode needed. page-canvas is local (the picture
      // was already in the page); page/worker-fetch download it, so a slow
      // fetch with a big byte count is the server or the connection.
      const capAttempts = attempts || [];
      for (const a of capAttempts) {
        diagPush('capture attempt ' + a.tier + ' ' + (a.ok ? 'ok' : 'failed') + ' ms ' + a.ms +
          (a.bytes != null ? ' bytes ' + a.bytes : '') +
          (a.error ? ' error ' + String(a.error).slice(0, 120) : ''));
      }
      const capWin = capAttempts.find(a => a.ok);
      diagPush('capture tier ' + tier + ' ms ' + imgTimings.capture + ' image ' + w + 'x' + h +
        (capWin && capWin.bytes != null ? ' bytes ' + capWin.bytes : ''));
      // Single source of truth for dimensions: normalize ALL capture tiers to
      // renderScale dims HERE, once. Tier 1a (page canvas) already downscales,
      // but tiers 1b/1c (fetches) return full-res — without this, detector
      // boxes, cache keys, and Tier-1 entries disagree on the coordinate system.
      // Everything downstream (detect, OCR, inpaint, cache) uses these scaled w/h.
      {
        const cs = renderScale(w, h);
        if (cs < 1) {
          const sw = Math.max(1, Math.round(w * cs)), sh = Math.max(1, Math.round(h * cs));
          rgba = resizeBilinearRGBA(rgba, w, h, sw, sh);
          w = sw; h = sh;
        }
      }
      const capMean = meanBrightness(rgba);
      if (capMean < 0.004) {
        throw new Error(
          `captured image came back blank (all pixels black) via "${tier}" — ` +
          `the page's picture could not be read. Reload the page and try again; ` +
          `if it persists, the site may be blocking pixel access.`);
      }
      // The data-URL image is only built in debug mode — in normal runs this
      // PNG encode of the full page is pure overhead.
      await imgEmitDebug('capture',
        { title: `Captured page — ${tier}, mean brightness ${capMean.toFixed(3)}`, image: settings.debugMode ? await rgbaToDataURL(rgba, w, h) : null, w, h, bytes: (capWin && capWin.bytes != null ? capWin.bytes : null), ms: imgTimings.capture });

      // ---- 1b. page cache: a page translated earlier in this session renders
      // instantly — no detection, OCR, inpaint, or translation. The stored entry
      // is re-sent as ct/render, so the content script re-composites the text
      // with the CURRENT font settings; font-size tweaks never invalidate it.
      // An early return inside try still runs the finally below (runs.delete +
      // dropping staged pixel payloads), so cleanup is unchanged.
      checkCancelled(runId);
      let cacheHit = null;
      let tier1Key = null, tier1Entry = null;
      try {
        if (!(await isIncognitoTab(tabId))) {
          // Two-tier lookup: Tier 1 (target-independent) first, then Tier 2
          // (targetLang + backend). A Tier-1 hit with a new targetLang
          // translates only — skipping detect/OCR/inpaint.
          tier1Key = await buildCacheKeyTier1(rgba, w, h, settings);
          tier1Entry = await pageCacheGet(tier1Key);
          // Dimension guard: the entry must match the CURRENT (scaled) capture
          // dims. A mismatch means the entry was stored at different dims
          // (e.g. before the R3 normalization) — treat as miss and overwrite.
          if (tier1Entry && (tier1Entry.width !== w || tier1Entry.height !== h)) {
            diagPush(`page-cache MISS tier1 ${tier1Key.split('~')[1]?.slice(0, 12)} dims ${tier1Entry.width}x${tier1Entry.height} != ${w}x${h} (tier ${tier})`);
            tier1Entry = null;
          }
          if (tier1Entry) {
            const tier2Key = buildCacheKeyTier2(tier1Key, settings);
            const tier2Entry = await pageCacheGet(tier2Key);
            if (tier2Entry && tier2Entry.translations) {
              // Full hit: apply cached translations to the Tier-1 blocks.
              diagPush(`page-cache HIT tier1+2 ${tier1Key.split('~')[1]?.slice(0, 12)} image ${w}x${h} (tier ${tier})`);
              const blocks = tier1Entry.blocks.map((b, i) => ({
                ...b, translation: tier2Entry.translations[i] || '',
              }));
              cacheHit = { ...tier1Entry, blocks };
            } else {
              // Tier-1 hit, Tier-2 miss: translate the OCR'd blocks only.
              // (Falls through to the translate-only path below.)
              diagPush(`page-cache HIT tier1 only ${tier1Key.split('~')[1]?.slice(0, 12)} image ${w}x${h} (tier ${tier})`);
              cacheHit = { tier1Only: true, entry: tier1Entry, tier2Key };
            }
          } else {
            // No Tier 1: try the legacy v1 key for backward compatibility.
            diagPush(`page-cache MISS tier1 ${tier1Key.split('~')[1]?.slice(0, 12)} image ${w}x${h} (tier ${tier})`);
            cacheHit = await pageCacheGet(await buildCacheKey(rgba, w, h, settings));
            if (cacheHit) diagPush(`page-cache HIT legacy v1 image ${w}x${h} (tier ${tier})`);
          }
        }
      } catch (e) {
        console.warn('[ct] page-cache lookup failed:', String((e && e.message) || e).slice(0, 120));
      }
      if (cacheHit) {
        if (cacheHit.tier1Only) {
          // Translate-only path: Tier-1 gave us inpainted base + OCR blocks.
          // Translate to the new targetLang, store Tier-2, render.
          return await renderFromTier1(tabId, runId, cacheHit.entry, cacheHit.tier2Key,
            settings, imgTimings, manualSrc, rgba, w, h, mode, tier, img.uid, imgSetProgress);
        }
        return await renderFromPageCache(tabId, runId, cacheHit, settings, imgTimings, manualSrc, { fromCache: true, uid: img.uid, onProgress: imgSetProgress });
      }

      // ---- 2. detection (+ tall-image slicing)
      checkCancelled(runId);
      imgSetProgress('detect', 0.1);
      t0 = performance.now();
      let detections, detectInputMean = null;
      if (h / w > 3.5) {
        detections = await detectSliced(rgba, w, h, settings.detectionThreshold, runId, imgPxKeys);
      } else {
        // NOTE: pixel bytes go through the IDB pixel bus — chrome.runtime
        // messaging drops ArrayBuffers sent from the service worker.
        const pxKey = `detect:${runId}`;
        imgPxKeys.push(pxKey);
        await pixelPut(pxKey, rgba.buffer);
        const r = await callMlChecked(runId, { type: MSG.ML_DETECT, key: pxKey, width: w, height: h, threshold: settings.detectionThreshold, runId });
        detections = r.boxes;
        imgTimings.detect = r.ms;
        detectInputMean = r.inputMean;
        if (detectInputMean != null && detectInputMean < 0.004) {
          throw new Error(`the detector received a blank image (input mean ${detectInputMean}) ` +
            `although the capture looked fine (mean ${capMean.toFixed(3)}) — pixel data was lost ` +
            `between capture and detection. Reload the page and try again.`);
        }
      }
      if (!imgTimings.detect) imgTimings.detect = Math.round(performance.now() - t0);
      imgSetProgress('detect', 0.25);
      await imgEmitDebug('detect', {
        title: `Detection — ${detections.length} boxes @ ≥${settings.detectionThreshold}` +
          (detectInputMean != null ? ` (detector input mean ${detectInputMean})` : ''),
        boxes: detections, w, h, threshold: settings.detectionThreshold, ms: imgTimings.detect,
        image: settings.debugMode ? await rgbaToDataURL(rgba, w, h) : null,
      });

      // ---- 3. text blocks
      checkCancelled(runId);
      t0 = performance.now();
      const blocks = buildBlocks(detections, w, h, rgba, settings);
      imgTimings.blocks = Math.round(performance.now() - t0);
      imgSetProgress('blocks', 0.3);
      // Promotion visibility: how many blocks came from bubbles with no
      // text box. 0 on a page where detection is already good (no-op).
      // A large number here on other pages would mean over-firing.
      if (blocks.promotedCount) diagPush(`blocks promoted ${blocks.promotedCount} bubble(s) with no text box (of ${detections.length} detections -> ${blocks.length} blocks)`);
      await imgEmitDebug('blocks', {
        title: `Text blocks — ${blocks.length}` + (blocks.promotedCount ? ` (${blocks.promotedCount} promoted from bubbles)` : ''),
        blocks: blocks.map((b, i) => ({
          i, text_class: b.text_class,
          xyxy: b.xyxy.map(v => Math.round(v)),
          bubble_xyxy: b.bubble_xyxy ? b.bubble_xyxy.map(v => Math.round(v)) : null,
          font_color: b.font_color,
        })),
        ms: imgTimings.blocks,
      });

      // ---- 4. OCR (sequential — the mask stage needs blk.text, so it must
      // wait for OCR; see buildBlockMaskData's `if (!blk.text ...)` guard).
      checkCancelled(runId);
      imgSetProgress('ocr', 0.38);
      {
        // DIAG (2.0.9): prep = crop building + pixelPut (SW side, invisible
        // in r.ms); call = the ML round trip; load rides on r.loadMs.
        const ocrPrepT0 = performance.now();
        const crops = [];
        for (const [i, b] of blocks.entries()) {
          const c = cropForBlock(rgba, w, h, b.xyxy, b.bubble_xyxy);
          if (!c) continue;
          const pxKey = `ocr:${runId}:${i}`;
          imgPxKeys.push(pxKey);
          await pixelPut(pxKey, c.data.buffer);
          crops.push({ id: i, key: pxKey, data: c.data, width: c.w, height: c.h, x: c.x, y: c.y, bw: b.xyxy[2] - b.xyxy[0], bh: b.xyxy[3] - b.xyxy[1] });
        }
        const ocrPrepMs = Math.round(performance.now() - ocrPrepT0);
        let ocrMs = 0, ocrEngineLabel = '', ocrCallMs = 0;
        // Per-crop OCR diagnostics for the debug panel: char count and whether
        // this crop needed the Baberu chunked re-OCR (v1.1: >256 chars, rare).
        const ocrStats = new Map();
        if (crops.length) {
          const ocrCallT0 = performance.now();
          // OCR is single-worker (2.1.26): the 2-worker pool (2.1.10-2.1.25)
          // was removed — it never beat single on any page (standard page
          // pool 4,932ms vs single 4,920ms; dense page pool 8,121ms vs
          // single 7,961ms). Single uses the measured best thread count
          // (4 on the M4) via threadsReady() in the doc. The thread bench
          // itself stays: it measures and saves the best count, and single
          // OCR reads it on every run.
          const r = await callMlChecked(runId, {
            type: MSG.ML_OCR, runId, sourceLang: settings.sourceLang,
            crops: crops.map(({ id, key, width, height }) => ({ id, key, width, height })),
          });
          ocrCallMs = Math.round(performance.now() - ocrCallT0);
          ocrMs = r.ms;
          ocrEngineLabel = (MODEL_GROUPS.find(g => g.id === r.engine) || {}).label || r.engine || '';
          for (const res of r.results) {
            blocks[res.id].text = res.text;
            ocrStats.set(res.id, { chars: res.chars, chunks: res.chunks, hitCeiling: res.hitCeiling, stopped: res.stopped, skipped: !!res.skipped });
          }
          // DIAG (2.0.9): OCR split + slowest crops, so one Mac run shows
          // whether OCR time is one long crop, even per-crop cost, or the
          // Baberu load — the fix depends on which it is.
          diagPush('ocr split ms prep ' + ocrPrepMs + ' load ' + ((r && r.loadMs) || 0) + ' run ' + ocrMs + ' call ' + ocrCallMs);
          const cropById = new Map(crops.map(c => [c.id, c]));
          let ocrChars = 0, ocrSkipped = 0;
          const ocrSlow = [];
          for (const res of r.results) {
            ocrChars += res.chars || 0;
            if (res.skipped) ocrSkipped++;
            const cc = cropById.get(res.id);
            ocrSlow.push({ id: res.id, w: cc ? cc.width : 0, h: cc ? cc.height : 0, chars: res.chars || 0, chunks: res.chunks || 0, skipped: !!res.skipped, ms: res.ms || 0 });
          }
          ocrSlow.sort((a, b) => b.ms - a.ms);
          diagPush('ocr crops ' + r.results.length + ' skipped ' + ocrSkipped + ' chars ' + ocrChars);
          for (const s of ocrSlow.slice(0, 5)) diagPush('ocr slow crop ' + s.id + ' ' + s.w + 'x' + s.h + ' chars ' + s.chars + ' chunks ' + s.chunks + ' skipped ' + (s.skipped ? 'yes' : 'no') + ' ms ' + s.ms);
        }
        imgTimings.ocr = ocrMs;
        imgSetProgress('ocr', 0.55);
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
        await imgEmitDebug('ocr', {
          title: `OCR — ${crops.length} crops, ${ocrTextCount} with text${ocrEngineLabel ? ` (${ocrEngineLabel})` : ''}` +
            (clippedCount ? `, ${clippedCount} hit the 256-char model cap (re-OCR'd in chunks)` : ''),
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
        imgSetProgress(branch, parMax);
      };
      // Long tiled inpaints feed per-tile progress through this (Firefox: the
      // ML host shares this page; Chrome: forwarded from the offscreen doc).
      // The pill keeps moving instead of looking stalled at one percentage
      // for minutes.
      runs.get(runId).onInpaintProgress = (frac) => parProgress('inpaint', frac);
      const runTranslate = async () => {
        parProgress('translate', 0);
        const t0t = performance.now();
        // 30s aborts the CURRENT attempt so translateBlocks can fail over:
        // rejecting the race directly used to bypass failover entirely, so a
        // stalled backend never switched to Azure. The 60s backstop kills a
        // run wedged past stall (30s) + rescue (20s).
        const TRANSLATE_TIMEOUT_MS = 30000;
        const TRANSLATE_BACKSTOP_MS = 60000;
        let timeoutId = null, backstopId = null;
        timeoutId = setTimeout(() => {
          try { abortController.abort(); } catch { /* already aborted */ }
        }, TRANSLATE_TIMEOUT_MS);
        const backstopP = new Promise((_, reject) => {
          backstopId = setTimeout(() => {
            reject(new Error('translate timed out — the translation backend may be stuck'));
          }, TRANSLATE_BACKSTOP_MS);
        });
        let translated;
        try {
          const failoverNotice = (p) => {
            if (p && p.failoverFrom && p.failoverTo) {
              chrome.tabs.sendMessage(tabId, {
                type: MSG.PILL_NOTICE,
                text: `Engine ${p.failoverFrom} failed — retrying with ${p.failoverTo}`,
                sticky: false,
              }).catch(() => {});
            }
          };
          translated = await Promise.race([
            translateBlocks(blocks, effSettings, failoverNotice, abortController.signal, 30000, () => runs.get(runId)?.cancelled === true),
            backstopP,
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (backstopId) clearTimeout(backstopId);
        }
        checkCancelled(runId);
        blocks.forEach((b, i) => { b.translation = translated[i]; });
        const translateMs = Math.round(performance.now() - t0t);
        parProgress('translate', 1);
        await imgEmitDebug('translate', {
          // Title shows the backend that ACTUALLY translated, not the
          // configured one — after failover they differ, and the old title
          // always said Google even when Azure/LM Studio did the work.
          title: `Translation — ${BACKEND_LABEL[blocks[0]?.backendUsed || settings.translationBackend] || settings.translationBackend}`,
          rows: blocks.map(b => ({ text: b.text, translation: b.translation, backend: b.backendUsed || settings.translationBackend })),
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
        await imgEmitDebug('mask', {
          title: `Mask — ${entries.length} block masks`,
          mask: settings.debugMode ? await rgbaToDataURL(maskToRGBA(fullMask, w, h), w, h) : null, ms: maskMs,
        });
        return { fullMask, entries, maskMs };
      };
      const runInpaint = async ({ fullMask, entries, maskMs }) => {
        checkCancelled(runId);
        parProgress('inpaint', 0);
        const t0i = performance.now();
        // DIAG (2.0.5): phase split of the inpaint stage, so one Mac run
        // shows where the stage time goes (prep / model load / GPU run /
        // paste / round-trip call / stage total). loadMs/readyMs ride on
        // r from the ML handler; the rest is timed here.
        let inpaintPath = 'wasm';
        let prepMs = 0, callMs = 0, pasteMs = 0, splitLoadMs = 0, splitReadyMs = null, splitTileMax = 0, splitHostMs = null, splitDocMs = null;
        // 2.0.27: the merge uses the LEARNED spread for this path
        // (gpu on Chrome, wasm1 on Firefox), starting at 1.3 and
        // adjusting from real runs (see readInpaintSpread above).
        const spreadMap = await readInpaintSpread();
        const mergeKey = directHandlers() ? 'wasm1' : 'gpu';
        const mergeSpread = spreadMap[mergeKey] || INPAINT_COST_SPREAD;
        const { boxes: patchBoxes, predictedMs, counts: patchCounts } = mergeBoxesByCost(entries, {
          // 2.0.14: cost-based merge (see textblock.js) — merge only when
          // the merged patch is predicted cheaper than the two apart.
          // Expected path: Chrome tries GPU first (tileMax 1024); Firefox
          // is WASM 1-thread (tileMax 512). A Chrome GPU failure falls back
          // to WASM on these same patches, as before.
          tileMax: directHandlers() ? TILE_MAX : 1024,
          ...(directHandlers() ? INPAINT_COST.wasm1 : INPAINT_COST.gpu),
          spread: mergeSpread,
        });
        diagPush('inpaint merge cost: ' + entries.length + ' boxes -> ' + patchBoxes.length + ' patches, predicted ' + Math.round(predictedMs) + 'ms (spread ' + mergeSpread.toFixed(2) + ')');
        const patches = [];
        for (const [i, pb] of patchBoxes.entries()) {
          checkCancelled(runId);
          const [x1, y1, x2, y2] = pb.map(Math.round);
          const pxKey = `inpaint:${runId}:${i}`;
          const maskKey = `inpaint-mask:${runId}:${i}`;
          imgPxKeys.push(pxKey, maskKey);
          await pixelPut(pxKey, cropRGBA(rgba, w, x1, y1, x2, y2).data.buffer);
          // Keep the mask bytes in memory too: the offscreen handler only
          // peeks the pixel-store copy (inputs are dropped by the pipeline
          // finally, not on read), but we need the mask again at compositing
          // time for mask-aware paste. pixelPut copies, so this view stays
          // valid.
          const maskData = cropMask1(fullMask, w, x1, y1, x2, y2);
          await pixelPut(maskKey, maskData.buffer);
          patches.push({ id: i, x: x1, y: y1, key: pxKey, maskKey, maskData, width: x2 - x1, height: y2 - y1 });
        }
        prepMs = Math.round(performance.now() - t0i);
        const inpainted = new Uint8ClampedArray(rgba);
        let inpaintMs = 0;
        if (patches.length) {
          diagPush('inpaint start run ' + runId + ' patches ' + patches.length);
          const wirePatches = patches.map(({ id, key, maskKey, width, height }) => ({ id, key, maskKey, width, height }));
          let r;
          // GPU1 (Firefox only): LaMa on WebGPU in a dedicated worker,
          // tried first when the browser exposes WebGPU. Any GPU failure
          // except user cancel (error, buffer error, OOM, or a hang
          // caught by the 60s inactivity watchdog in ml-bridge.js)
          // downgrades to WASM and retries once via the preloaded shared
          // worker, then sticks to WASM for the rest of this run. The
          // full error text is logged (no cut) so the panel log shows
          // exactly how GPU died. Cancelled runs never fall back:
          // checkCancelled throws before the downgrade. Chrome takes
          // the GPU1-Chrome branch below (offscreen-document GPU worker).
          // If WebGPU is not exposed, one line explains why GPU was
          // skipped, so a missing navigator.gpu is visible, not silent.
          const callT0 = performance.now();
          if (directHandlers() && !gpuDowngradedThisRun && !(typeof navigator !== 'undefined' && navigator.gpu)) {
            diagPush('inpaint gpu skipped: no navigator.gpu, using WASM path');
          }
          if (directHandlers() && !gpuDowngradedThisRun && typeof navigator !== 'undefined' && navigator.gpu) {
            try {
              diagPush('inpaint gpu start run ' + runId + ' patches ' + patches.length);
              r = await runGpuInpaint({
                runId, patches: wirePatches,
                onProgress: (frac) => parProgress('inpaint', frac),
                diag: diagPush,
                isCancelled: () => runs.get(runId)?.cancelled === true,
              });
              inpaintPath = 'gpu';
              diagPush('inpaint gpu done ms ' + r.ms + ' totalTiles ' + (r.totalTiles || 0));
            } catch (e) {
              checkCancelled(runId);
              gpuDowngradedThisRun = true;
              inpaintPath = 'gpu-failed-wasm';
              diagPush('inpaint gpu failed, downgrading to WASM for this run: ' + String((e && e.message) || e));
              r = await callMlChecked(runId, { type: MSG.ML_INPAINT, runId, patches: wirePatches });
              diagPush('inpaint gpu WASM retry done ms ' + r.ms + ' totalTiles ' + (r.totalTiles || 0));
            }
          } else if (!directHandlers() && !gpuDowngradedThisRun) {
          // GPU1-Chrome: LaMa on WebGPU in a dedicated worker spawned by
          // the offscreen document (the SW cannot spawn workers). Tried
          // first on Chrome; the document decides GPU availability in its
          // own realm (its navigator.gpu, not the SW's). Any GPU failure
          // except user cancel (error or a hang caught by the 60s
          // inactivity watchdog in ml-bridge.js) downgrades to WASM and
          // retries once via the offscreen document, then sticks to WASM
          // for the rest of this run. GPU_SKIPPED (no navigator.gpu in
          // the doc realm, worker creation/ready failure) logs "skipped"
          // and falls back to the single WASM path. Full error text is
          // logged (no cut). Cancelled runs never fall back:
          // checkCancelled throws before the downgrade.
            try {
              diagPush('inpaint gpu start run ' + runId + ' patches ' + patches.length);
              r = await runChromeGpuInpaint({
                runId, patches: wirePatches,
                onProgress: (frac) => parProgress('inpaint', frac),
                diag: diagPush,
                isCancelled: () => runs.get(runId)?.cancelled === true,
              });
              inpaintPath = 'gpu';
              diagPush('inpaint gpu done ms ' + r.ms + ' totalTiles ' + (r.totalTiles || 0) + (r.readyMs != null ? ' readyMs ' + r.readyMs : ''));
            } catch (e) {
              checkCancelled(runId);
              if (e && e.gpuSkipped) {
                inpaintPath = 'gpu-skipped-wasm';
                diagPush('inpaint gpu skipped: ' + String((e && e.message) || e));
                r = await callMlChecked(runId, { type: MSG.ML_INPAINT, runId, patches: wirePatches });
              } else {
                gpuDowngradedThisRun = true;
                inpaintPath = 'gpu-failed-wasm';
                diagPush('inpaint gpu failed, downgrading to WASM for this run: ' + String((e && e.message) || e));
                r = await callMlChecked(runId, { type: MSG.ML_INPAINT, runId, patches: wirePatches });
                diagPush('inpaint gpu WASM retry done ms ' + r.ms + ' totalTiles ' + (r.totalTiles || 0));
              }
            }
          } else {
            // Single WASM inpaint (2.1.27): the Firefox 2-worker pool
            // (POOL1) was removed — it never beat single (83.5s pool vs
            // 80.5s single on the standard page, 2026-11-04), and on this
            // Mac it never ran anyway (Firefox has GPU, GPU fails, then
            // single WASM). One big patch sets the floor no split can beat.
            r = await callMlChecked(runId, {
              type: MSG.ML_INPAINT, runId,
              patches: wirePatches,
            });
          }
          inpaintMs = r.ms;
          callMs = Math.round(performance.now() - callT0);
          splitLoadMs = (r && r.loadMs) || 0;
          splitReadyMs = (r && r.readyMs != null) ? r.readyMs : null;
          splitTileMax = (r && r.tileMax) || 0;
          // BUGFIX (2.1.11): r is block-scoped (declared inside the
          // patches block above) but the timing line below sits outside it
          // — reading r there threw 'r is not defined' and killed the run
          // after inpaint finished. Hoist the two timing values like
          // splitLoadMs above, so the line below reads them, not r.
          splitHostMs = (r && r.hostMs != null) ? r.hostMs : null;
          splitDocMs = (r && r.docMs != null) ? r.docMs : null;
          // MEASURE1: tile shape of this page, from the handler's count.
          if (r && typeof r.totalTiles === 'number') diagPush('inpaint tiles total ' + r.totalTiles + ' patches ' + patches.length);
          const pasteT0 = performance.now();
          for (const res of r.results) {
            const p = patches[res.id];
            imgPxKeys.push(res.key);
            const buf = await pixelTake(res.key);
            // Use the in-memory mask copy (p.maskData): the pixel-store copy
            // is only peeked by the handler and dropped by the pipeline
            // finally, so it may still be there — but maskData is the copy
            // this stage owns.
            pasteMaskedRGBA(inpainted, w,
              { data: new Uint8ClampedArray(buf), w: p.width, h: p.height },
              { data: p.maskData, w: p.width, h: p.height },
              p.x, p.y);
          }
          pasteMs = Math.round(performance.now() - pasteT0);
          // DIAG (2.0.8): one line per patch — size, tile count, fast-path
          // hit, and ms — so the fix follows the real shape, not a guess.
          if (r && Array.isArray(r.patchStats)) {
            for (const ps of r.patchStats) diagPush('inpaint patch ' + ps.id + ' ' + ps.w + 'x' + ps.h + ' tiles ' + ps.tiles + ' fast ' + (ps.fast ? 'yes' : 'no') + ' ms ' + ps.ms);
          }
          // 2.0.27: LEARN the spread from this run's merged patches.
          // For a merged patch, the base model (no spread) predicts
          // patchCostMs; the per-pixel part of (actual / predicted) is
          // the measured spread for that patch. Fast-path patches never
          // ran the model, so they carry no signal and are skipped.
          // Only merged patches count — a single-box patch never used
          // the spread. The median ratio of the run moves the stored
          // spread 10% toward it (damped, clamped), so one noisy run
          // cannot overfit it. The key is the path that actually ran
          // (gpu, or wasm on Chrome fallback, or wasm1 on Firefox).
          try {
            const actualKey = inpaintPath === 'gpu' ? 'gpu' : (directHandlers() ? 'wasm1' : 'wasm');
            const actualCost = INPAINT_COST[actualKey] || INPAINT_COST.gpu;
            const actualTileMax = splitTileMax || (actualKey === 'gpu' ? 1024 : TILE_MAX);
            const ratios = [];
            if (r && Array.isArray(r.patchStats) && Array.isArray(patchCounts)) {
              for (const ps of r.patchStats) {
                if (ps.fast) continue;
                if (!patchCounts[ps.id] || patchCounts[ps.id] < 2) continue;
                const w = Number(ps.w), h = Number(ps.h), tiles = Number(ps.tiles), ms = Number(ps.ms);
                if (!w || !h || !tiles || !ms) continue;
                const base = patchCostMs(w, h, actualTileMax, actualCost.fixedMs, actualCost.perPxMs);
                const fixedPart = tiles * actualCost.fixedMs;
                const perPxPart = base - fixedPart;
                const actualPerPx = ms - fixedPart;
                // Only use patches where the per-pixel part beats the fixed
                // overhead — otherwise the ratio is noise in the fixed cost.
                if (perPxPart <= fixedPart || actualPerPx <= 0) continue;
                const ratio = actualPerPx / perPxPart;
                if (Number.isFinite(ratio)) ratios.push(Math.min(3, Math.max(0.5, ratio)));
              }
            }
            if (ratios.length) {
              ratios.sort((a, b) => a - b);
              const median = ratios[Math.floor(ratios.length / 2)];
              const cur = (await readInpaintSpread())[actualKey] || INPAINT_COST_SPREAD;
              const next = Math.min(INPAINT_SPREAD_MAX, Math.max(INPAINT_SPREAD_MIN, cur * (1 - INPAINT_SPREAD_LEARN) + median * INPAINT_SPREAD_LEARN));
              if (Math.abs(next - cur) >= 0.005) {
                const map = await readInpaintSpread();
                map[actualKey] = Math.round(next * 100) / 100;
                await saveInpaintSpread(map);
                diagPush('inpaint spread ' + actualKey + ': ' + cur.toFixed(2) + ' -> ' + map[actualKey].toFixed(2) + ' (n=' + ratios.length + ' median ratio ' + median.toFixed(2) + ')');
              }
            }
          } catch {}
        }
        const totalInpaintMs = Math.round(performance.now() - t0i);
        if (patches.length) diagPush('inpaint split path ' + inpaintPath + ' ms prep ' + prepMs + ' load ' + splitLoadMs + ' gpu ' + inpaintMs + ' paste ' + pasteMs + ' call ' + callMs + ' total ' + totalInpaintMs + (splitReadyMs != null ? ' readyMs ' + splitReadyMs : '') + (splitTileMax ? ' tileMax ' + splitTileMax : ''));
        // DIAG (2.1.9): split the call-vs-GPU gap. host = the SW's host
        // check (ping) before the send; doc = the offscreen handler from
        // entry to reply (includes the worker call); worker = the GPU
        // worker's patch loop; load = model load. transit = call - host -
        // doc = the SW<->doc message hops both ways. Doc overhead (handler
        // work outside the worker) is doc - load - worker. GPU path only.
        if (patches.length && inpaintPath === 'gpu' && splitHostMs != null) {
          const transitMs = callMs - (splitHostMs || 0) - (splitDocMs || 0);
          diagPush('inpaint gpu timing host ' + (splitHostMs || 0) + ' doc ' + (splitDocMs || 0) + ' worker ' + inpaintMs + ' load ' + splitLoadMs + ' call ' + callMs + ' transit ' + transitMs);
        }
        parProgress('inpaint', 1);
        await imgEmitDebug('inpaint', {
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
        // Firefox: translation runs on a Web Worker (own thread) and ML runs
        // on the ML worker — the main thread only orchestrates, so it stays
        // free to monitor and restart both. (Mask is synchronous JS on the
        // main thread, but it is bounded and fast, not WASM.)
        // imgTimings.translate is the worker round-trip ONLY: t0t is set at
        // postMessage and translateEnd at the final reply, so mask/inpaint
        // (which run while the worker works) are NOT counted in it.
        let t0t = 0, translateEnd = 0;
        const workerUrl = chrome.runtime.getURL('src/background/translate-worker.js');
        const tWorker = new Worker(workerUrl, { type: 'module' });
        // Track for cancellation: cancelRunsForTab terminates this immediately
        // instead of waiting for the 60s backstop or natural completion.
        runs.get(runId).translateWorker = tWorker;
        // Hoisted so the catch block below can cancel the 60s timer on early
        // mask/inpaint failure — otherwise it fires pointlessly after terminate.
        let translateTimeout = null;
        let translateReject = null;
        const killTranslateWorker = (err) => {
          if (translateTimeout) { clearTimeout(translateTimeout); translateTimeout = null; }
          try { tWorker.terminate(); } catch { /* already terminated */ }
          // If killed externally (cancel), the promise would otherwise hang
          // forever — no onmessage/onerror fires on a terminated worker.
          if (err && translateReject) { const rej = translateReject; translateReject = null; rej(err); }
        };
        // cancelRunsForTab uses this to abort the in-flight worker immediately.
        runs.get(runId).killTranslateWorker = killTranslateWorker;
        const translateP = new Promise((resolve, reject) => {
          translateReject = reject;
          // 60s backstop only: the worker's own 30s abort triggers failover
          // inside translateBlocks, and stall (30s) + rescue (20s) needs up
          // to ~50s — a 30s kill here would murder the rescue.
          translateTimeout = setTimeout(() => {
            translateTimeout = null;
            tWorker.terminate();
            reject(new Error('translate worker timeout'));
          }, 60000);
          tWorker.onmessage = (e) => {
            // Failover notices arrive before the final ok/error — show a pill
            // but don't settle the promise.
            if (e.data && e.data.type === 'failover-notice') {
              chrome.tabs.sendMessage(tabId, {
                type: MSG.PILL_NOTICE,
                text: `Engine ${e.data.failoverFrom} failed — retrying with ${e.data.failoverTo}`,
                sticky: false,
              }).catch(() => {});
              return;
            }
            killTranslateWorker();
            translateEnd = performance.now();
            if (e.data.ok) resolve({ translated: e.data.translated, backendUsed: e.data.backendUsed });
            else reject(new Error(e.data.error));
          };
          tWorker.onerror = (err) => {
            killTranslateWorker();
            translateEnd = performance.now();
            reject(err instanceof Error ? err : new Error(String(err)));
          };
          t0t = performance.now();
          tWorker.postMessage({
            blocks: blocks.map(b => ({ text: b.text })),
            settings: effSettings,
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
          // Pass the error so translateReject fires — otherwise translateP
          // pends forever, leaking the closure chain per failed Firefox run.
          killTranslateWorker(e instanceof Error ? e : new Error(String(e)));
          throw e;
        }
        try { tWorker.terminate(); } catch { /* already terminated by onmessage */ }
        checkCancelled(runId);
        blocks.forEach((b, i) => {
          b.translation = translated.translated[i];
          b.backendUsed = translated.backendUsed;
        });
        translated = translated.translated;
        const translateMs = Math.round(translateEnd - t0t);
        parProgress('translate', 1);
        await imgEmitDebug('translate', {
          // Same as the main path: the actual backend, not the configured one.
          title: `Translation — ${BACKEND_LABEL[blocks[0]?.backendUsed || settings.translationBackend] || settings.translationBackend}`,
          rows: blocks.map(b => ({ text: b.text, translation: b.translation, backend: b.backendUsed || settings.translationBackend })),
          ms: translateMs,
        });
        translateOut = { translateMs };
      } else {
        const maskP = runMask();
        const inpaintP = maskP.then(runInpaint);
        const translateP = runTranslate();
        // If either branch fails, cancel the run so the other branch aborts
        // at its next checkCancelled instead of burning CPU/network on a dead run.
        // Record the first REAL branch failure: without it, the run catch below
        // sees the abort flag and reports quiet 'cancelled', swallowing the
        // actual error (inpaint/timeout failures showed no notification at all).
        // Not recorded for user cancels (their errors must stay quiet) or for
        // cancel-marked errors (those are the abort itself, not a failure).
        const cancelOnFail = p => p.catch(e => {
          const r = runs.get(runId);
          if (r) {
            r.cancelled = true;
            if (!r.userCancelled && !e.cancelled && !r.branchError) r.branchError = e;
          }
          callMl({ type: MSG.ML_CANCEL, runId }).catch(() => {});
          throw e;
        });
        [translateOut, inpaintOut] = await Promise.all([cancelOnFail(translateP), cancelOnFail(inpaintP)]);
      }
      imgTimings.translate = translateOut.translateMs;
      imgTimings.mask = inpaintOut.maskMs;
      imgTimings.inpaint = inpaintOut.totalInpaintMs;
      const { inpainted } = inpaintOut;

      // ---- 8. render: translated text composited onto the image.
      // mode 'replace' swaps the page's original <img>; 'overlay' shows it in the overlay.
      // NOTE: the finished picture travels as a WebP data URL — raw pixel buffers
      // don't survive chrome.tabs messaging from the service worker either.
      checkCancelled(runId);
      imgSetProgress('render', 0.96);
      const finalDataUrl = await rgbaToDataURL(inpainted, w, h, Math.max(w, h));
      // Same tick as the send below: a cancellation can never slip in between
      // and let a stale render reach the tab.
      checkCancelled(runId);
      imgTimings.total = Math.round(performance.now() - imgT0);
      await sendRender(tabId, runId, mode, finalDataUrl, w, h, blocks, imgTimings, settings.debugMode, { srcUrl: manualSrc, uid: img.uid });
      // ---- 9. page cache: remember this translated page for instant revisits.
      // Best-effort — a cache failure must never fail the run. Skipped in
      // incognito; a cancelled run never reaches this point (it throws above).
      try {
        if (!(await isIncognitoTab(tabId))) {
          // Two-tier write: Tier 1 (target-independent) stores the inpainted
          // base + OCR'd blocks (translations stripped). Tier 2 stores the
          // translations for this targetLang/backend.
          const t1Key = await buildCacheKeyTier1(rgba, w, h, settings);
          const blocksNoTrans = blocks.map(b => {
            const { translation, ...rest } = b;
            return rest;
          });
          await pageCachePut(t1Key, {
            imageDataUrl: finalDataUrl, width: w, height: h,
            blocks: blocksNoTrans, mode,
            // Resolved source language ('auto' already detected above) — reused
            // verbatim on Tier-1 hits instead of re-detecting (G10).
            sourceLang: effSettings.sourceLang,
          });
          const t2Key = buildCacheKeyTier2(t1Key, settings);
          await pageCachePut(t2Key, {
            translations: blocks.map(b => b.translation || ''),
            targetLang: settings.targetLang,
            backend: settings.translationBackend,
          });
          // No legacy v1 write: the v1 backfill duplicated the image a third
          // time and counted as a second image in stats (its key shape differs
          // from Tier-1's, so the distinct-image collapse missed it). The v1
          // READ fallback stays, so entries written by older builds still serve.
        }
      } catch (e) {
        console.warn('[ct] page-cache write failed:', String((e && e.message) || e).slice(0, 120));
      }
      // Fresh path done: report this image's backend for the final pill.
      return { ok: true, doneExtra: { backendLabel: BACKEND_SHORT_LABEL[blocks?.[0]?.backendUsed || settings.translationBackend] || settings.translationBackend } };
    }
    for (const [imgIdx, img] of images.entries()) {
      const imgLabel = multi ? ` — image ${imgIdx + 1}/${images.length} (${img.w}×${img.h})` : '';
      const imgBase = imgIdx / images.length, imgSpan = 1 / images.length;
      const imgSetProgress = (stage, frac, extra) => setProgress(runId, stage, imgBase + frac * imgSpan, extra || {});
      const imgEmitDebug = (stage, payload) => emitDebug(runId, tabId, settings, stage, { ...payload, title: (payload.title || stage) + imgLabel });
      const imgTimings = {};
      const imgPxKeys = [];
      const imgT0 = performance.now();
      try {
        const r = await runOneImage(img, imgSetProgress, imgEmitDebug, imgTimings, imgPxKeys, imgT0);
        doneImgs.push(imgIdx + 1);
        if (r && r.doneExtra) lastDoneExtra = r.doneExtra;
      } catch (e) {
        // Cancel and out-of-memory abort the whole run; any other per-image
        // failure is recorded and the next picture runs.
        if (e && (e.cancelled || isCancelled(runId))) throw e;
        if (/Out of memory/i.test(String((e && e.message) || ''))) throw e;
        // 403 auto fallback (auto path only — manual send has its own
        // fallback in the handler, so it must not double-attempt): the
        // image server refused the download, but a background tab reads it
        // same-origin. Try it once for this image; the original 403 error
        // is recorded only if the tab read fails too.
        let recovered = false;
        if (e && e.fallbackUrl && !manualSrc) {
          try {
            const pre = await fallbackCaptureViaTab(tabId, e.fallbackUrl);
            const r2 = await runOneImage(img, imgSetProgress, imgEmitDebug, imgTimings, imgPxKeys, imgT0, pre);
            doneImgs.push(imgIdx + 1);
            if (r2 && r2.doneExtra) lastDoneExtra = r2.doneExtra;
            recovered = true;
          } catch (e2) {
            // Log the tab failure reason to the diag log (not just the
            // console): the original error alone hides WHY the tab read
            // failed (timeout, redirect, server refused the tab too).
            diagPush(`background-tab read failed for image ${imgIdx + 1}: ${String((e2 && e2.message) || e2).slice(0, 160)}`);
            console.warn('[ct] auto fallback capture failed for image ' + (imgIdx + 1) + ':', String((e2 && e2.message) || e2).slice(0, 120));
          }
        }
        if (!recovered) {
          if (e && e.fallbackUrl && !fallbackUrl) fallbackUrl = e.fallbackUrl;
          failedImgs.push(`image ${imgIdx + 1} (${img.w}×${img.h}): ${String((e && e.message) || e).slice(0, 120)}`);
          diagPush(`image ${imgIdx + 1} failed: ${String((e && e.message) || e).slice(0, 200)}`);
        }
      } finally {
        for (const k of imgPxKeys.splice(0)) await pixelDrop(k);
      }
    }
    if (!doneImgs.length) {
      const err = new Error('no picture could be translated (' + failedImgs.join('; ').slice(0, 400) + ')');
      if (fallbackUrl) err.fallbackUrl = fallbackUrl;
      throw err;
    }
    timings.total = Math.round(performance.now() - pipelineT0);
    setProgress(runId, 'done', 1, lastDoneExtra || { backendLabel: settings.translationBackend });
    // Surface the outcome on the PAGE too: runs take minutes and the popup is
    // usually closed by the time the last picture finishes, so without this a
    // partial run (skips, per-image failures, ignored tiny images) is silent.
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'ct/run-summary', runId, images: doneImgs.length,
        failed: failedImgs, ignored,
      });
    } catch { /* content script may have been removed mid-run */ }
    if (settings.debugMode) await sendDiagLog(tabId, runId);
    result = { runId, ok: true, images: doneImgs.length, failed: failedImgs };
  } catch (e) {
    let msg;
    // A user-cancelled run stays 'cancelled' even if the in-flight work
    // later fails (e.g. ML times out after Cancel) — the user asked to
    // stop, so a later error must not surface as a failure. But a BRANCH
    // failure (recorded by cancelOnFail) is not a user cancel: the abort
    // flag it sets must not swallow it. Prefer the recorded failure so
    // inpaint/timeout/translate errors always notify.
    const branchError = runs.get(runId)?.branchError;
    const quietCancel = (runs.get(runId)?.userCancelled || ((e && e.cancelled) || isCancelled(runId))) && !branchError;
    if (quietCancel) {
      setProgress(runId, 'cancelled', 0);
      msg = 'cancelled';
    } else {
      const err = branchError || e;
      msg = String((err && err.message) || err);
      broadcastError(runId, msg, err && err.grantHost ? { host: err.grantHost, label: displayHost(err.grantHost), hosts: err.grantHosts || null } : null);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
        // Show the debug panel on failure too (emitDebug sets debug:true and
        // respects debugMode) — otherwise a capture-stage failure leaves
        // James with only the error text and no stage/tier diagnostics.
        await emitDebug(runId, tabId, settings, 'error', { title: 'Error', error: msg });
      } catch { /* ignore */ }
    }
    // DIAGNOSTIC (temporary): one self-contained summary line, so ANY
    // paste containing it shows the true totals and the outcome.
    diagPush('run ended run ' + runId + ' ok false error ' + msg + ' progressSendFails ' + diagProgressFails + ' lastProgress ' + (currentRun ? currentRun.stage + ' ' + currentRun.progress : 'none'));
    // DIAGNOSTIC (temporary): send AFTER the summary is pushed, so the
    // panel log includes it. Error runs only (not user cancels).
    if (!quietCancel) await sendDiagLog(tabId, runId);
    result = { runId, ok: false, error: msg, cancelled: !!quietCancel,
      ...(e && e.fallbackUrl ? { fallbackUrl: e.fallbackUrl } : {}) };
  } finally {
    runs.delete(runId);
    clearRunRecord(runId); // FIX1: run ended, drop its persisted record.
    // Drop any pixel payloads this run staged but never got taken.
    for (const k of pxKeys) await pixelDrop(k);
    keepAliveStop(runId); // FIX2: release the run-scoped hold last, after all cleanup.
  }
  // Chrome 2.0.13: after a successful run, measure the best WASM thread
  // count once, in the background (ML_BENCH_THREADS). The run does not
  // wait for the bench itself, but the trigger is confirmed: 2.1.15 made
  // it await the reply and retry (up to 3 tries, 3s each) instead of
  // fire-and-forget, because a send to a dead doc was lost silently.
  // 2.0.25: gate the trigger here too. The offscreen doc also skips when
  // it sees a complete save, but in 2.0.24 the bench re-measured after
  // every run, so check in the service worker as well — if a complete
  // full-chain result is already saved for this machine, do not send the
  // trigger at all. Fail open: any error or missing value still sends it.
  if (result && result.ok) {
    try {
      // 2.1.25: log only lines that tell something. The old code logged
      // "run ok, checking saved count" + "already measured N, skipping"
      // after EVERY run — in the steady state (bench done) that is dozens
      // of identical lines and tells nothing. Now: silence when the bench
      // is already measured (the persisted trace already shows "bench done
      // best N"); log only when the bench will actually run, or on error.
      let alreadyMeasured = false;
      try {
        const saved = await chrome.storage.local.get('measuredThreads');
        const m = saved && saved.measuredThreads;
        const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
        if (m && m.method === 'full-chain' && m.hardwareConcurrency === cores && Number.isInteger(m.threads)) {
          alreadyMeasured = true;
        } else {
          benchTracePush('threads bench trigger: no complete save (method=' + (m && m.method) + ' threads=' + (m && m.threads) + '), will send');
        }
      } catch (e) {
        benchTracePush('threads bench trigger: storage read failed: ' + String((e && e.message) || e) + ' — will send anyway');
      }
      if (!alreadyMeasured) {
        // The doc can be discarded once the run ends; a trigger sent to
        // a dead doc is lost (sendMessage rejects: no listener) and the
        // bench never runs — single OCR then keeps the raw core count.
        // The 2.1.14 run proved this: bench status stayed 'none', so the
        // bench never started at all. Confirm delivery: await the reply
        // (the doc's handler replies at once) and retry after re-ensuring
        // the host if it fails. Up to 3 tries, 3s each. The outcome is
        // logged (it contains 'threads bench', so it survives into the
        // next run's panel log) AND saved to storage (2.1.16): the log
        // line is lost if the service worker restarts before the next
        // run, but storage survives, so the persisted trace can
        // show whether the trigger was delivered.
        let delivered = false;
        let attempts = 0;
        let lastError = '';
        for (let attempt = 0; attempt < 3 && !delivered; attempt++) {
          attempts = attempt + 1;
          try {
            await ensureMlHost();
            benchTracePush('threads bench trigger attempt ' + attempts + ': host alive');
          } catch (e) {
            lastError = 'ensureMlHost: ' + String((e && e.message) || e);
            benchTracePush('threads bench trigger attempt ' + attempts + ': ensureMlHost failed: ' + lastError);
          }
          try {
            const reply = await Promise.race([
              chrome.runtime.sendMessage({ type: MSG.ML_BENCH_THREADS }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('bench trigger timeout')), 3000)),
            ]);
            delivered = true;
            benchTracePush('threads bench trigger attempt ' + attempts + ': delivered, reply=' + JSON.stringify(reply || null));
          } catch (e) {
            lastError = String((e && e.message) || e);
            benchTracePush('threads bench trigger attempt ' + attempts + ': send failed: ' + lastError);
          }
        }
        benchTracePush('threads bench trigger ' + (delivered ? 'delivered' : 'FAILED after 3 tries') + (delivered ? '' : ' last error: ' + lastError));
        try { await chrome.storage.local.set({ benchTrigger: { delivered, attempts, at: new Date().toISOString(), lastError } }); } catch {}
      }
    } catch (e) {
      try { benchTracePush('threads bench trigger: outer error: ' + String((e && e.message) || e)); } catch {}
    }
    // 2.1.21 (approach C): keep the doc alive while the bench runs. The
    // doc may be discarded once the run ends, killing a bench in flight.
    // The SW pings the doc every 15s for 2 minutes after a run; the doc
    // logs each ping and does NOT cancel the bench for it. If the bench
    // saves 'done', the pings stop early. Each ping logs its outcome, so
    // one run shows whether the pings reached the doc. Fire-and-forget:
    // the run does not wait for the pings.
    // 2.1.25: check benchStatus BEFORE starting. In the steady state
    // (bench done) the old code logged "pings starting" + "bench done,
    // stopping pings" after every run — noise. Now: silent return when
    // done, no pings, no lines.
    (async function startBenchKeepalivePings() {
      try {
        const saved = await chrome.storage.local.get('benchStatus');
        const st = saved && saved.benchStatus;
        if (st && st.state === 'done') return;
      } catch {}
      let count = 0;
      const maxPings = 8; // 8 x 15s = 2 minutes
      benchTracePush('threads bench keepalive: pings starting (15s x 8)');
      const tick = async () => {
        try {
          const saved = await chrome.storage.local.get('benchStatus');
          const st = saved && saved.benchStatus;
          if (st && st.state === 'done') { benchTracePush('threads bench keepalive: bench done, stopping pings'); return; }
        } catch {}
        if (count >= maxPings) { benchTracePush('threads bench keepalive: 2 min up, stopping pings'); return; }
        count++;
        try {
          await ensureMlHost();
          const reply = await chrome.runtime.sendMessage({ type: MSG.ML_BENCH_KEEPALIVE });
          benchTracePush('threads bench keepalive ping ' + count + ': ok reply=' + JSON.stringify(reply || null));
        } catch (e) {
          benchTracePush('threads bench keepalive ping ' + count + ': failed: ' + String((e && e.message) || e));
        }
        setTimeout(tick, 15000);
      };
      setTimeout(tick, 15000);
    })();
  } else {
    benchTracePush('threads bench trigger: run not ok (ok=' + (result && result.ok) + '), skipping');
  }
  return result;
}

// Tall-image detection: vertical slices (ratio 3.0, overlap 0.2), merge.
async function detectSliced(rgba, w, h, threshold, runId, pxKeys) {
  const sliceH = Math.round(w * 3.0);
  const step = Math.round(sliceH * 0.8);
  const all = [];
  const seams = [];
  for (let y0 = 0; y0 < h; y0 += step) {
    checkCancelled(runId);
    const y1 = Math.min(h, y0 + sliceH);
    const c = cropRGBA(rgba, w, 0, y0, w, y1);
    const pxKey = `detect:${runId}:slice${y0}`;
    pxKeys.push(pxKey);
    await pixelPut(pxKey, c.data.buffer);
    const r = await callMlChecked(runId, {
      type: MSG.ML_DETECT, key: pxKey, width: w, height: c.h, threshold, runId,
      // SW already sliced; detector must not strip again (double seams).
      noStrip: true,
    });
    for (const b of r.boxes) {
      all.push({ ...b, xyxy: [b.xyxy[0], b.xyxy[1] + y0, b.xyxy[2], b.xyxy[3] + y0] });
    }
    if (y1 >= h) break;
    seams.push(y1);
  }
  // Dedup overlap-zone doubles and merge bubbles split across slice seams.
  return dedupAndMergeSeams(all, seams, true);
}

// ---------------------------------------------------------------- auto-translate on page load
// Fires the pipeline automatically when an allowed page finishes loading —
// no button click needed. One run per page load; only for the active tab.
const autoFired = new Map(); // tabId -> {url, at}
chrome.tabs.onRemoved.addListener(tabId => autoFired.delete(tabId));

// First install: always flag the popup to send the user straight to the
// models section of the Settings page (download button highlighted) on
// next open. Update: flag it ONLY when the update changes the model list
// (new/changed file IDs or sizes — e.g. a Baberu swap), i.e. when a new
// download is actually necessary; a code-only update does not lead.
// The fingerprint is stored on install and on every model-changing
// update, so the next update compares against the last installed list.
// No stored fingerprint (updating from before this check existed) counts
// as changed — one lead to set the baseline, then only real changes.
// Consumed by the popup on first open after the install/update; opening
// the popup is what triggers the lead, so it waits if the user never
// opens it.
// Silent first-startup core detection (Chrome 2.0.2, no UI).
// Detects navigator.hardwareConcurrency once and saves it to
// storage.local as detectedCores { cores, detectedAt, source }.
// Saved only when missing or when the live number differs (machine
// changed). Never throws, never blocks install or a run, never shows
// UI. Thread calculation itself stays live in offscreen.js (all
// detected cores on Chrome, 1 on Firefox without SAB — cap removed
// in 2.0.3); this record is the first-startup detection, and the
// debug-panel diag line below is how it is verified (debug on,
// first run).
async function saveDetectedCores(cores, source) {
  try {
    if (!cores || typeof cores !== 'number' || cores < 1) return;
    const got = await chrome.storage.local.get(['detectedCores']);
    const prev = got && got.detectedCores;
    if (prev && prev.cores === cores) return;
    await chrome.storage.local.set({ detectedCores: { cores, detectedAt: new Date().toISOString(), source } });
    diagPush('detected cores ' + cores + ' saved (' + source + ')');
  } catch { /* silent, never fails install or a run */ }
}

chrome.runtime.onInstalled.addListener(details => {
  if (!details || (details.reason !== 'install' && details.reason !== 'update')) return;
  // Run before the early returns below: a code-only update changes no
  // models, so the existing handler returns early for it — core
  // detection must still run on that first startup after the update.
  saveDetectedCores((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null, 'onInstalled');
  chrome.storage.local.get(['settings', 'modelFingerprint']).then(({ settings, modelFingerprint: stored }) => {
    const current = computeModelFingerprint();
    const modelsChanged = stored !== current;
    if (details.reason === 'install') {
      if (settings && settings.firstRun && !modelsChanged) return;
    } else if (!modelsChanged) {
      return;
    }
    const patch = {};
    if (!(settings && settings.firstRun)) patch.settings = { ...(settings || {}), firstRun: true };
    if (modelsChanged) patch.modelFingerprint = current;
    if (Object.keys(patch).length) chrome.storage.local.set(patch).catch(() => {});
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // DIAGNOSTIC (temporary): log every document change for a tab with a
  // run in flight, so the log proves or refutes a mid-run navigation
  // without asking the user.
  try {
    const inFlight = [...runs].some(([, r]) => r.tabId === tabId && !r.cancelled);
    if (inFlight) diagPush('tab updated tab ' + tabId + ' status ' + (changeInfo && changeInfo.status) + ' at ' + new Date().toISOString());
  } catch {}
  if (!changeInfo || changeInfo.status !== 'complete') return;
  (async () => {
    try {
      const settings = await getSettings();
      const host = hostOf(tab.url || '');
      if (!host || (!settings.allowAllSites && !isSiteAllowed(host, settings.siteWhitelist || []))) return;
      // Inject the content script on page load for allowed sites, even
      // when auto-translate is off: it carries the anti-right-click
      // override, so it must be on the page BEFORE the user right-clicks
      // a picture. Best-effort (a chrome:// tab or a revoked permission
      // throws) — a later runPipeline injection is a no-op thanks to the
      // script's double-injection guard, and a failed inject here never
      // blocks auto-translate.
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
      } catch {}
      if (!settings.autoTranslateOnLoad) return;
      if (!tab || !tab.active) return; // translate what you're looking at
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
      // Record the fire SYNCHRONOUSLY here, before the await below: two
      // 'complete' events (page + a slow iframe) can land in the same tick,
      // and if both pass the dedupe above before either records, both start
      // a run — they then fight over the page, one dies 'stale run', and
      // only a couple of pictures get translated. The check and the record
      // are one synchronous block, so the second event sees it and returns.
      autoFired.set(tabId, { url, at: now });
      await cancelRunsForTab(tabId);
      const r = await runPipeline(tabId, { auto: true });
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
    // with no download at all. Capture the pixels in a background tab, then
    // run the normal pipeline on the original tab — the translated picture
    // replaces the original in place.
    if (!r.ok && r.fallbackUrl) {
      try {
        const preCaptured = await fallbackCaptureViaTab(tabId, r.fallbackUrl);
        await runPipeline(tabId, { srcUrl, preCaptured });
      } catch (e) {
        // Fallback failed — the 403 error pill from the first attempt is
        // already showing; leave it.
        console.warn('[ct] fallback capture failed:', String((e && e.message) || e).slice(0, 160));
      }
    }
  } catch (e) {
    console.warn('[ct] manual image send failed:', String((e && e.message) || e).slice(0, 160));
  }
}

// 403 fallback for "Send to comic-translate-4-free": open the image URL in a
// background tab, read its pixels via the canvas tier (same-origin there —
// no download, no bot-protection fight), close the tab, and hand the pixels
// back so the normal pipeline runs on the original tab.
//
// Hosts whose pictures fail the background-tab read with "Missing host
// permission for the tab" are recorded here: the popup offers a one-click
// grant for them. The content-script host list alone can miss them (an old
// content script in the tab, or a host that only appears on a later
// picture), and a multi-pic run that partly succeeds never sets
// lastStatus.grantHost, so without this the popup never offers the grant
// and those pictures keep failing.
const MISSING_HOSTS_KEY = 'ct-missing-hosts';
async function recordMissingHost(imageUrl) {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    if (!host) return;
    const got = await chrome.storage.local.get(MISSING_HOSTS_KEY);
    const list = Array.isArray(got[MISSING_HOSTS_KEY]) ? got[MISSING_HOSTS_KEY] : [];
    if (!list.includes(host)) {
      list.push(host);
      // Cap the list: it is a hint for the popup, not a log.
      await chrome.storage.local.set({ [MISSING_HOSTS_KEY]: list.slice(-10) });
    }
  } catch { /* recording must never break the run */ }
}

// Permission gate (James, 2026-11-12): check permission for EVERY picture's
// host BEFORE the run starts — you do not get a second chance. A picture
// whose host has no permission fails the background-tab read and is lost
// for that run, so the run must not start until every host is permitted.
// The hosts come from the inventory's real picture URLs (src), not a guess.
// Same rule as the popup's hasOriginAccess: an exact-host grant OR a
// base-domain grant counts. Fail open: if the hosts cannot be learned or
// the check itself errors, the run proceeds — the per-image fallback still
// records failures for the popup grant.
async function checkImageHostPermissions(images) {
  const hosts = [];
  for (const im of images || []) {
    try {
      const src = im && im.src;
      if (!src || !/^https?:\/\//i.test(src)) continue;
      const h = new URL(src).hostname.toLowerCase();
      if (h && !hosts.includes(h)) hosts.push(h);
    } catch { /* unparsable src — skip it, the run fails open on it */ }
  }
  const missing = [];
  for (const h of hosts) {
    let has = false;
    try {
      for (const p of originAccessPatterns(h)) {
        if (await chrome.permissions.contains({ origins: [p] }).catch(() => false)) { has = true; break; }
      }
    } catch { has = true; /* check errored — fail open, do not block the run */ }
    if (!has) missing.push(h);
  }
  return missing;
}
async function fallbackCaptureViaTab(origTabId, imageUrl) {
  const notice = (text, sticky) =>
    chrome.tabs.sendMessage(origTabId, { type: MSG.PILL_NOTICE, text, sticky }).catch(() => {});
  await notice('Direct download blocked — reading the image in a background tab…', true);
  let newTabId = null;
  try {
    const newTab = await chrome.tabs.create({ url: imageUrl, active: false });
    if (!newTab || newTab.id == null) throw new Error('could not open background tab');
    newTabId = newTab.id;
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
    await chrome.scripting.executeScript({ target: { tabId: newTabId }, files: CONTENT_SCRIPT_FILES });
    const p = await chrome.tabs.sendMessage(newTabId, { type: 'ct/get-image-pixels', srcUrl: imageUrl });
    if (!p || !p.ok || typeof p.dataUrl !== 'string') {
      throw new Error((p && p.error) || 'could not read the image');
    }
    return await dataUrlToRGBA(p.dataUrl);
  } catch (e) {
    // The tab inject failed because this picture's host has no permission —
    // record it so the popup can offer the grant for it.
    if (/Missing host permission for the tab/i.test(String((e && e.message) || e))) {
      await recordMissingHost(imageUrl);
    }
    throw e;
  } finally {
    if (newTabId != null) await chrome.tabs.remove(newTabId).catch(() => {});
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
  // Inpaint progress from the Chrome offscreen document (one-way, no reply).
  // Routes into the run's progress bar, so the pill keeps moving during long
  // inpaints instead of looking stalled. Each message is also a worker event,
  // which resets the idle timer — healthy long inpaints keep the worker alive.
  if (msg && msg.type === MSG.ML_INPAINT_PROGRESS) {
    try {
      const r = runs.get(msg.runId);
      if (r && typeof r.onInpaintProgress === 'function') r.onInpaintProgress(msg.frac);
    } catch { /* progress must never break the pipeline */ }
    // GPU1-Chrome: the same progress re-arms the SW-side GPU watchdog
    // in ml-bridge.js (progress resets the 60s inactivity window).
    try { notifyChromeGpuProgress(msg.runId, msg.frac); } catch {}
    return false;
  }
  if (msg && msg.type === MSG.ML_BENCH_RESULT) {
    // 2.1.20: persist every bench line to the trace (diagPush alone is
    // lost on a worker restart).
    try { if (typeof msg.line === 'string' && msg.line) benchTracePush(msg.line); } catch { try { if (typeof msg.line === 'string' && msg.line) diagPush(msg.line); } catch {} }
    try { if (typeof msg.line === 'string' && msg.line) chrome.storage.local.set({ benchLastLog: { line: msg.line, at: new Date().toISOString() } }); } catch {}
    return false;
  }
  if (msg && msg.type === MSG.ML_BENCH_GET) {
    // 2.1.22: the doc asks the SW for the saved bench values, because
    // the doc's own storage reads fail like its writes. The SW's reads
    // work. Reply with both records (null when nothing is saved).
    (async () => {
      try {
        const saved = await chrome.storage.local.get(['measuredThreads', 'benchStatus']);
        sendResponse({ ok: true, measuredThreads: (saved && saved.measuredThreads) || null, benchStatus: (saved && saved.benchStatus) || null });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
  if (msg && msg.type === MSG.ML_BENCH_SAVE) {
    // 2.1.19: the offscreen doc saves bench records through the SW
    // because the doc's own storage writes may be failing (the bench
    // never saves a status, yet the SW's trigger record is saved). The
    // SW writes the same key the doc would have written, so the bench's
    // result and the SW's reads see the same storage.
    // 2.1.20: log the save so the trace proves it arrived and was stored.
    try {
      if (msg.key === 'benchStatus' && msg.value && typeof msg.value === 'object') {
        benchTracePush('threads bench save received benchStatus=' + (msg.value.state || '?') + (msg.value.best != null ? ' best ' + msg.value.best : ''));
        chrome.storage.local.set({ benchStatus: msg.value });
        benchTracePush('threads bench save stored benchStatus=' + (msg.value.state || '?'));
      } else if (msg.key === 'measuredThreads' && msg.value && typeof msg.value === 'object') {
        benchTracePush('threads bench save received measuredThreads=' + (msg.value.threads != null ? msg.value.threads : '?'));
        chrome.storage.local.set({ measuredThreads: msg.value });
        chrome.storage.sync.set({ measuredThreads: msg.value });
        benchTracePush('threads bench save stored measuredThreads=' + (msg.value.threads != null ? msg.value.threads : '?'));
      } else {
        benchTracePush('threads bench save received bad key=' + String(msg.key));
      }
    } catch (e) {
      try { benchTracePush('threads bench save error: ' + String((e && e.message) || e)); } catch {}
    }
    return false;
  }
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
          // Awaited (not fire-and-forget) so the popup can report the result.
          // NOTE: awaiting does NOT keep the worker alive — Chrome may kill
          // it idle (~30s) or at the 5-minute per-event cap mid-run. The ML
          // alarm backup (ml-bridge.js) and inpaint progress keep-alive cover
          // that; without them a killed worker meant a frozen pill, no error.
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
          for (const [id, r] of runs) abortRunResources(id, r);
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

// FIX1: orphan + alarm recovery. Runs once when this background page /
// service worker loads. If a previous background died mid-run, its
// persisted record is still in storage (the in-memory runs map died with
// it). Failing it cleanly here unfreezes the pill and shows the panel
// log, instead of leaving the pill frozen at the last progress.
// 1.4.0 (m4): Chrome service workers now run this too, with a guard:
// orphans with a pending ct-ml alarm entry are skipped (the alarm backup
// will fail those, single error), while orphans with NO ct-ml entry
// (GPU runs, which bypass callMl and create no alarm entries, and
// runs past ML) are failed here — previously they were lost with a
// stuck pill and no error. Firefox behaviour is unchanged (all orphans
// failed here); m1 idempotence prevents the alarm double-fail there.
// 1.4.0 (m1): runIds already failed by recovery in this background.
// Same-background guard for orphan-then-alarm duplicates; the storage
// check inside failOrphanedRun covers cross-restart duplicates.
const recoveredOrphanRuns = new Set();
// Returns true only if this call actually sent the error. Callers send
// their error diag + panel log ONLY when this returns true, so one
// background death produces one error, not orphan + alarm.
async function failOrphanedRun(orphanRunId, rec, msg) {
  if (recoveredOrphanRuns.has(orphanRunId)) return false;
  recoveredOrphanRuns.add(orphanRunId);
  while (recoveredOrphanRuns.size > 64) recoveredOrphanRuns.delete(recoveredOrphanRuns.values().next().value);
  // FIX2: a recovered orphan's repeating keepalive alarm must not fire
  // forever — clear it here (finally never ran for this run). Best-effort,
  // and idempotent, so it is safe to clear even on the skip path below
  // (a previous recovery may have died after clearing the record but
  // before clearing the alarm).
  try {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      const p = chrome.alarms.clear('ct-keepalive:' + orphanRunId);
      if (p && p.catch) p.catch(() => {});
    }
  } catch {}
  // Storage check: if no record remains, an earlier recovery already
  // handled this run (or it ended normally) — do not send a second
  // error. A storage read failure falls through to failing the run:
  // a duplicate error is a wart, a frozen pill with no error is worse.
  try {
    const all = (await chrome.storage.local.get(ACTIVE_RUNS_KEY))[ACTIVE_RUNS_KEY] || {};
    if (!all[orphanRunId]) return false;
  } catch {}
  // Remove first: never fail the same orphan twice (e.g., if this
  // background restarts again mid-recovery).
  await clearRunRecord(orphanRunId);
  // 1.4.0 (m5): drop this dead run's staged pixel payloads (the
  // pipeline finally never ran for it). Best-effort; never blocks error.
  try { await pixelPruneRun(orphanRunId); } catch {}
  if (rec.tabId == null) return false;
  const tab = await chrome.tabs.get(rec.tabId).catch(() => null);
  if (!tab) return false;
  try { await chrome.scripting.executeScript({ target: { tabId: rec.tabId }, files: CONTENT_SCRIPT_FILES }); } catch {}
  // RUN_STARTED first: it sets the tab's current run to this runId, so the
  // error + panel log below are not rejected as stale.
  try { await chrome.tabs.sendMessage(rec.tabId, { type: MSG.RUN_STARTED, runId: orphanRunId }); } catch {}
  try { await chrome.tabs.sendMessage(rec.tabId, { type: MSG.RUN_PROGRESS, runId: orphanRunId, stage: 'error', error: msg, direct: true }); } catch {}
  return true;
}
async function recoverOrphanedRuns() {
  try {
    const all = (await chrome.storage.local.get(ACTIVE_RUNS_KEY))[ACTIVE_RUNS_KEY] || {};
    for (const orphanRunId of Object.keys(all)) {
      const rec = all[orphanRunId];
      try {
        // 1.4.0 (m4, Chrome service workers only): skip orphans with a
        // pending ct-ml alarm entry — the alarm backup will fail those
        // (single error). On a storage-list failure, also skip (leave
        // the record for the next load) rather than risk a double-fail.
        // Firefox skips this check entirely (all orphans failed here).
        if (!(typeof window !== 'undefined' && window.document)) {
          let hasMlAlarm = false;
          let checkFailed = false;
          try {
            const store = await chrome.storage.local.get(null);
            hasMlAlarm = Object.keys(store || {}).some(k => k.startsWith('ct-ml-pending:') && k.includes(':' + orphanRunId + ':'));
          } catch { checkFailed = true; }
          if (checkFailed) {
            diagPush('orphan skipped run ' + orphanRunId + ': ML alarm check failed, leaving record for next load');
            continue;
          }
          if (hasMlAlarm) {
            diagPush('orphan skipped run ' + orphanRunId + ': pending ML alarm will handle it');
            continue;
          }
        }
        clearDiagLog(); // 1.4.0 (m6): each recovery's log is its own.
        const msg = 'Translation stopped because the background restarted while it was at stage ' + (rec.stage || 'unknown') + ' — please run translate again. (The detailed log from before the restart was in memory only and is lost.)';
        diagPush('orphan recovery run ' + orphanRunId + ' tab ' + rec.tabId + ' died at stage ' + (rec.stage || 'unknown') + ' started ' + (rec.startedAt ? new Date(rec.startedAt).toISOString() : 'unknown') + ' lastStageUpdate ' + (rec.updatedAt ? new Date(rec.updatedAt).toISOString() : 'unknown'));
        const sent = await failOrphanedRun(orphanRunId, rec, msg);
        if (sent) {
          diagPush('orphan error: ' + msg);
          if (rec.tabId != null) await sendDiagLog(rec.tabId, orphanRunId);
        }
        diagPush('orphan recovery done run ' + orphanRunId);
      } catch {}
    }
  } catch {}
}
// Alarm recovery hook (ml-bridge onAlarm): the alarm fired because the
// background died mid-ML-call. Fail that run the same clean way.
setMlAlarmRecoveryHook(async (entry, msg) => {
  try {
    clearDiagLog(); // 1.4.0 (m6): alarm recovery log is its own.
    diagPush('alarm recovery run ' + entry.runId + ' type ' + entry.type + ' tab ' + entry.tabId);
    const sent = await failOrphanedRun(entry.runId, { tabId: entry.tabId }, msg);
    if (sent) {
      diagPush('alarm recovery error: ' + msg);
      if (entry.tabId != null) await sendDiagLog(entry.tabId, entry.runId);
    }
  } catch {}
});
// 1.4.0 (m4): runs on both browsers now (see the FIX1 comment above).
// Fire-and-forget: never block background startup, never throw.
recoverOrphanedRuns().catch(() => {});
