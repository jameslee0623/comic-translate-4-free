# AMO Submission Notes — comic-translate-4-free v1.0.0

## Version notes (v1.0.0)

A browser extension that translates manga/comic pages in-place. All machine
learning (text detection, OCR, inpainting) runs locally in the browser via
ONNX Runtime Web (WebAssembly); translation uses the user's choice of
Google's free API, Azure Translator, or a local LM Studio server.

Key features:
- Auto-translates the page's main image on load; right-click any image for
  "Send to comic-translate-4-free" to translate it specifically.
- Source-language auto-detect (Japanese/English/Simplified/Traditional Chinese);
  114 target languages.
- Long-strip support (pages split into overlapping segments for detection).
- Page cache (session-scoped, user-clearable); completion chime; debug mode.
- Site access controls: per-site allow/disallow + "allow all sites" option.

## Test accounts

No account is required. The default translation backend (Google free API)
works without any key. Azure Translator and LM Studio are optional
user-configured backends; reviewers can test with the default.

To test: install, open the popup, allow a site (or enable "allow all sites"),
and visit any manga page. The extension auto-translates on page load.

## Validator warnings — explanations

### Unsafe assignment to innerHTML

All innerHTML assignments interpolate only:
1. The extension's own localized strings (from `_locales/*/messages.json`
   via `chrome.i18n.getMessage`) — never user input or web content.
2. Escaped dynamic values via `esc()`/`escapeHtml()`/`escHtml()` helpers
   (defined in `src/content/content.js`, `src/ui/options.js`, `src/ui/popup.js`).
3. Page hostnames from `new URL().hostname` (DNS-restricted, cannot contain
   HTML metacharacters), additionally passed through `escHtml()`.

No web page content, OCR output, or translation results are ever inserted
via innerHTML — those go through `textContent` or are drawn to canvas.

### The Function constructor is eval (new Function)

The single `new Function(...)` is inside Microsoft's ONNX Runtime Web
(`src/offscreen/vendor/ort-wasm-simd-threaded.jsep.mjs`), the standard
Emscripten-generated WASM glue code. It dynamically creates a method-caller
for the WebAssembly module — a well-known Emscripten pattern, not our code,
and not reachable from any web content. Removing it would break ONNX Runtime.
The vendored `ort.min.js` (v1.30.0, MIT) is unmodified from the npm release.

## Privacy

- No analytics, no telemetry, no remote code.
- OCR text is sent only to the user-selected translation backend.
- Images are processed locally; the only network requests are model
  downloads (Hugging Face CDN), translation API calls, and image fetches
  for translation.
- `data_collection_permissions` declares the websiteContent usage as required.
