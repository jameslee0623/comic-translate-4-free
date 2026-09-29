// Shared i18n helper for the extension UI pages (popup, options).
// Chrome/Firefox pick the locale automatically from the browser UI language
// via _locales/*/messages.json; default_locale "en" is the fallback.
// Loaded as a classic script before popup.js / options.js; exposes globals.
function ctMsg(key, subs) {
  try {
    if (chrome && chrome.i18n) {
      const m = chrome.i18n.getMessage(key, subs);
      if (m) return m;
    }
  } catch { /* chrome.i18n unavailable — fall through */ }
  return '';
}

// Fill static HTML: elements carry data-i18n="key" (textContent),
// data-i18n-ph="key" (placeholder), data-i18n-title="key" (title),
// data-i18n-html="key" (innerHTML, for messages with markup).
function ctApplyI18n(root) {
  const doc = root || document;
  doc.querySelectorAll('[data-i18n]').forEach(el => {
    const m = ctMsg(el.getAttribute('data-i18n'));
    if (m) el.textContent = m;
  });
  doc.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const m = ctMsg(el.getAttribute('data-i18n-ph'));
    if (m) el.setAttribute('placeholder', m);
  });
  doc.querySelectorAll('[data-i18n-title]').forEach(el => {
    const m = ctMsg(el.getAttribute('data-i18n-title'));
    if (m) el.setAttribute('title', m);
  });
  doc.querySelectorAll('[data-i18n-html]').forEach(el => {
    const m = ctMsg(el.getAttribute('data-i18n-html'));
    if (m) el.innerHTML = m;
  });
}
