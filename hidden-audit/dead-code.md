# Dead-code audit — comic-translate-ext (2026-09-30, build 20260930q)

Read-only audit. Nothing was modified. Scope: `src/` excluding vendored libs (`src/offscreen/vendor/`), `dist/`, `*.zip`.

## 1. Exported but never imported

Genuinely dead (no references anywhere):
- `src/shared/settings.js:190` — `setSettings()` exported but never called; options.js:306 and popup.js:171,332,357 write `chrome.storage.local.set` directly.
- `src/shared/model-specs.js:102` — `pruneRemovedModels()` exported but never called; the live prune runs inline in settings.js:178-184 (imports `PRUNED_MODEL_IDS` + `pruneModelIds` directly, with done-tracking `pruneRemovedModels` lacks).
- `src/shared/textblock.js:26` — `xywh()` exported, zero references in the repo.
- `src/shared/textblock.js:63` — `expandBox()` exported, zero references in the repo.

Unnecessary exports (used only inside their own file):
- `src/shared/textblock.js:78` — `boxArea()` only used internally by `boxIoU`.
- `src/shared/contracts.js:52` — `IDB_NAME` only used inside contracts.js.
- `src/shared/contracts.js:53` — `IDB_STORE` only used inside contracts.js.
- `src/shared/settings.js:4` — `DEFAULT_SETTINGS` only used inside settings.js.
- `src/shared/page-cache.js:25` — `PAGE_CACHE_MAX_ENTRIES` only used inside page-cache.js.
- `src/shared/page-cache.js:26` — `PAGE_CACHE_MAX_BYTES` only used inside page-cache.js.
- `src/shared/contracts.js:33` — `MSG.CLOSE_OVERLAY` constant never referenced (content.js:525 uses the raw string `'ct/close-overlay'`).
- `src/shared/contracts.js:35` — `MSG.OVERLAY_CLOSED` constant never referenced (content.js:454 uses the raw string `'ct/overlay-closed'`). The message types themselves are live; only the constants are dead.

## 2. Functions defined but never called

None found. Every function in service-worker.js, content.js, options.js, popup.js, offscreen.js, ml/*.js, and translators.js has at least one call site.

## 3. Commented-out code blocks

None found. No commented-out code in `src/`.

## 4. Obsolete / stale comments and names

- `src/content/content.js:425` — self-acknowledged vestige: "nothing ever paints into the overlay canvas"; the canvas is still created (line 436) and `ctx` fetched (line 459) on every debug overlay open.
- `src/shared/model-specs.js:37-40` — comments documenting the removed manga-ocr / PP-OCRv6 / Korean models. Still accurate (they explain `PRUNED_MODEL_IDS`); intentional historical notes, not stale.
- Stale "whitelist" naming (feature was renamed to "site access"; names are live, just outdated): `isWhitelisted` in src/background/service-worker.js:46 and src/ui/popup.js:205, `renderWhitelist`/`whitelist` in src/ui/options.js:145,182, settings key `siteWhitelist` (settings.js:20, options.js:137).

## 5. Duplicate logic

- `src/ui/popup.js:205` `isWhitelisted` is character-identical to `src/background/service-worker.js:46` `isWhitelisted` — copy-pasted.
- `src/ui/popup.js:198` `hostOfUrl` duplicates `src/background/service-worker.js:37` `hostOf` (same logic, different name).
- `src/ui/options.js:129` `const DEFAULTS = {...}` duplicates `src/shared/settings.js:4` `DEFAULT_SETTINGS` — and has drifted: it is missing `allowAllSites` (settings.js:21). Should import the shared one.
- `src/content/content.js:15` `shrinkBbox` vs `src/shared/textblock.js:50` `shrinkBbox` — same name, different math (center-based pct-of-size vs per-side inset). Not a pure duplicate but a naming hazard; content.js is a classic script so it can't import the shared module.
- `src/offscreen/ml/baberu.js:55` private `resizeBicubicRGBA` sits alongside the shared `resizeBilinearRGBA` (src/offscreen/ml/image-ops.js:4) — different algorithms (bicubic vs bilinear), so likely intentional, flagged for awareness only.

## 6. Entirely unused files

None. Every non-vendor file is referenced: background-ff.js ← background.html; ml-bridge.js, translators.js ← service-worker.js; translate-worker.js ← service-worker.js:716; content.js ← injected via `CONTENT_SCRIPT_FILES`; offscreen.js ← offscreen.html + background-ff.js; ml/*.js ← offscreen.js; shared/* ← imported; ui/* ← their HTML pages; docs/images/* ← READMEs; icons ← manifests; _locales ← i18n.js.

## Notes (vendor, out of scope but observed)

- `src/offscreen/vendor/web-llm.js` (6.6 MB) is only reached via dynamic `import()` in `localLlm()` (src/background/translators.js:523), which is currently unreachable from the UI (backend falls back to google; options.js:268, popup.js:189).
- `src/offscreen/vendor/ort-wasm-simd-threaded.jsep.mjs` / `.wasm` have no references in `src/` (no WebGPU path in the codebase).
