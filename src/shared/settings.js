// Shared settings: defaults + storage access. Importable in SW, offscreen, UI pages.
// (Content scripts use chrome.storage directly via messaging to avoid duplication.)

export const DEFAULT_SETTINGS = {
  sourceLang: 'ja',
  targetLang: 'en',
  translationBackend: 'google', // 'google' | 'azure' | 'lmstudio' | 'local-llm'
  azureKey: '',
  azureRegion: '',
  lmStudioUrl: 'http://localhost:1234/v1', // LM Studio OpenAI-compatible server
  lmStudioKey: '',
  lmStudioApi: 'openai', // 'openai' | 'lmstudio-v1'
  lmStudioModelId: '', // auto-managed: loaded model id for the v1 flavour (no UI)
  localLlmModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  debugMode: false,
  detectionThreshold: 0.3,
  initFontSize: 40,
  minFontSize: 10,
  minImageSize: 500, // skip images smaller than this (max dimension, px)
  siteWhitelist: [], // hostnames allowed to translate, e.g. ['example.com']
  autoTranslateOnLoad: true, // start the pipeline automatically on whitelisted page loads
};

export const LANGS = [
  ['ja', 'Japanese'], ['en', 'English'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'],
];

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  const s = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  // One-time migration: the default minimum image size dropped 600 -> 500.
  // Installs still sitting on the old default follow it; a value the user
  // deliberately chose is left alone.
  if (stored.settings && stored.settings.minImageSize === 600) {
    s.minImageSize = 500;
    chrome.storage.local.set({ settings: s }).catch(() => {});
  }
  // One-time migration (2026-09-28): Latin/Russian source languages were
  // removed. A stored sourceLang that's no longer offered falls back to
  // Japanese (the default); the orphaned OCR models are deleted.
  const offered = new Set(LANGS.map(([code]) => code));
  if (s.sourceLang && !offered.has(s.sourceLang)) {
    s.sourceLang = DEFAULT_SETTINGS.sourceLang;
    chrome.storage.local.set({ settings: s }).catch(() => {});
  }
  if (!s._prunedLatinRuModels) {
    s._prunedLatinRuModels = true;
    chrome.storage.local.set({ settings: s }).catch(() => {});
    try {
      const { pruneRemovedModels } = await import('./model-specs.js');
      await pruneRemovedModels();
    } catch { /* best effort */ }
  }
  return s;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
