// Shared settings: defaults + storage access. Importable in SW, offscreen, UI pages.
// (Content scripts use chrome.storage directly via messaging to avoid duplication.)

export const DEFAULT_SETTINGS = {
  sourceLang: 'ja',
  targetLang: 'en',
  translationBackend: 'google', // 'google' | 'azure' | 'lmstudio' | 'local-llm'
  azureKey: '',
  azureRegion: '',
  lmStudioUrl: 'http://127.0.0.1:1234', // LM Studio server (bare host:port; flavour adds its path)
  lmStudioKey: '',
  lmStudioApi: 'lmstudio-v1', // 'openai' | 'lmstudio-v1' (LM Studio REST)
  lmStudioModelId: '', // auto-managed: loaded model id for the v1 flavour (no UI)
  localLlmModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  debugMode: false,
  detectionThreshold: 0.3,
  initFontSize: 40,
  minFontSize: 10,
  minImageSize: 500, // skip images smaller than this (max dimension, px)
  siteWhitelist: [], // hostnames with site access, e.g. ['example.com']
  allowAllSites: false, // site access: translate on any site (requests <all_urls> when enabled)
  autoTranslateOnLoad: true, // start the pipeline automatically on allowed page loads
  playDing: true, // play a chime when a translation finishes (toggle in Settings)
  firstRun: false, // transient: set true by onInstalled, consumed by the popup to show the models section once
};

export const LANGS = [
  ['ja', 'Japanese'], ['en', 'English'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'],
];

// Every language both Google Translate and Azure Translator support
// (intersection verified 2026-09-28). Google-style codes, matching LANGS.
export const TARGET_LANGS = [

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
  // Target languages are now the Google∩Azure intersection (2026-09-28).
  // A stored targetLang that's not in the list falls back to English.
  if (s.targetLang && !TARGET_LANGS.some(([code]) => code === s.targetLang)) {
    s.targetLang = DEFAULT_SETTINGS.targetLang;
    chrome.storage.local.set({ settings: s }).catch(() => {});
  }
  // Prune removed models. Tracks which IDs were pruned so newly added
  // removals are picked up on installs where an earlier prune already ran.
  try {
    const { PRUNED_MODEL_IDS, pruneModelIds } = await import('./model-specs.js');
    const doneIds = Array.isArray(s._prunedModelIds) ? s._prunedModelIds : [];
    const pending = PRUNED_MODEL_IDS.filter(id => !doneIds.includes(id));
    if (pending.length) {
      await pruneModelIds(pending);
      s._prunedModelIds = [...new Set([...doneIds, ...pending])];
      chrome.storage.local.set({ settings: s }).catch(() => {});
    }
  } catch { /* best effort */ }
  return s;
}
