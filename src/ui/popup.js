// Popup: trigger runs, show progress, backend + language quick-switch, whitelist.
const BUILD = '20260928l'; // bump on every shipped build; shown in the footer
const $ = id => document.getElementById(id);
const STAGE_LABEL = {
  idle: 'idle', capture: 'Capturing page…', detect: 'Detecting bubbles & text…',
  blocks: 'Assembling text blocks…', ocr: 'Reading text (OCR)…', mask: 'Building masks…',
  inpaint: 'Inpainting…', translate: 'Translating…', render: 'Rendering…',
  done: 'Done', cancelled: 'Cancelled', error: 'Error',
};
const LANGS = [
  ['ja', 'Japanese'], ['en', 'English'], ['ko', 'Korean'], ['zh-CN', 'Chinese (S)'],
  ['zh-TW', 'Chinese (T)'],
];

let currentHost = null;

function setStatus(s) {
  $('status').textContent = s || '';
}

function setProgress(p) {
  $('progress').style.width = Math.round((p || 0) * 100) + '%';
}

function fillLangs() {
  for (const id of ['sourceLang', 'targetLang']) {
    $(id).innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  }
}

async function saveLang(key, value) {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...(settings || {}), [key]: value } });
}

async function refresh() {
  const st = await chrome.runtime.sendMessage({ type: 'ct/get-status' }).catch(() => null);
  if (st && st.ok) {
    const s = st.status;
    setStatus(STAGE_LABEL[s.stage] || s.stage);
    setProgress(s.progress);
    // Never wipe an error here: a failed click shows its error via the
    // message response just before this refresh runs. Only ever set.
    if (s.error) $('error').textContent = s.error;
    $('cancel').disabled = !(s.stage && !['done', 'idle', 'error', 'cancelled'].includes(s.stage));
    $('translate').disabled = !$('cancel').disabled;
  }
  const { settings } = await chrome.storage.local.get('settings');
  if (settings) {
    if (settings.translationBackend) $('backend').value = settings.translationBackend;
    if (settings.sourceLang) $('sourceLang').value = settings.sourceLang;
    if (settings.targetLang) $('targetLang').value = settings.targetLang;
  }
  await refreshSite(settings || {});
}

function hostOfUrl(url) {
  try {
    const u = new URL(url || '');
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : null;
  } catch { return null; }
}

function isWhitelisted(host, list) {
  const h = (host || '').toLowerCase();
  return (list || []).some(e => {
    const w = String(e || '').toLowerCase().trim();
    return w && (h === w || h.endsWith('.' + w));
  });
}

// The picture often lives on a CDN host different from the page host; without
// permission for it the extension can't download the picture's pixels.
// cachedImageHost is filled in (best effort) when the popup opens, so the
// click handler below can build the full origin list SYNCHRONOUSLY — Firefox
// expires the click's user gesture across awaits, and permissions.request()
// called after an await silently does nothing.
let cachedImageHost = null;
// A granted `*://host/*` satisfies the query, but be lenient like
// hasHostAccess in the service worker: scheme-specific grants count too.
async function hasOriginAccess(host) {
  for (const p of [`*://${host}/*`, `http://${host}/*`, `https://${host}/*`]) {
    if (await chrome.permissions.contains({ origins: [p] }).catch(() => false)) return true;
  }
  return false;
}
function requestSiteAccessNow(host) {
  const origins = [`*://${host}/*`, `*://*.${host}/*`];
  if (cachedImageHost && cachedImageHost !== host) origins.push(`*://${cachedImageHost}/*`);
  if (chrome.permissions && chrome.permissions.request) {
    return chrome.permissions.request({ origins }).catch(() => false);
  }
  return Promise.resolve(false);
}

async function refreshSite(settings) {  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [null]);
  currentHost = tab ? hostOfUrl(tab.url) : null;
  // Learn the page picture's host now (not on click) so the grant click can
  // request it without any awaits first — pictures often live on a CDN host
  // different from the page host, and the pipeline's download tier needs
  // permission for it. Awaited here: this is popup-open time, not a click
  // gesture, so awaits are fine.
  cachedImageHost = null;
  if (tab && tab.id != null) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'ct/find-image' }).catch(() => null);
      const src = r && r.image && r.image.src;
      if (src && /^https?:\/\//i.test(src)) {
        const ih = new URL(src).hostname.toLowerCase();
        if (ih && ih !== currentHost) cachedImageHost = ih;
      }
    } catch { /* content script not injected yet — page host is enough to try */ }
  }
  const list = settings.siteWhitelist || [];
  const btn = $('whitelistBtn');
  if (!currentHost) {
    $('site').innerHTML = 'no site detected';
    btn.disabled = true;
    return;
  }
  const ok = isWhitelisted(currentHost, list);
  $('site').innerHTML = `this site: <b>${currentHost}</b> — ` +
    (ok ? '<span class="ok">whitelisted ✓</span>' : '<span class="warn">not whitelisted</span>');
  btn.textContent = ok ? 'Remove from whitelist' : 'Add this site to whitelist';
  btn.disabled = false;
  // Whitelisted but missing host access: offer the one-click grant. This covers
  // BOTH the page host (needed for script injection) and the picture's host
  // (needed for the download tier) — the picture often lives on a CDN. After
  // the first grant the content script can inject, so the picture host becomes
  // known and a second click covers it; the row stays visible until both are
  // granted, naming whichever host is still missing.
  const grantRow = $('grantRow');
  grantRow.style.display = 'none';
  if (ok && currentHost && chrome.permissions && chrome.permissions.contains) {
    const pageHas = await hasOriginAccess(currentHost);
    const imgHas = !cachedImageHost || await hasOriginAccess(cachedImageHost);
    const missing = !pageHas ? currentHost : (!imgHas ? cachedImageHost : null);
    if (missing) {
      grantRow.style.display = '';
      $('grantBtn').textContent = `Grant access to ${missing}`;
      $('grantBtn').onclick = () => {
        // Request synchronously in the click: no awaits before
        // permissions.request() or Firefox drops the user gesture.
        requestSiteAccessNow(currentHost).then(() => refreshSite(settings));
      };
    }
  }
  btn.onclick = async () => {
    const { settings: s } = await chrome.storage.local.get('settings');
    const cur = { ...(s || {}) };
    const wl = new Set(cur.siteWhitelist || []);
    if (isWhitelisted(currentHost, [...wl])) {
      // remove the entry that matches
      for (const e of [...wl]) {
        const w = String(e).toLowerCase();
        if (currentHost === w || currentHost.endsWith('.' + w)) wl.delete(e);
      }
    } else {
      // Granting host access here (a user gesture) lets auto-translate and
      // full-resolution image fetch work on this site without further clicks.
      // Request synchronously in the click — no awaits before
      // permissions.request() or Firefox drops the user gesture.
      await requestSiteAccessNow(currentHost);
      wl.add(currentHost);
    }
    cur.siteWhitelist = [...wl];
    await chrome.storage.local.set({ settings: cur });
    refreshSite(cur);
  };
}

$('translate').onclick = async () => {
  $('error').textContent = '';
  try {
    // Best-effort one-time permission so the worker can download the page's
    // picture at full resolution (covers the picture's host too).
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = tab && hostOfUrl(tab.url);
    if (host) await requestSiteAccess(host);
  } catch { /* optional; the pipeline reports what it can't read */ }
  const r = await chrome.runtime.sendMessage({ type: 'ct/translate-page' }).catch(e => ({ ok: false, error: String(e) }));
  if (!r.ok) $('error').textContent = r.error;
  refresh();
};

$('cancel').onclick = () => chrome.runtime.sendMessage({ type: 'ct/cancel-run' });

$('backend').onchange = async e => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...(settings || {}), translationBackend: e.target.value } });
};

$('sourceLang').onchange = e => saveLang('sourceLang', e.target.value);
$('targetLang').onchange = e => saveLang('targetLang', e.target.value);

$('options').onclick = e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'ct/run-progress') {
    setStatus(STAGE_LABEL[msg.stage] || msg.stage);
    setProgress(msg.progress);
    if (msg.stage === 'error') $('error').textContent = msg.error || 'unknown error';
    else if (msg.stage === 'done') $('error').textContent = '';
    const running = msg.stage && !['done', 'idle', 'error', 'cancelled'].includes(msg.stage);
    $('cancel').disabled = !running;
    $('translate').disabled = running;
  }
});

fillLangs();
try {
  const v = chrome.runtime.getManifest().version;
  $('build').textContent = `· v${v} · build ${BUILD}`;
} catch { $('build').textContent = '· build ' + BUILD; }
refresh();
setInterval(refresh, 3000);
