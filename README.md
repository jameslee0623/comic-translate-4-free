# comic-translate-4-free

**Language:** [English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

Translate manga/comic pages in-browser. The full pipeline runs locally:
bubble/text detection (RT-DETR-v2), OCR (Baberu for Japanese/English/Simplified
Chinese, PP-OCRv5 for Korean, PP-OCRv6 for Traditional Chinese), text removal
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

## Use

1. **Whitelist the site first** — translation only runs on sites you explicitly
   allow. Click the extension icon and press **Add this site to whitelist**
   (or add hostnames in Options). This is a hard gate: the pipeline refuses
   to run anywhere else.
2. Open a manga page on a whitelisted site.
3. Click the extension icon → **Translate this page**. On first use per site,
   Chrome asks for a one-time permission so the extension can download the
   page image at full resolution.
4. A status pill in the corner of the page shows live progress
   (Capturing → Detecting → OCR → …). When done, the page's own picture is
   replaced in place with the translated version — original text inpainted
   out, translation rendered back into the bubbles. If the page has no clear
   main image, the translation shows in an overlay instead.

The pipeline input is the page's largest image, gated by the minimum image
size setting (default 500px): smaller pictures are skipped with a clear
error. The extension reads the page's own image directly — it never
screenshots the webpage.

**Options** (right-click the icon → Options): site whitelist, source/target
languages, translation backend (Google free / Azure Translator / LM Studio /
experimental local LLM), connection-test buttons for Azure and LM Studio,
detection threshold, minimum image size (default 500px — smaller captures are
skipped), font sizes, debug mode.

### LM Studio

Run LM Studio with its OpenAI-compatible server enabled (default
`http://localhost:1234`, server path `/v1`). Select **LM Studio (local)** as
the backend in Options, set the server URL, then press
**Check LM Studio connection** to verify.

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
  `decoder_step_int8.onnx` (Japanese, English, Simplified Chinese)
- `PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx` → `inference.onnx` (Korean)
- `PaddlePaddle/PP-OCRv6_small_rec_onnx` → `inference.onnx` (Traditional Chinese)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Pipeline stages: capture → detect → blocks → OCR → mask → inpaint →
translate → render. Detection runs at 640×640; pages taller than 3.5:1 are
processed in overlapping vertical slices.

**Chrome vs Firefox pipeline:** this is the first behavioral difference
between the two builds. Chrome runs translate and mask/inpaint in parallel
after OCR — the ML sessions live in the offscreen document on its own
thread, so the stages truly overlap. Firefox runs the original linear order
(mask → inpaint → translate) because its ML sessions run in-process on the
background page's single thread: the WASM inpaint blocks the event loop,
which would freeze the parallel translate branch and the UI.

## Known limitations

- Local LLM backend is experimental (needs WebGPU + multi-GB downloads).
- Google backend uses the unofficial `translate.googleapis.com` endpoint and
  may be rate-limited; Azure needs your own key.
- OCR engines: Baberu (Japanese/English/Simplified Chinese), PP-OCRv5
  (Korean), PP-OCRv6 (Traditional Chinese).
- Vertical text is rendered for tall CJK blocks; SFX / text outside bubbles
  uses its own text box.

## Third-party notices

Bundled libraries, ported code, and runtime-downloaded models are listed with
their licenses in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
