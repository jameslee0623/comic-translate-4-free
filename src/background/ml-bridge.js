// ML host bridge: how the pipeline reaches the ONNX sessions.
// - Chrome: an offscreen document hosts the sessions; calls go over
//   chrome.runtime messaging (pixel bytes travel via the IDB pixel bus).
// - Firefox: no offscreen API — the background page itself is the ML host,
//   so calls run in-process through the handlers registered by
//   background-ff.js (globalThis.__ctMlHandlers).
import { MSG } from '../shared/contracts.js';

export function directHandlers() {
  return (typeof globalThis !== 'undefined' && globalThis.__ctMlHandlers) || null;
}

export async function mlHostAlive() {
  const direct = directHandlers();
  if (direct) {
    try {
      const r = await direct[MSG.ML_PING]({});
      return !!(r && r.ok);
    } catch { return false; }
  }
  try {
    const r = await chrome.runtime.sendMessage({ type: MSG.ML_PING });
    return !!(r && r.ok);
  } catch { return false; }
}

export async function ensureMlHost() {
  if (await mlHostAlive()) return;
  if (directHandlers()) return; // Firefox: the host is this page; handlers are ready.
  if (typeof chrome.offscreen === 'undefined') {
    throw new Error('this browser does not support offscreen documents — ML cannot run');
  }
  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Host ONNX Runtime Web (WASM) sessions for manga translation models',
  });
  if (!await mlHostAlive()) throw new Error('ML host failed to start');
}

// Call one ML_* handler. Mirrors the old callOffscreen contract: resolves
// with the handler's payload, throws a human message on failure.
export async function callMl(msg) {
  const direct = directHandlers();
  if (direct) {
    const fn = direct[msg.type];
    if (!fn) throw new Error('ML host has no handler for ' + msg.type);
    let res;
    try {
      res = await fn(msg);
    } catch (e) {
      throw new Error('ML host error: ' + String((e && e.message) || e).slice(0, 160));
    }
    if (!res) throw new Error('ML host did not respond');
    if (res.ok === false) throw new Error(res.error || 'ML host error');
    return res;
  }
  await ensureMlHost();
  let res;
  try {
    res = await chrome.runtime.sendMessage(msg);
  } catch (e) {
    throw new Error('ML host unreachable: ' + String(e).slice(0, 120));
  }
  if (!res) throw new Error('ML host did not respond');
  if (res.ok === false) throw new Error(res.error || 'ML host error');
  return res;
}

// Canvas that works in a service worker (OffscreenCanvas) and in a
// background page (regular <canvas> — e.g. Firefox).
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function canvasToBlob(canvas, type = 'image/png') {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type });
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), type);
  });
}
