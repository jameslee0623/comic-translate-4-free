// Options page: read/write settings + model management + connection checks.
import { BUILD } from '../shared/version.js';
const $ = id => document.getElementById(id);
const LANGS = [
  ['ja', '日本語'], ['en', 'English'], ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
];

// Every language both Google Translate and Azure Translator support
// (intersection verified 2026-09-28). English names; Google-style codes.
const TARGET_LANGS = [

  ['en', 'English'],
  ['af', 'Afrikaans'],
  ['sq', 'Albanian'],
  ['am', 'Amharic'],
  ['ar', 'Arabic'],
  ['hy', 'Armenian'],
  ['as', 'Assamese'],
  ['az', 'Azerbaijani'],
  ['ba', 'Bashkir'],
  ['eu', 'Basque'],
  ['bn', 'Bengali'],
  ['bho', 'Bhojpuri'],
  ['bs', 'Bosnian'],
  ['bg', 'Bulgarian'],
  ['yue', 'Cantonese'],
  ['ca', 'Catalan'],
  ['ny', 'Chichewa'],
  ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'],
  ['hr', 'Croatian'],
  ['cs', 'Czech'],
  ['da', 'Danish'],
  ['dv', 'Divehi'],
  ['doi', 'Dogri'],
  ['nl', 'Dutch'],
  ['et', 'Estonian'],
  ['fj', 'Fijian'],
  ['fil', 'Filipino'],
  ['fi', 'Finnish'],
  ['fr', 'French'],
  ['fr-CA', 'French (Canada)'],
  ['gl', 'Galician'],
  ['ka', 'Georgian'],
  ['de', 'German'],
  ['el', 'Greek'],
  ['gu', 'Gujarati'],
  ['ht', 'Haitian Creole'],
  ['ha', 'Hausa'],
  ['he', 'Hebrew'],
  ['hi', 'Hindi'],
  ['hu', 'Hungarian'],
  ['is', 'Icelandic'],
  ['ig', 'Igbo'],
  ['id', 'Indonesian'],
  ['ga', 'Irish'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['kn', 'Kannada'],
  ['kk', 'Kazakh'],
  ['km', 'Khmer'],
  ['rw', 'Kinyarwanda'],
  ['gom', 'Konkani'],
  ['ko', 'Korean'],
  ['ku', 'Kurdish (Kurmanji)'],
  ['ckb', 'Kurdish (Sorani)'],
  ['ky', 'Kyrgyz'],
  ['lo', 'Lao'],
  ['lv', 'Latvian'],
  ['lt', 'Lithuanian'],
  ['ln', 'Lingala'],
  ['lg', 'Luganda'],
  ['mk', 'Macedonian'],
  ['mai', 'Maithili'],
  ['mg', 'Malagasy'],
  ['ms', 'Malay'],
  ['ml', 'Malayalam'],
  ['mt', 'Maltese'],
  ['mi', 'Maori'],
  ['mr', 'Marathi'],
  ['mn', 'Mongolian'],
  ['my', 'Myanmar (Burmese)'],
  ['ne', 'Nepali'],
  ['nso', 'Northern Sotho'],
  ['nb', 'Norwegian'],
  ['or', 'Odia'],
  ['ps', 'Pashto'],
  ['fa', 'Persian'],
  ['pl', 'Polish'],
  ['pt', 'Portuguese'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['pt-PT', 'Portuguese (Portugal)'],
  ['pa', 'Punjabi'],
  ['ro', 'Romanian'],
  ['rn', 'Rundi'],
  ['ru', 'Russian'],
  ['sm', 'Samoan'],
  ['sr', 'Serbian'],
  ['st', 'Sesotho'],
  ['sn', 'Shona'],
  ['sd', 'Sindhi'],
  ['si', 'Sinhala'],
  ['sk', 'Slovak'],
  ['sl', 'Slovenian'],
  ['so', 'Somali'],
  ['es', 'Spanish'],
  ['sw', 'Swahili'],
  ['sv', 'Swedish'],
  ['ta', 'Tamil'],
  ['tt', 'Tatar'],
  ['te', 'Telugu'],
  ['th', 'Thai'],
  ['ti', 'Tigrinya'],
  ['tn', 'Tswana'],
  ['tr', 'Turkish'],
  ['tk', 'Turkmen'],
  ['uk', 'Ukrainian'],
  ['ur', 'Urdu'],
  ['ug', 'Uyghur'],
  ['uz', 'Uzbek'],
  ['vi', 'Vietnamese'],
  ['cy', 'Welsh'],
  ['xh', 'Xhosa'],
  ['yo', 'Yoruba'],
  ['zu', 'Zulu'],
];
const DEFAULTS = {
  sourceLang: 'ja', targetLang: 'en', translationBackend: 'google',
  azureKey: '', azureRegion: '',
  lmStudioUrl: 'http://127.0.0.1:1234', lmStudioKey: '', lmStudioApi: 'lmstudio-v1',
  lmStudioModelId: '', // auto-managed, not shown in the UI
  localLlmModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', // no UI yet; backend uses the default
  debugMode: false, detectionThreshold: 0.3,
  initFontSize: 40, minFontSize: 10, minImageSize: 500,
  siteWhitelist: [], autoTranslateOnLoad: true,
};

function fillLangs(sel, list, val) {
  sel.innerHTML = list.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  sel.value = list.some(([c]) => c === val) ? val : list[0][0];
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
    await persistSettings(collect());
    flashSaved();
  }, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  return persistSettings(collect()).then(flashSaved);
}

// Flush any pending debounced save if the page is closed before the timer fires.
// Guard: don't save until the form has been populated from storage, otherwise
// closing the page early would overwrite settings with empty defaults.
let formLoaded = false;
window.addEventListener('pagehide', () => {
  if (!formLoaded) return;
  clearTimeout(saveTimer);
  try { persistSettings(collect()).catch(() => {}); } catch { /* ignore */ }
});

function renderWhitelist() {
  const ul = $('whitelist');
  ul.innerHTML = '';
  if (!whitelist.length) {
    const emptyMsg = ctMsg('whitelist_empty') || 'empty — translation is disabled everywhere until you add a site';
    ul.innerHTML = `<li style="color:#8a8a90">${emptyMsg}</li>`;
    return;
  }
  for (const h of whitelist) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = h;
    const b = document.createElement('button');
    b.textContent = ctMsg('remove') || 'Remove';
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

$('allowAllSites').onchange = e => {
  const on = e.target.checked;
  // "Allow all sites" needs the <all_urls> host permission. Request it
  // synchronously in the gesture — no awaits before permissions.request()
  // or Firefox drops the user gesture and the prompt never appears.
  let p;
  try {
    p = on
      ? chrome.permissions.request({ origins: ['<all_urls>'] })
      : chrome.permissions.remove({ origins: ['<all_urls>'] }).catch(() => true);
  } catch {
    p = Promise.resolve(false);
  }
  Promise.resolve(p).then(granted => {
    // If the user dismissed/denied the prompt, revert the checkbox.
    if (on && !granted) e.target.checked = false;
    saveNow();
  }).catch(() => { if (on) e.target.checked = false; saveNow(); });
};

// Write the settings object into every form control. Used by load() and by
// the storage-change listener below. Text/number inputs the user is actively
// editing are left alone — their in-progress value wins and auto-save will
// persist it.
function setVal(id, v) {
  const el = $(id);
  if (el && document.activeElement !== el) el.value = v;
}
function setChecked(id, v) {
  const el = $(id);
  if (el) el.checked = !!v;
}
function applyToForm(s) {
  if (s.translationBackend === 'local-llm') s.translationBackend = 'google'; // backend retired from UI
  fillLangs($('sourceLang'), LANGS, s.sourceLang);
  fillLangs($('targetLang'), TARGET_LANGS, s.targetLang);
  setVal('backend', s.translationBackend);
  setVal('azureKey', s.azureKey || '');
  setVal('azureRegion', s.azureRegion || '');
  setVal('lmStudioUrl', s.lmStudioUrl || '');
  setVal('lmStudioApi', s.lmStudioApi || 'lmstudio-v1');
  setVal('lmStudioKey', s.lmStudioKey || '');
  setVal('threshold', s.detectionThreshold);
  $('thresholdVal').textContent = Number(s.detectionThreshold).toFixed(2);
  setVal('initFontSize', s.initFontSize);
  setVal('minFontSize', s.minFontSize);
  setVal('minImageSize', s.minImageSize);
  setChecked('debugMode', s.debugMode);
  setChecked('autoTranslate', s.autoTranslateOnLoad);
  setChecked('allowAllSites', s.allowAllSites);
  whitelist = [...(s.siteWhitelist || [])];
  renderWhitelist();
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  lastSettings = s;
  applyToForm(s);
  formLoaded = true;
  refreshModels();
  $('clearCache').onclick = onClearCacheClick;
  refreshCacheStats();
}

// All writes go through here so we can tell our own storage.onChanged echo
// apart from genuine remote changes (e.g. from the popup).
let lastLocalWrite = 0;
function persistSettings(s) {
  lastLocalWrite = Date.now();
  return chrome.storage.local.set({ settings: s });
}

// Sync with the popup (or any other writer): if settings change elsewhere,
// update the form. lastSettings is refreshed too, because collect() spreads
// it — without this, the next auto-save would clobber the remote change
// with stale values.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  if (Date.now() - lastLocalWrite < 800) return; // our own echo
  const s = { ...DEFAULTS, ...((changes.settings && changes.settings.newValue) || {}) };
  lastSettings = s;
  if (formLoaded) applyToForm(s);
});

$('threshold').oninput = e => { $('thresholdVal').textContent = Number(e.target.value).toFixed(2); autoSave(); };

// Every control auto-saves; no Save button.
for (const id of ['sourceLang', 'targetLang', 'backend', 'azureKey', 'azureRegion',
    'lmStudioUrl', 'lmStudioApi', 'lmStudioKey',
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
    detectionThreshold: parseFloat($('threshold').value),
    initFontSize: parseInt($('initFontSize').value, 10) || 40,
    minFontSize: parseInt($('minFontSize').value, 10) || 10,
    minImageSize: parseInt($('minImageSize').value, 10) || 500,
    debugMode: $('debugMode').checked,
    siteWhitelist: [...whitelist], autoTranslateOnLoad: $('autoTranslate').checked,
    allowAllSites: $('allowAllSites').checked,
  };
}

function setCheckResult(el, r) {
  el.className = 'check-result ' + (r.ok ? 'ok' : 'err');
  el.textContent = r.ok ? '✓ ' + (r.detail || 'connected') : '✗ ' + (r.error || 'failed');
}

function checkingText() { return ctMsg('checking') || 'checking…'; }

// Save first so the check uses the latest values, then check.
$('checkAzure').onclick = async () => {
  const btn = $('checkAzure'), out = $('azureResult');
  btn.disabled = true; out.className = 'check-result'; out.textContent = checkingText();
  await persistSettings(collect());
  const r = await chrome.runtime.sendMessage({ type: 'ct/check-azure' }).catch(e => ({ ok: false, error: String(e) }));
  setCheckResult(out, r);
  btn.disabled = false;
};

$('checkLmStudio').onclick = async () => {
  const btn = $('checkLmStudio'), out = $('lmStudioResult');
  btn.disabled = true; out.className = 'check-result'; out.textContent = checkingText();
  await persistSettings(collect());
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
    if (el) el.innerHTML = `<span style="color:#f85149">${escapeHtml(ctMsg('download_failed', [msg.error])) || escapeHtml('✗ download failed: ' + msg.error)}</span>`;
    dlDoneCheck();
  } else if (msg.done) {
    delete dlErrors[msg.fileId];
    dlInFlight.delete(msg.fileId);
    if (el) el.innerHTML = `<span style="color:#7ee787">${ctMsg('downloaded_short') || '✓ downloaded'}</span>`;
    dlDoneCheck();
  } else if (el && msg.total > 0) {
    const pct = Math.round(100 * msg.loaded / msg.total);
    el.innerHTML = `<span style="color:#58a6ff">${ctMsg('downloading', [String(pct)]) || `downloading… ${pct}%`} ` +
      `(${(msg.loaded / 1048576).toFixed(0)}/${(msg.total / 1048576).toFixed(0)} MB)</span>`;
  }
});

// ---- translated page cache ----
function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

async function refreshCacheStats() {
  let st = { count: 0, bytes: 0 };
  try {
    const r = await chrome.runtime.sendMessage({ type: 'ct/page-cache-stats' });
    if (r && r.ok) st = r;
  } catch { /* background unreachable — show zeros */ }
  $('cacheStats').textContent =
    ctMsg('pagecache_stats', [String(st.count), fmtBytes(st.bytes)]) ||
    `${st.count} pages · ${fmtBytes(st.bytes)}`;
}

async function onClearCacheClick() {
  const btn = $('clearCache');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = ctMsg('pagecache_clearing') || 'Clearing…';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'ct/clear-page-cache' });
    if (r && r.ok) {
      $('cacheStats').textContent =
        ctMsg('pagecache_cleared', [String(r.count), fmtBytes(r.bytes)]) ||
        `Cache cleared (${r.count} pages, ${fmtBytes(r.bytes)} freed)`;
      setTimeout(refreshCacheStats, 4000);
    } else {
      throw new Error((r && r.error) || 'unknown error');
    }
  } catch (e) {
    $('cacheStats').textContent = `✗ ${String((e && e.message) || e).slice(0, 100)}`;
  }
  btn.textContent = old;
  btn.disabled = false;
}

async function refreshModels() {
  const r = await chrome.runtime.sendMessage({ type: 'ct/get-models' }).catch(e => ({ ok: false, error: 'sendMessage failed: ' + String((e && e.message) || e) }));
  const box = $('models');
  box.innerHTML = '';
  const dlAll = $('downloadAll');
  if (!r || !r.ok) {
    const detail = (r && r.error) ? ` — ${r.error}` : '';
    const bgMsg = ctMsg('bg_unreachable') || 'could not reach background service';
    const bgHint = ctMsg('bg_unreachable_hint') || 'Try reloading the extension at about:debugging, then reopen this page.';
    box.innerHTML = `<span style="color:#f85149">${bgMsg}${detail}<br><span style="color:#9a9aa0;font-size:12px">${bgHint}</span></span>`;
    return;
  }
  const missing = r.models.filter(g => !g.downloaded);
  for (const g of r.models) for (const f of g.files) fileToGroup[f.id] = g.id;
  // Download one or more groups; progress arrives via ct/model-progress.
  const downloadGroups = groups => {
    dlAll.dataset.busy = '1'; dlAll.disabled = true;
    dlAll.textContent = ctMsg('downloading_generic') || 'Downloading…';
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
    : missing.length ? (ctMsg('download_all_n', [String(missing.length)]) || `Download all models (${missing.length} remaining)`)
    : (ctMsg('all_downloaded') || 'All models downloaded ✓');
  dlAll.onclick = () => downloadGroups(missing);
  for (const g of r.models) {
    const div = document.createElement('div');
    div.className = 'model';
    const bytes = g.files.reduce((a, f) => a + (f.bytes || 0), 0);
    const bad = g.files.filter(f => f.downloaded && !f.bytesOk);
    const sizeStr = bytes ? (bytes / 1048576).toFixed(0) + ' MB' : '';
    let status = g.sizeMismatch
      ? `<span style="color:#f0b429">${escapeHtml(ctMsg('wrong_file', [bad.map(f => f.file).join(', ')]) || `⚠ wrong file cached (${bad.map(f => f.file).join(', ')}) — press Download below to fetch the correct one`)}</span>`
      : g.downloaded
        ? `<span style="color:#7ee787">${escapeHtml(sizeStr ? (ctMsg('downloaded', [sizeStr]) || `✓ downloaded (${sizeStr})`) : (ctMsg('downloaded_short') || '✓ downloaded'))}</span>`
        : `<span style="color:#f0b429">${ctMsg('not_downloaded') || 'not downloaded'}</span>`;
    const dlErr = g.files.map(f => dlErrors[f.id]).filter(Boolean)[0];
    if (dlErr) status += `<br><span style="color:#f85149">✗ ${escapeHtml(dlErr)}</span>`;
    const label = (g.labelKey && ctMsg(g.labelKey)) || g.label;
    const reqBadge = g.required ? ` <span style="color:#f0b429;font-size:11px;border:1px solid #f0b429;border-radius:4px;padding:0 5px">${ctMsg('required_badge') || 'required'}</span>` : '';
    div.innerHTML = `<div><b>${escapeHtml(label)}</b>${reqBadge}<div id="model-status-${g.id}" style="color:#9a9aa0;font-size:12px">${status}</div></div>`;
    const btnBox = document.createElement('div');
    if (!g.downloaded || g.sizeMismatch) {
      const dl = document.createElement('button');
      dl.textContent = ctMsg(g.sizeMismatch ? 'redownload' : 'download') || (g.sizeMismatch ? 'Re-download' : 'Download');
      dl.onclick = () => { downloadGroups([g]); refreshModels(); };
      btnBox.appendChild(dl);
    }
    if (g.downloaded) {
      const b = document.createElement('button');
      b.textContent = ctMsg('delete') || 'Delete';
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
ctApplyI18n();
document.title = `${ctMsg('appName') || 'comic-translate-4-free'} — ${ctMsg('options_title') || 'Options'}`;
try {
  const v = chrome.runtime.getManifest().version;
  $('version').textContent = `v${v} · build ${BUILD}`;
} catch { $('version').textContent = 'build ' + BUILD; }
