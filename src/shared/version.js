// Build stamp for the source tree. The source tree follows the Chrome
// manifest (the repo root manifest is Chrome's), so BUILD here is the
// Chrome version. SPLIT (2026-11-03): Chrome and Firefox versions are
// independent now — Chrome 2.x (GPU speed line), Firefox 1.4.x (needed
// patches only). build.sh sets BUILD in each built copy to that browser's
// manifest version, so the popup/options footer matches the manifest for
// that browser. Do not rely on this source value for Firefox; the Firefox
// zip's BUILD is set by build.sh.
// NOTE: BUILD is NOT in the page-cache key anymore (2026-11-12) — it used
// to be, so every update wiped the whole cache and every page re-translated
// on refresh. The cache key now uses the schema prefix (v2t2) instead, which
// is bumped only when the translation pipeline itself changes what it outputs.
// Shown in the popup/options footers only.
export const BUILD = '2.0.18';
