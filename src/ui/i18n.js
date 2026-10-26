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

// Language names in the browser's UI language, for the source/target
// dropdowns (popup + options). chrome.i18n.getUILanguage() is the browser
// setting; Intl.DisplayNames renders each language code in that language.
// Falls back to the given name when DisplayNames is unavailable or does
// not know a code. Cached: the UI language does not change mid-session.
let _ctLangNames = null;
function ctLangName(code, fallback) {
  try {
    if (!_ctLangNames) {
      let ui = 'en';
      try {
        if (chrome && chrome.i18n && chrome.i18n.getUILanguage) ui = chrome.i18n.getUILanguage() || ui;
      } catch { /* navigator default below */ }
      _ctLangNames = new Intl.DisplayNames([ui], { type: 'language' });
    }
    return _ctLangNames.of(code) || fallback;
  } catch { return fallback; }
}
