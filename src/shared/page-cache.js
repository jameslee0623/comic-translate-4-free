// Translated-page image cache: session-scoped, IndexedDB-backed.
//
// A cache entry IS the render payload the service worker sends to the page —
// the inpainted base image (WebP data URL) + the translated text blocks. On a
// hit the entry is re-sent as ct/render, and the content script re-composites
// the text with the CURRENT font settings (it reads them from storage on every
// render). So a font-size tweak re-renders from cache instead of invalidating
// it, and the hit path reuses the exact same message + render code as the live
// pipeline — no second display path.
//
// Session scoping: the store is wiped on every browser startup. That's
// detected with a chrome.storage.session marker — session storage is cleared
// on shutdown, and extensions can't reliably run code at close, so a missing
// marker means this is a fresh launch. (Verified: storage.session has
// identical semantics on Firefox 115+.)
//
// Privacy: translated pages persist on disk for the session. The cache is
// skipped entirely in incognito tabs (no reads, no writes); the service worker
// also skips it there.

import { openDb, PAGE_CACHE_STORE } from './contracts.js';
import { MODEL_GROUPS } from './model-specs.js';

const PAGE_CACHE_MAX_ENTRIES = 200;
const PAGE_CACHE_MAX_BYTES = 512 * 1024 * 1024; // 512 MB
const SESSION_MARKER = 'ct-page-cache-session';

// ---- startup wipe -----------------------------------------------------------
// Runs once per SW/background-page lifetime, on first import. get/put/stats
// all await it, so a lookup can never serve a previous session's entry while
// the wipe is still in flight.
let readyPromise = null;
export function initPageCache() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const got = await chrome.storage.session.get(SESSION_MARKER);
        if (!got || !got[SESSION_MARKER]) {
          await clearStore();
          await chrome.storage.session.set({ [SESSION_MARKER]: 1 });
        }
      } catch (e) {
        console.warn('[ct] page-cache startup check failed:',
          String((e && e.message) || e).slice(0, 120));
      }
      // Prune dead entries (best-effort hygiene, never fails init): the
      // old v2t1 keys carried the build stamp, so they can never be served
      // again (the lookup now uses v2t2) — but they were still counted in
      // stats and held space. Also drops Tier-2 entries whose Tier-1 base
      // is gone (the lookup is Tier-1-first, so they can never render).
      // Legacy (non-v2t2) keys are left alone: the v1 fallback still
      // serves them.
      try {
        const d = await db();
        const metas = await scanMeta(d);
        const ids = new Set(metas.map(m => m.id));
        const dead = [];
        for (const m of metas) {
          const id = String(m.id);
          // Old v2t1 format (with the build stamp): dead.
          if (id.startsWith('v2t1~')) { dead.push(m.id); continue; }
          if (!id.startsWith('v2t2~')) continue;
          const seg = id.split('~');
          const t2 = seg.indexOf('t2');
          // Tier-1 is the first 6 segments (v2t2~hash~WxH~src~thr~models).
          if (t2 >= 0 && !ids.has(seg.slice(0, 6).join('~'))) dead.push(m.id);
        }
        if (dead.length) {
          await new Promise((resolve, reject) => {
            const t = d.transaction(PAGE_CACHE_STORE, 'readwrite');
            const st = t.objectStore(PAGE_CACHE_STORE);
            for (const id of dead) st.delete(id);
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
          });
        }
      } catch { /* prune is hygiene, not correctness */ }
    })();
  }
  return readyPromise;
}

// ---- cache key --------------------------------------------------------------
// Key = image content hash + everything that can change the output.
// Font size is fixed now (no font-size settings since 1.2.6), so it cannot
// change the output and needs no key component.
//
// The key deliberately does NOT include the extension version (BUILD).
// It used to: every update then wiped the whole cache and every page
// re-translated on refresh. The version does not change the output — the
// models component below already invalidates when a model changes, and the
// schema prefix (v2t2) is bumped only when the translation pipeline itself
// changes what it outputs. So the cache now survives version updates.
// Bump the v2t2 prefix (and the v1 prefix below) when the pipeline output
// changes in a way the models component cannot capture.
function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic content sample of the captured pixels: stride-sampled RGB
// triples (~16k samples regardless of image size). No canvas needed, so this
// works in the service worker, the offscreen document, and workers.
function samplePixels(rgba, w, h) {
  const data = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  const stride = Math.max(1, Math.floor((w * h) / 16384));
  const out = new Uint8Array(Math.ceil(data.length / (stride * 4)) * 3);
  let j = 0;
  for (let i = 0; i < data.length; i += stride * 4) {
    out[j++] = data[i]; out[j++] = data[i + 1]; out[j++] = data[i + 2];
  }
  return out.subarray(0, j);
}

export async function buildCacheKey(rgba, w, h, settings) {
  const digest = await crypto.subtle.digest('SHA-256', samplePixels(rgba, w, h));
  const models = MODEL_GROUPS
    .map(g => g.id + ':' + g.files.map(f => f.file + '@' + f.bytes).join(','))
    .join('|');
  return [
    'v1',
    hex(digest),
    `${w}x${h}`,
    settings.sourceLang, settings.targetLang, settings.translationBackend,
    String(settings.detectionThreshold),
    models,
  ].join('~');
}

// Two-tier cache (P2): Tier 1 is target-independent (inpainted base + OCR'd
// blocks). Tier 2 adds the target language + backend. A Tier-1 hit with a
// new targetLang translates only — skipping detect/OCR/inpaint (minutes).
export async function buildCacheKeyTier1(rgba, w, h, settings) {
  const digest = await crypto.subtle.digest('SHA-256', samplePixels(rgba, w, h));
  const models = MODEL_GROUPS
    .map(g => g.id + ':' + g.files.map(f => f.file + '@' + f.bytes).join(','))
    .join('|');
  return [
    'v2t2',
    hex(digest),
    `${w}x${h}`,
    settings.sourceLang,
    String(settings.detectionThreshold),
    models,
  ].join('~');
}

export function buildCacheKeyTier2(tier1Key, settings) {
  // lmStudioModelId matters: swapping LM Studio models must not serve stale
  // translations from the other model. Only relevant for lmstudio backend,
  // but harmless to always include (empty string otherwise).
  return [
    tier1Key,
    't2',
    settings.targetLang, settings.translationBackend,
    settings.lmStudioModelId || '',
  ].join('~');
}

// ---- store ------------------------------------------------------------------
let dbPromise = null;
function db() {
  // Reset on reject: a failed openDb (e.g. onblocked during a version upgrade)
  // must not poison every later call until the extension reloads.
  if (!dbPromise) dbPromise = openDb().catch(e => { dbPromise = null; throw e; });
  return dbPromise;
}

function scanMeta(d) {
  // [{id, bytes, createdAt}] — via cursor so the big payloads stay on disk.
  return new Promise((resolve, reject) => {
    const out = [];
    const rq = d.transaction(PAGE_CACHE_STORE, 'readonly')
      .objectStore(PAGE_CACHE_STORE).openCursor();
    rq.onsuccess = () => {
      const c = rq.result;
      if (c) {
        out.push({ id: c.key, bytes: c.value.bytes || 0, createdAt: c.value.createdAt || 0 });
        c.continue();
      } else resolve(out);
    };
    rq.onerror = () => reject(rq.error);
  });
}

export async function pageCacheGet(key) {
  await initPageCache();
  const d = await db();
  return new Promise((resolve, reject) => {
    const rq = d.transaction(PAGE_CACHE_STORE, 'readonly')
      .objectStore(PAGE_CACHE_STORE).get(key);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  });
}

// entry: Tier-1 {imageDataUrl, width, height, blocks, mode} or
// Tier-2 {translations, targetLang, backend} — shape-agnostic.
// LRU eviction (~200 entries / 512 MB) runs inside the same transaction.
export async function pageCachePut(key, entry) {
  await initPageCache();
  const d = await db();
  // IDB stores strings as UTF-16; ×2 is the honest estimate for stats.
  // Shape-agnostic: works for Tier-1 (image+blocks) and Tier-2 (translations).
  const bytes = JSON.stringify(entry).length * 2;
  const now = Date.now();
  const metas = await scanMeta(d);
  const existing = metas.find(m => m.id === key);
  let total = metas.reduce((a, m) => a + (m.bytes || 0), 0) - (existing ? existing.bytes || 0 : 0);
  let count = metas.length - (existing ? 1 : 0);
  metas.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); // oldest first
  const evict = [];
  for (const m of metas) {
    if (m.id === key) continue;
    if (count < PAGE_CACHE_MAX_ENTRIES && total + bytes <= PAGE_CACHE_MAX_BYTES) break;
    evict.push(m.id);
    total -= m.bytes || 0;
    count--;
  }
  return new Promise((resolve, reject) => {
    const t = d.transaction(PAGE_CACHE_STORE, 'readwrite');
    const st = t.objectStore(PAGE_CACHE_STORE);
    for (const id of evict) st.delete(id);
    st.put({ ...entry, id: key, bytes, createdAt: now });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new DOMException('page-cache write aborted (storage full?)', 'AbortError'));
  });
}

function clearStore() {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(PAGE_CACHE_STORE, 'readwrite');
    t.objectStore(PAGE_CACHE_STORE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new DOMException('page-cache clear aborted', 'AbortError'));
  }));
}

export async function clearPageCache() {
  await initPageCache();
  return clearStore();
}

// Distinct-image key for stats: collapse each Tier-2 entry into its Tier-1
// image. Key shapes: Tier-1 = v2t2~hash~WxH~src~thr~models,
// Tier-2 = Tier-1 + ~t2~target~backend~model.
export function baseImageKey(id) {
  const seg = String(id).split('~');
  // Legacy v1 keys (v1~hash~WxH~src~target~backend~thr~models) map onto
  // the Tier-1 base (v2t2~hash~WxH~src~thr~models): without this, the v1
  // backfill written by older builds counts as a second image for the same
  // picture. Only the current 8-segment layout is normalized; anything else
  // falls through to the generic path below.
  if (seg[0] === 'v1' && seg.length >= 8) {
    return ['v2t2', seg[1], seg[2], seg[3], seg[6], seg[7]].join('~');
  }
  const t2 = seg.indexOf('t2');
  const end = t2 >= 0 ? t2 : seg.length;
  return seg.slice(0, Math.max(end, 1)).join('~');
}

export async function pageCacheStats() {
  await initPageCache();
  const metas = await scanMeta(await db());
  const distinct = new Set(metas.map(m => baseImageKey(m.id)));
  return {
    count: distinct.size,
    entries: metas.length,
    bytes: metas.reduce((a, m) => a + (m.bytes || 0), 0),
  };
}
