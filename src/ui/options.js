// Options page: read/write settings + model management + connection checks.
const BUILD = '20260928l'; // keep in sync with popup.js; shown in the footer
const $ = id => document.getElementById(id);
const LANGS = [
  ['ja', 'Japanese'], ['en', 'English'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'],
];
const DEFAULTS = {
  sourceLang: 'ja', targetLang: 'en', translationBackend: 'google',
  azureKey: '', azureRegion: '',
  lmStudioUrl: 'http://localhost:1234/v1', lmStudioKey: '', lmStudioApi: 'openai',
  lmStudioModelId: '', // auto-managed, not shown in the UI
  localLlmModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  debugMode: false, detectionThreshold: 0.3,
  initFontSize: 40, minFontSize: 10, minImageSize: 500,
  siteWhitelist: [], autoTranslateOnLoad: true,
};

function fillLangs(sel, val) {
  sel.innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  sel.value = val;
}

let whitelist = [];

// Full settings as last loaded — collect() spreads this first so auto-managed
// fields with no UI (e.g. lmStudioModelId) survive every save.
let lastSettings = {};

// --- auto-save: every change persists within ~0.4s, no Save button ---
let saveTimer = null;
function flashSaved() {
  const el = $('saved');
  el.style.opacity = 1;
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => { el.style.opacity = 0; }, 1200);
}
function autoSave() {
  if (!formLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await chrome.storage.local.set({ settings: collect() });
    flashSaved();
  }, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  return chrome.storage.local.set({ settings: collect() }).then(flashSaved);
}

// Flush any pending debounced save if the page is closed before the timer fires.
// Guard: don't save until the form has been populated from storage, otherwise
// closing the page early would overwrite settings with empty defaults.
let formLoaded = false;
window.addEventListener('pagehide', () => {
  if (!formLoaded) return;
  clearTimeout(saveTimer);
  try { chrome.storage.local.set({ settings: collect() }).catch(() => {}); } catch { /* ignore */ }
});

function renderWhitelist() {
  const ul = $('whitelist');
  ul.innerHTML = '';
  if (!whitelist.length) {
    ul.innerHTML = '<li style="color:#8a8a90">empty — translation is disabled everywhere until you add a site</li>';
    return;
  }
  for (const h of whitelist) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = h;
    const b = document.createElement('button');
    b.textContent = 'Remove';
    b.onclick = () => { whitelist = whitelist.filter(x => x !== h); renderWhitelist(); saveNow(); };
    li.appendChild(span); li.appendChild(b);
    ul.appendChild(li);
  }
}

$('wlAddBtn').onclick = async () => {
  let h = $('wlAdd').value.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').split('/')[0];
  if (h && !whitelist.includes(h)) {
    // Same grant the popup does on add: without a host permission the site
    // is whitelisted but translation can never start on it. Best effort:
    // if the site is open in a tab, also cover the picture's host — the
    // picture often lives on a CDN host different from the page host.
    const origins = [`*://${h}/*`, `*://*.${h}/*`];
    try {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => { try { return new URL(t.url).hostname.toLowerCase() === h; } catch { return false; } });
      if (tab && tab.id != null) {
        const r = await chrome.tabs.sendMessage(tab.id, { type: 'ct/find-image' }).catch(() => null);
        const src = r && r.image && r.image.src;
        if (src && /^https?:\/\//i.test(src)) {
          const ih = new URL(src).hostname.toLowerCase();
          if (ih && ih !== h) origins.push(`*://${ih}/*`);
        }
      }
    } catch { /* page-host origins are enough to try */ }
    if (chrome.permissions && chrome.permissions.request) {
      await chrome.permissions.request({ origins }).catch(() => false);
    }
    whitelist.push(h);
  }
  $('wlAdd').value = '';
  renderWhitelist();
  saveNow();
};

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  lastSettings = s;
  fillLangs($('sourceLang'), s.sourceLang);
  fillLangs($('targetLang'), s.targetLang);
  $('backend').value = s.translationBackend;
  $('azureKey').value = s.azureKey;
  $('azureRegion').value = s.azureRegion;
  $('lmStudioUrl').value = s.lmStudioUrl;
  $('lmStudioApi').value = s.lmStudioApi || 'openai';
  $('lmStudioKey').value = s.lmStudioKey;
  $('localLlmModel').value = s.localLlmModel;
  $('threshold').value = s.detectionThreshold;
  $('thresholdVal').textContent = Number(s.detectionThreshold).toFixed(2);
  $('initFontSize').value = s.initFontSize;
  $('minFontSize').value = s.minFontSize;
  $('minImageSize').value = s.minImageSize;
  $('debugMode').checked = s.debugMode;
  $('autoTranslate').checked = s.autoTranslateOnLoad;
  whitelist = [...(s.siteWhitelist || [])];
  renderWhitelist();
  formLoaded = true;
  refreshModels();
}

$('threshold').oninput = e => { $('thresholdVal').textContent = Number(e.target.value).toFixed(2); autoSave(); };

// Every control auto-saves; no Save button.
for (const id of ['sourceLang', 'targetLang', 'backend', 'azureKey', 'azureRegion',
    'lmStudioUrl', 'lmStudioApi', 'lmStudioKey', 'localLlmModel',
    'threshold', 'initFontSize', 'minFontSize', 'minImageSize',
    'debugMode', 'autoTranslate']) {
  const el = $(id);
  if (!el) continue;
  const evt = el.type === 'text' || el.type === 'password' || el.type === 'number' ? 'input' : 'change';
  el.addEventListener(evt, autoSave);
}

function collect() {
  return {
    ...lastSettings,
    sourceLang: $('sourceLang').value, targetLang: $('targetLang').value,
    translationBackend: $('backend').value,
    azureKey: $('azureKey').value.trim(), azureRegion: $('azureRegion').value.trim(),
    lmStudioUrl: $('lmStudioUrl').value.trim() || DEFAULTS.lmStudioUrl,
    lmStudioApi: $('lmStudioApi').value,
    lmStudioKey: $('lmStudioKey').value.trim(),
    localLlmModel: $('localLlmModel').value,
    detectionThreshold: parseFloat($('threshold').value),
    initFontSize: parseInt($('initFontSize').value, 10) || 40,
    minFontSize: parseInt($('minFontSize').value, 10) || 10,
    minImageSize: parseInt($('minImageSize').value, 10) || 500,
    debugMode: $('debugMode').checked,
    siteWhitelist: [...whitelist], autoTranslateOnLoad: $('autoTranslate').checked,
  };
}

function setCheckResult(el, r) {
  el.className = 'check-result ' + (r.ok ? 'ok' : 'err');
  el.textContent = r.ok ? '✓ ' + (r.detail || 'connected') : '✗ ' + (r.error || 'failed');
}

// Save first so the check uses the latest values, then check.
$('checkAzure').onclick = async () => {
  const btn = $('checkAzure'), out = $('azureResult');
  btn.disabled = true; out.className = 'check-result'; out.textContent = 'checking…';
  await chrome.storage.local.set({ settings: collect() });
  const r = await chrome.runtime.sendMessage({ type: 'ct/check-azure' }).catch(e => ({ ok: false, error: String(e) }));
  setCheckResult(out, r);
  btn.disabled = false;
};

$('checkLmStudio').onclick = async () => {
  const btn = $('checkLmStudio'), out = $('lmStudioResult');
  btn.disabled = true; out.className = 'check-result'; out.textContent = 'checking…';
  await chrome.storage.local.set({ settings: collect() });
  const r = await chrome.runtime.sendMessage({ type: 'ct/check-lmstudio' }).catch(e => ({ ok: false, error: String(e) }));
  setCheckResult(out, r);
  btn.disabled = false;
};

// --- model download progress ---------------------------------------------
// Downloads run fire-and-forget in the ML host; it broadcasts ct/model-progress
// (progress {fileId, loaded, total}, completion {fileId, done:true},
//  failure {fileId, error}). Without this listener a failed download left the
// button stuck on "Downloading…" forever with no error shown.
const dlInFlight = new Set(); // fileIds currently downloading
const dlErrors = {};          // fileId -> last download error text
const fileToGroup = {};       // fileId -> model group id (rebuilt on refresh)
const escapeHtml = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dlDoneCheck() {
  if (dlInFlight.size) return;
  $('downloadAll').dataset.busy = '';
  refreshModels();
}
chrome.runtime.onMessage.addListener(msg => {
  if (!msg || msg.type !== 'ct/model-progress' || !msg.fileId) return;
  const el = fileToGroup[msg.fileId] && $('model-status-' + fileToGroup[msg.fileId]);
  if (msg.error) {
    dlErrors[msg.fileId] = msg.error;
    dlInFlight.delete(msg.fileId);
    if (el) el.innerHTML = `<span style="color:#f85149">✗ download failed: ${escapeHtml(msg.error)}</span>`;
    dlDoneCheck();
  } else if (msg.done) {
    delete dlErrors[msg.fileId];
    dlInFlight.delete(msg.fileId);
    if (el) el.innerHTML = '<span style="color:#7ee787">✓ downloaded</span>';
    dlDoneCheck();
  } else if (el && msg.total > 0) {
    const pct = Math.round(100 * msg.loaded / msg.total);
    el.innerHTML = `<span style="color:#58a6ff">downloading… ${pct}% ` +
      `(${(msg.loaded / 1048576).toFixed(0)}/${(msg.total / 1048576).toFixed(0)} MB)</span>`;
  }
});

async function refreshModels() {
  const r = await chrome.runtime.sendMessage({ type: 'ct/get-models' }).catch(e => ({ ok: false, error: 'sendMessage failed: ' + String((e && e.message) || e) }));
  const box = $('models');
  box.innerHTML = '';
  const dlAll = $('downloadAll');
  if (!r || !r.ok) {
    const detail = (r && r.error) ? ` — ${r.error}` : '';
    box.innerHTML = `<span style="color:#f85149">could not reach background service${detail}<br><span style="color:#9a9aa0;font-size:12px">Try reloading the extension at about:debugging, then reopen this page.</span></span>`;
    return;
  }
  const missing = r.models.filter(g => !g.downloaded);
  for (const g of r.models) for (const f of g.files) fileToGroup[f.id] = g.id;
  // Download one or more groups; progress arrives via ct/model-progress.
  const downloadGroups = groups => {
    dlAll.dataset.busy = '1'; dlAll.disabled = true;
    dlAll.textContent = 'Downloading…';
    for (const g of groups) for (const f of g.files) {
      dlInFlight.add(f.id);
      delete dlErrors[f.id];
      chrome.runtime.sendMessage({ type: 'ct/download-model', fileId: f.id }).catch(e => {
        // A send failure is surfaced like a download error so the UI never hangs.
        dlErrors[f.id] = 'sendMessage failed: ' + String((e && e.message) || e);
        dlInFlight.delete(f.id);
        dlDoneCheck();
      });
    }
    // done/error broadcasts drive dlDoneCheck -> refreshModels per file.
  };
  // One button downloads everything that's missing.
  dlAll.disabled = !missing.length || dlAll.dataset.busy === '1';
  dlAll.textContent = dlAll.dataset.busy === '1' ? dlAll.textContent
    : missing.length ? `Download all models (${missing.length} remaining)`
    : 'All models downloaded ✓';
  dlAll.onclick = () => downloadGroups(missing);
  for (const g of r.models) {
    const div = document.createElement('div');
    div.className = 'model';
    const bytes = g.files.reduce((a, f) => a + (f.bytes || 0), 0);
    const bad = g.files.filter(f => f.downloaded && !f.bytesOk);
    let status = g.sizeMismatch
      ? `<span style="color:#f0b429">⚠ wrong file cached (${bad.map(f => f.file).join(', ')}) — press Download below to fetch the correct one</span>`
      : g.downloaded
        ? `<span style="color:#7ee787">✓ downloaded${bytes ? ' (' + (bytes / 1048576).toFixed(0) + ' MB)' : ''}</span>`
        : '<span style="color:#f0b429">not downloaded</span>';
    const dlErr = g.files.map(f => dlErrors[f.id]).filter(Boolean)[0];
    if (dlErr) status += `<br><span style="color:#f85149">✗ ${escapeHtml(dlErr)}</span>`;
    div.innerHTML = `<div><b>${g.label}</b>${g.required ? ' <span style="color:#f0b429;font-size:11px;border:1px solid #f0b429;border-radius:4px;padding:0 5px">required</span>' : ''}<div id="model-status-${g.id}" style="color:#9a9aa0;font-size:12px">${status}</div></div>`;
    const btnBox = document.createElement('div');
    if (!g.downloaded || g.sizeMismatch) {
      const dl = document.createElement('button');
      dl.textContent = g.sizeMismatch ? 'Re-download' : 'Download';
      dl.onclick = () => { downloadGroups([g]); refreshModels(); };
      btnBox.appendChild(dl);
    }
    if (g.downloaded) {
      const b = document.createElement('button');
      b.textContent = 'Delete';
      b.onclick = async () => {
        await chrome.runtime.sendMessage({ type: 'ct/delete-model', id: g.id });
        refreshModels();
      };
      btnBox.appendChild(b);
    }
    div.appendChild(btnBox);
    box.appendChild(div);
  }
}

load();
try {
  const v = chrome.runtime.getManifest().version;
  $('version').textContent = `v${v} · build ${BUILD}`;
} catch { $('version').textContent = 'build ' + BUILD; }
