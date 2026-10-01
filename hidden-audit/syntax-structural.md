# Syntax + structural audit — comic-translate-ext
Date: 2026-09-30 · Scope: `src/` (+ root manifests) · No files modified.

## 1. node --check (all .js under src/)
**PASS — every file parses.** Verified the checker is ESM-aware and catches real
errors (control tests: `import` parses OK, `const a = ;` fails as expected).
Vendor dirs (`src/**/vendor/*`, `*/node_modules/*`) were included in the sweep
and also pass.

## 2. JSON validation
**PASS** for: `manifest.json`, `manifest.firefox.json`, all 5
`_locales/*/messages.json` (en/ja/ko/zh_CN/zh_TW), every other `*.json` under
`src/` — except one non-issue:
- `src/offscreen/vendor/node_modules/protobufjs/tsconfig.json` — has `//`
  comments, so strict JSON.parse fails. Vendored upstream file, excluded from
  the build by `build.sh` (`--exclude node_modules`). Not a bug.

## 3. manifest.json vs manifest.firefox.json parity
Divergences found — **all intentional, per-browser**:
- `background`: `service_worker` (Chrome) vs `page: src/background/background.html` (Firefox) — required; Firefox has no offscreen documents.
- `browser_specific_settings.gecko` — Firefox only, expected.
- `options_page` (Chrome) vs `options_ui.open_in_tab` (Firefox) — correct per browser.
- `permissions`: Firefox omits `"offscreen"` — correct, Firefox lacks the API.
- **Parity OK**: `host_permissions`, `content_scripts`, `web_accessible_resources`,
  `action`, `icons`, `_locales`, `default_locale`, `manifest_version`, `name`,
  `version`, `description`, `minimum_chrome_version`. Every file referenced by
  either manifest (scripts, css, icons, popups, options page) exists on disk.

## 4. build.sh + gitignore
- `dist/`, `*.zip`, `*.xpi`, `node_modules/` all gitignored — correct.
- Every file path referenced in `build.sh` exists; it already runs `node --check`
  on the 6 core files and asserts manifest invariants (versions match, offscreen
  perm only on Chrome, gecko id present). Solid.
- **Packaging note**: `build.sh` rsyncs the whole repo into the release zip
  (only excludes node_modules/dist/zips/git). This new `hidden-audit/` dir will
  be bundled into shipped zips unless added to the rsync excludes. Recommend
  adding `--exclude 'hidden-audit'` to both rsync lines.

## 5. Bug-pattern sweep
- `await` in non-async fn — none (would be a SyntaxError; covered by §1).
- Empty `catch {}` / `.catch(()=>{})` swallowing errors — none found.
- `parseInt` without radix — none; all 4 call sites pass `10`.
- `==` vs `===` — one hit: `src/background/service-worker.js:945`
  `tab.id == null`. This is the deliberate `== null` idiom (null|undefined
  check), not a security comparison. No `==` in origin/permission/host/URL
  comparisons anywhere.
- Listeners added never removed — `src/content/content.js` registers **zero**
  `addEventListener` calls (uses `chrome.runtime.onMessage` only). N/A.
- `chrome.storage` reads without defaults — 12 call sites checked; all default
  safely (`...(stored.settings || {})`, `if (settings)`, `.then(r => r.settings || {})`).
- `onMessage` async hygiene — `offscreen.js:254`, `service-worker.js:955`,
  `content.js:505` all `return true` where `sendResponse` is called
  asynchronously. Correct.
- `eval(` / `new Function(` — none.
- `innerHTML` — 15 sites; dynamic text goes through `esc()`/`escapeHtml()`
  (e.g. `content.js:313`, `content.js:445/501`, `options.js:401/406/410/465/507`).
  `showPill(html)` callers pass static strings. No unescaped injection found.
- `TODO`/`FIXME`/`XXX`/`debugger` — none.

## 6. <script src> in src/**/*.html
All resolve to existing files. (The one odd-looking ref,
`../dist/loglevel.js`, lives in vendored `node_modules/loglevel/demo/index.html`
— not part of the extension, not shipped.)

## 7. i18n key integrity (bonus)
- All 5 locales carry an identical 104-key set — no missing/extra keys.
- Every `chrome.i18n.getMessage('…')` key used in JS and every `data-i18n="…"`
  attribute in HTML exists in `en/messages.json`. No dead/blank UI strings.

## Verdict
No syntax errors, no broken references, no manifest drift, no unsafe patterns
found. The single actionable item is the **packaging note in §4**
(`hidden-audit/` leaking into release zips). Codebase is structurally clean
for launch from this pass's perspective.
