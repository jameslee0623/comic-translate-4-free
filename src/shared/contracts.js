// Message + data contracts between the extension's four contexts.
// Image pixels travel as ArrayBuffer (RGBA Uint8ClampedArray backing store).
// Masks travel as ArrayBuffer (Uint8Array, values 0/1 unless noted).

export const MSG = {
  // popup -> SW
  TRANSLATE_PAGE: 'ct/translate-page',   // {} -> {ok, runId} | {ok:false, error}
  CANCEL_RUN: 'ct/cancel-run',           // {} -> {ok}
  GET_STATUS: 'ct/get-status',           // {} -> {state, progress, runId, stage}
  GET_MODELS: 'ct/get-models',           // {} -> {models:[{id,label,sizeMb,downloaded,bytes}]}
  DOWNLOAD_MODEL: 'ct/download-model',   // {id} -> {ok} (progress via MODEL_PROGRESS)
  DELETE_MODEL: 'ct/delete-model',       // {id} -> {ok}
  CHECK_AZURE: 'ct/check-azure',         // {} -> {ok, detail} | {ok:false, error}
  CHECK_LMSTUDIO: 'ct/check-lmstudio',   // {} -> {ok, detail} | {ok:false, error}
  // SW -> popup (broadcast)
  MODEL_PROGRESS: 'ct/model-progress',   // {id, loaded, total}
  RUN_PROGRESS: 'ct/run-progress',       // {runId, stage, progress}
  // SW -> offscreen
  ML_PING: 'ml/ping',                    // {} -> {ok, loaded:{detector,ocr,inpaint}}
  ML_ENSURE: 'ml/ensure',                // {model:'detector'|'ocr'|'inpaint'} -> {ok} | {ok:false,error}
  ML_DETECT: 'ml/detect',                // {image:ArrayBuffer,width,height,threshold} -> {ok, boxes:[{xyxy,label,score}], ms}
  ML_OCR: 'ml/ocr',                      // {crops:[{id,rgba:ArrayBuffer,width,height}]} -> {ok, results:[{id,text}], ms}
  ML_INPAINT: 'ml/inpaint',              // {patches:[{id,rgba:ArrayBuffer,width,height,mask:ArrayBuffer}]} -> {ok, results:[{id,rgba:ArrayBuffer,width,height}], ms}
  ML_DOWNLOAD: 'ml/download',            // {fileId} -> {ok, bytes} (progress via MODEL_PROGRESS)
  ML_RESET: 'ml/reset',                  // {group} -> {ok} (drop loaded sessions)
  ML_CANCEL: 'ml/cancel',                // {runId} -> {ok} (abort in-flight ML work for a run)
  // SW -> content (tabs.sendMessage)
  RUN_STARTED: 'ct/run-started',         // {runId} (marks the tab's current run; stale renders are ignored)
  RENDER: 'ct/render',                   // {runId, image:ArrayBuffer,width,height, blocks:[TextBlock]}
  DEBUG_STAGE: 'ct/debug-stage',          // {runId, stage, title, payload}
  CLOSE_OVERLAY: 'ct/close-overlay',     // {}
  // content -> SW
  OVERLAY_CLOSED: 'ct/overlay-closed',   // {}
};

// Pipeline stage ids (also used for debug tabs + progress labels).
export const STAGES = [
  'capture', 'detect', 'blocks', 'ocr', 'mask', 'inpaint', 'translate', 'render',
];

export const STAGE_LABEL = {
  capture: 'Capture', detect: 'Detection', blocks: 'Text blocks', ocr: 'OCR',
  mask: 'Mask', inpaint: 'Inpaint', translate: 'Translate', render: 'Render',
};

// IndexedDB: db 'ct-db', store 'models' (keyPath 'id').
// Record: {id, data:ArrayBuffer, bytes, downloadedAt}
export const IDB_NAME = 'ct-db';
export const IDB_STORE = 'models';

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(id);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idbPut(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDel(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
