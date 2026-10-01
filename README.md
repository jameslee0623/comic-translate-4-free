# comic-translate-4-free

**Language:** [English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

Translate manga/comic pages in-browser. The full pipeline runs locally:
bubble/text detection (RT-DETR-v2), OCR (Baberu for Japanese/English/Chinese),
text removal
via LaMa inpainting, translation (Google / Azure / local LLM), and wrapped
re-rendering into the original speech bubbles.

The extension UI follows your browser's language setting (English, Japanese,
Korean, Simplified/Traditional Chinese).

Ported from [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate)
to Manifest V3 + ONNX Runtime Web (WASM).

## Download (no build needed)

Grab the latest ready-to-install zip from the
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
page — every release is built automatically by CI and carries `chrome/` and
`firefox/` side by side. Unzip it, then follow "Install" below. You never need
to clone the repo or run `build.sh` yourself.

## Install

The zip contains two builds: `chrome/` and `firefox/`.

**Chrome:** `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select the `chrome/` folder.

**Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → open the `firefox/` folder and pick `manifest.json`. (Temporary
add-ons stay until Firefox restarts. For a permanent install the build must
be signed on addons.mozilla.org.)

Then download the models once from the Options page — one
**Download all models** button fetches everything (detector, OCR models,
inpainter, ~350 MB total). They are cached in the browser (IndexedDB) and never
re-downloaded. The byte size of each file is verified after download; a
truncated or wrong file is flagged with a ⚠ and can be re-downloaded.

![Downloading the models from the Options page](docs/images/options-models.png)

## Use

1. **Allow the site first** — translation only runs on sites you explicitly
   allow. Click the extension icon and press **Allow this site**
   (or add hostnames in Options, or turn on **Allow all sites** to skip this
   step everywhere). This is a hard gate: the pipeline refuses
   to run anywhere else.
2. Open a manga page on an allowed site — it starts translating
   automatically as soon as the page finishes loading, no button click
   needed (toggleable in Options under "Auto-translate on page load").
   On first use per site, Chrome asks for a one-time permission so the
   extension can download the page image at full resolution.
3. A status pill in the top-right corner of the page shows live progress
   (Capturing → Detecting → OCR → …). When done, the page's own picture is
   replaced in place with the translated version — original text inpainted
   out, translation rendered back into the bubbles.

To translate one specific picture instead of the page's main image,
right-click it and choose **Send to comic-translate-4-free**. This sends
that exact image through the pipeline — even when it is smaller than the
minimum image size — and still replaces it in place. The menu item only
appears on sites you have allowed.

![The extension popup](docs/images/popup.png)

The pipeline translates every picture on the page (up to 50 per run,
biggest first), gated by the minimum image size setting (default 400px):
smaller pictures are skipped with a clear error. The extension reads the
page's own image directly — it never screenshots the webpage.

**Page cache:** pages you revisit in the same browser session load instantly
from a temporary on-disk cache (the inpainted image + translated text, so
font-size changes re-render without re-translating). The cache is cleared
automatically when the browser closes, and is never used in incognito windows.

**Options** (right-click the icon → Options): site access, auto-translate on
page load, source/target languages, translation backend (Google free / Azure
Translator / LM Studio), connection-test buttons for Azure and LM Studio,
detection threshold, minimum image size (default 400px — smaller captures are
skipped), font sizes, debug mode, and the translated-page cache controls.

### LM Studio

Run LM Studio with its local server enabled (default
`http://127.0.0.1:1234`). Select **LM Studio (local server)** as the backend
in Options, set the server URL and the API flavour — **LM Studio REST API v1**
(posts to `/api/v1/chat`) or **OpenAI-compatible** (posts to
`/v1/chat/completions`) — then press **Check LM Studio connection** to
verify. The loaded model is detected automatically and remembered, so there
is no model-name field to fill in.

## Build from source

No bundler, no npm install — the source is the extension. Requirements:
`bash`, `python3`, `rsync`, `zip`, and `node` (used only for a syntax check).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

This writes `dist/comic-translate-4-free-v<version>-<build>.zip` containing
`chrome/` and `firefox/` side by side, ready to load unpacked (Chrome) or as
a temporary add-on (Firefox) per "Install" above.

The `<build>` stamp comes from the `BUILD` const at the top of
`src/ui/options.js` and `src/ui/popup.js` (keep the two in sync). Bump it
before building if you want a unique stamp in the filename and the UI
footer — otherwise your build is indistinguishable from the released one
with the same stamp.

Per page the extension sends a single batched request:

```
POST {server}/chat/completions
{
  "messages": [
    { "role": "user",
      "content": "Translate the following 9 text(s) from Japanese to Chinese (Traditional):\n[\"…\",\"…\"]" }
  ],
  "temperature": 0,
  "texts": ["…", "…"],
  "target": "zh-TW",
  "source": "ja"
}
```

The model is expected to reply with a JSON array of translated strings —
one per input text, in the same order. A bare `[...]` inside a longer reply
is accepted; one translation per line is the last-resort fallback.

## Debug mode

Enable **Debug mode** in Options and every pipeline stage's output appears in
a side-panel inspector: captured image, detection boxes, text blocks, OCR
crops + readings, the inpaint mask, the inpainted page, and translations.

## Architecture

```
popup / options (src/ui)
      │ chrome.runtime messages
      ▼
background — orchestration, capture, blocks, mask, translation APIs,
             debug emission
  ├─ Chrome: service worker + offscreen document (src/offscreen) hosting
  │  ALL onnxruntime-web sessions (downloads run there so a 197 MB fetch
  │  survives SW shutdown)
  └─ Firefox: background page (src/background/background.html) hosting the
     same sessions in-process (Firefox has no offscreen documents)
└── content script (src/content) — overlay canvas + text renderer + debug panel
```

Models (Hugging Face, downloaded on demand):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (Japanese, English, Simplified/Traditional Chinese)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Pipeline stages: capture → detect → blocks → OCR → mask → inpaint →
translate → render. Detection runs at 640×640; pages taller than 3.5:1 are
processed in overlapping vertical slices.

**Chrome vs Firefox pipeline:** both builds run translate in parallel with
mask/inpaint after OCR. Chrome does it via Promise.all — the ML sessions
live in the offscreen document on its own thread, so the stages truly
overlap. Firefox runs translation on a Web Worker (its own thread) while
mask → inpaint runs on the main thread — the worker's network I/O is not
blocked when the WASM inpaint hogs the main thread. (Firefox previously ran
the linear mask → inpaint → translate order; the single-threaded background
page couldn't run the parallel branches without freezing.)

## Known limitations

- No good OCR for Korean — source languages are Japanese, English, and
  Simplified/Traditional Chinese.
- Auto-translate handles a single picture per page (the page's main image).
  To translate any other picture on the page, right-click it and choose
  **Send to comic-translate-4-free**.
- Firefox: the AI models run inside the browser's background page (Firefox has
  no offscreen documents), sharing memory with everything else. On very large
  pages or long sessions the engine can run out of memory and report
  "no available backend found". Restarting the browser frees memory; Chrome is
  unaffected since it runs the models in a separate process.
- Chrome: translating dozens of images in one session can crash the browser
  (observed at around 35 cached images).
- The page cache is session-scoped: it is wiped when the browser starts, so
  after a restart (including after a crash) re-sent images run the full
  pipeline again instead of hitting the cache.
- Local LLM backend is experimental (needs WebGPU + multi-GB downloads).
- Google backend uses the unofficial `translate.googleapis.com` endpoint and
  may be rate-limited; Azure needs your own key.
- OCR engines: Baberu (Japanese/English/Chinese).
- Baberu's decoder was trained upstream with a 64-character label cap
  (`--max-text-len 64`), so one crop never returns more than ~64 characters.
  Longer bubbles are re-OCR'd automatically in overlapping chunks and stitched
  back together (up to ~4x64 chars); the debug panel's OCR tab marks any crop
  that hit the cap.
- Vertical text is rendered for tall CJK blocks; SFX / text outside bubbles
  uses its own text box.

## Third-party notices

Bundled libraries, ported code, and runtime-downloaded models are listed with
their licenses in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Support this project

If this extension is useful to you, consider supporting its development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)
