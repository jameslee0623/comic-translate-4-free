# Debug-leftovers & locale audit — 2026-09-30
Repo: `~/workspace/comic-translate-ext/` @ build `20260930q`. Read-only audit, nothing modified.

## 1. console.log / debug / info in production paths
All hits are in the model-download path (user-initiated downloads only, never during translation runs). No console noise in content.js, popup.js, options.js, or the pipeline itself.
- `src/shared/model-specs.js:188` — `console.log('[ct-dl] stream done, loaded=' + loaded)`
- `src/shared/model-specs.js:196` — `console.log('[ct-dl] chunks written: ' + idx)`
- `src/shared/model-specs.js:198` — `console.log('[ct-dl] manifest written')`
- `src/offscreen/offscreen.js:109` — `console.log('[ct-dl] start', fileId)` (ML_DOWNLOAD handler)
- `src/offscreen/offscreen.js:116` — `console.log('[ct-dl] bytes done', total)`
- `src/offscreen/offscreen.js:119` — `console.log('[ct-dl] announcing done')`
- `src/offscreen/offscreen.js:121` — `console.log('[ct-dl] returning')`
- `src/offscreen/offscreen.js:124` — `console.log('[ct-dl] ERROR', ...)` — mislabeled, should be `console.error`
- No `debugger` statements anywhere. `console.warn/error` (8 hits) all guard real failures — fine.

## 2. TODO / FIXME / HACK / XXX / BUG markers
None. Zero `TODO:`, `FIXME:`, `HACK:`, `XXX:`, `BUG:` markers. The word "bug" appears only in prose comments (e.g. translators.js:355 referencing LM Studio bug #1602).

## 3. Debug-only code running in normal (non-debug) runs
Clean — everything is gated:
- `src/background/service-worker.js:357` — `emitDebug` returns immediately when `!settings.debugMode`
- `:499`, `:549`, `:662`, `:701` — all `rgbaToDataURL` image payloads built inline as `settings.debugMode ? await … : null`
- `:603` — OCR thumbnails (up to 40 canvas PNG encodes) skipped unless `debugMode`
- Note: `emitDebug` is still *called* in normal runs, but the payload objects it receives contain only cheap scalars/nulls — no wasted encodes.
- `globalThis.__ctInpaintProgress` / `__ctMlHandlers` / `__ctBgReady` are legitimate Firefox cross-context plumbing, not debug leftovers.

## 4. Locale parity — PASS
- `_locales/{en,ja,ko,zh_CN,zh_TW}/messages.json`: **104 keys each, zero missing/extra in any direction.**
- All 56 `data-i18n` attributes in `src/ui/options.html` + `src/ui/popup.html` resolve to a key in en.
- All 21 `chrome.i18n.getMessage` / `ctMsg()` keys used in JS resolve (incl. the `stage_*` family used by popup.js).

## 5. Hardcoded user-facing English bypassing chrome.i18n
Biggest gap: **`src/content/content.js` has zero `chrome.i18n` usage** — the status pill (seen on every run) and all its errors are English-only:
- `src/content/content.js:320-323` — `PILL_STAGE` labels: 'Capturing', 'Detecting bubbles', 'Building blocks', 'Reading text', 'Masking', 'Translating', 'Inpainting', 'Rendering'
- `src/content/content.js:527` — `showPill('comic-translate-4-free — done ✓')`
- `src/content/content.js:528` — `showPill('comic-translate-4-free — cancelled')`
- `src/content/content.js:526` — `showPillError(msg.error || 'unknown error')`
- `src/content/content.js:600` — `showPillError('the page image changed before translation finished — reload the page to retry')`
- `src/content/content.js:603` — `showPillError('unexpected render mode — reload the page to retry')`

All ~40 `throw new Error(...)` messages in the pipeline surface to users via the pill and are hardcoded English, e.g.:
- `src/background/translators.js:55,82,83,117,171,180,230,256,399,402,411,435` — google/azure/LM-Studio errors ('azure translator: API key not set — add it in Options', 'LM Studio: no model is loaded — …', etc.)
- `src/background/service-worker.js:153,169,180,231,418,421,477,491,538,961,962,965,967` — pipeline errors ('page image is 320×200px — below the minimum image size…', '"host" is not in your site access list — …', etc.)

Acceptable existing patterns (i18n with English fallback — not gaps):
- `src/ui/popup.js:8-14` — `STAGE_LABEL` literals overridden by `ctMsg('stage_' + k)`
- `src/ui/options.js` — `ctMsg('…') || 'English fallback'` throughout (e.g. :186, :195, :359, :401, :406, :410, :430, :438)
- `src/background/service-worker.js:904` — context-menu title with `|| 'Send to comic-translate-4-free'` fallback

Minor:
- `src/ui/options.js:356` — `'✓ ' + (r.detail || 'connected')` / `'✗ ' + (r.error || 'failed')` hardcoded fallbacks
- `src/ui/popup.js:411`, `src/ui/options.js:535` — `'build ' + BUILD` hardcoded "build" prefix
- `src/ui/options.html:4` — `<title>comic-translate-4-free — Options</title>` hardcoded (brand name fine)
- Target-language names in popup.js (`'Afrikaans'`, `'Albanian'`, …) are English by design (Google-style names); source-language names are native-form per James's preference — both intentional.

## 6. README "Known limitations" consistency — PASS
All 4 READMEs (`README.md`, `README.ja.md`, `README.zh-CN.md`, `README.zh-TW.md`) carry the same 10 bullets in the same order: Korean OCR, single-picture auto-translate, Firefox memory/OOM, Chrome ~35-image crash, session-scoped cache wipe, experimental local LLM, Google unofficial endpoint + Azure key, Baberu OCR engines, Baberu 64-char cap, vertical-text rendering. The two bullets added today (Chrome crash, session-scoped cache) are present in all four.

## Suggested cleanup (for parent to prioritize)
1. P0 i18n: `content.js` pill strings → add `pill_*` / `err_*` message keys (most user-visible surface, currently English-only in all locales).
2. P1 noise: drop or gate the 8 `[ct-dl]` `console.log` calls behind a download-debug flag; fix :124 to `console.error`.
3. P2 i18n: pipeline `throw` messages are a larger job — either localize or accept English-only errors as a documented limitation.
