// Pixel bus: binary pixel payloads travel between the service worker and the
// offscreen document via IndexedDB, NOT chrome.runtime messaging.
//
// Why: chrome.runtime.sendMessage silently drops ArrayBuffers sent from an
// extension service worker — the receiver gets an empty object ({}) instead
// of the pixels. Verified empirically: a 6.4MB ArrayBuffer sent SW->offscreen
// arrived as {bytes:0, mean:0}. IndexedDB structured-clones binary data
// reliably, so payloads go through IDB and only the lookup key travels in
// the message. Keys are namespaced 'px:' and deleted on read (take).
import { openDb, idbGet, idbPut, idbDel } from './contracts.js';

let dbPromise = null;
function db() {
  // Reset on reject: a failed openDb (e.g. onblocked during a version upgrade)
  // must not poison every later call until the extension reloads.
  if (!dbPromise) dbPromise = openDb().catch(e => { dbPromise = null; throw e; });
  return dbPromise;
}

const prefix = key => 'px:' + key;

/** Store an ArrayBuffer (or view) under key for the other side to take. */
export async function pixelPut(key, buffer) {
  const d = await db();
  let ab;
  if (buffer instanceof ArrayBuffer) {
    ab = buffer;
  } else if (ArrayBuffer.isView(buffer)) {
    // Slice views so a byteOffset/larger backing store can't leak through.
    ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } else {
    throw new Error('pixelPut expects an ArrayBuffer or typed-array view');
  }
  await idbPut(d, { id: prefix(key), data: ab });
}

/**
 * Read + delete the payload for key. Throws if missing — a missing payload
 * means the handoff broke, and failing loud beats feeding zeros downstream.
 */
export async function pixelTake(key) {
  const d = await db();
  const rec = await idbGet(d, prefix(key));
  if (!rec) throw new Error(`pixel payload "${key}" not found in transfer store`);
  try { await idbDel(d, prefix(key)); } catch { /* best effort */ }
  return rec.data;
}

/** Best-effort delete (cleanup after a failed/cancelled run). */
export async function pixelDrop(key) {
  try { await idbDel(await db(), prefix(key)); } catch { /* best effort */ }
}
