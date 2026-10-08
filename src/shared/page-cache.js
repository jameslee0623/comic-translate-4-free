// Translated-page image cache: session-scoped, IndexedDB-backed.
//
// A cache entry IS the render payload the service worker sends to the page —
// the inpainted base image (PNG data URL) + the translated text blocks. On a
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
import { BUILD } from './version.js';
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
    })();
  }
  return readyPromise;
}

// ---- cache key --------------------------------------------------------------
// Key = image content hash + everything that can change the output.
// Deliberately NOT in the key: font-size settings (initFontSize/minFontSize)
// — those are applied at render time by the content script, so changing them
// re-renders from cache instead of missing.
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
    settings.sourceLang, settings.targetLang, settings.translationBackend,
    String(settings.detectionThreshold),
    settings.lmStudioModelId || '', settings.localLlmModel || '',
    models,
    BUILD,
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

// entry: {imageDataUrl, width, height, blocks, mode} — the ct/render payload.
// LRU eviction (~200 entries / 512 MB) runs inside the same transaction.
export async function pageCachePut(key, entry) {
  await initPageCache();
  const d = await db();
  // IDB stores strings as UTF-16; the data URL is ASCII but the blocks JSON
  // may not be — ×2 is the honest estimate for the stats readout.
  const bytes = entry.imageDataUrl.length * 2 + JSON.stringify(entry.blocks).length * 2;
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
    st.put({
      id: key,
      imageDataUrl: entry.imageDataUrl,
      width: entry.width, height: entry.height,
      blocks: entry.blocks, mode: entry.mode,
      bytes, createdAt: now,
    });
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

export async function pageCacheStats() {
  await initPageCache();
  const metas = await scanMeta(await db());
  return {
    count: metas.length,
    bytes: metas.reduce((a, m) => a + (m.bytes || 0), 0),
  };
}
