# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Read manga in your language — right in the browser.

comic-translate-4-free translates manga and comic pages automatically as you browse. Open a page, and the translated version replaces the original image in place — speech bubbles filled with your language, nothing to click.

### 📸 Before & After

| Before (Japanese) | After (English) |
| --- | --- |
| ![Original Japanese manga page](docs/images/wikipe-tan-original.jpg) | ![Translated to English](docs/images/wikipe-tan-en.jpg) |

<details>
<summary>See translations in 14 more languages</summary>

| Hindi | Korean | Simplified Chinese |
| --- | --- | --- |
| ![Hindi](docs/images/wikipe-tan-hi.jpg) | ![Korean](docs/images/wikipe-tan-ko.jpg) | ![Simplified Chinese](docs/images/wikipe-tan-zh-CN.jpg) |

| Traditional Chinese | Spanish | Arabic |
| --- | --- | --- |
| ![Traditional Chinese](docs/images/wikipe-tan-zh-TW.jpg) | ![Spanish](docs/images/wikipe-tan-es.jpg) | ![Arabic](docs/images/wikipe-tan-ar.jpg) |

| French | Bengali | Portuguese |
| --- | --- | --- |
| ![French](docs/images/wikipe-tan-fr.jpg) | ![Bengali](docs/images/wikipe-tan-bn.jpg) | ![Portuguese](docs/images/wikipe-tan-pt.jpg) |

| Russian | Vietnamese | Indonesian |
| --- | --- | --- |
| ![Russian](docs/images/wikipe-tan-ru.jpg) | ![Vietnamese](docs/images/wikipe-tan-vi.jpg) | ![Indonesian](docs/images/wikipe-tan-id.jpg) |

| Urdu | German |
| --- | --- |
| ![Urdu](docs/images/wikipe-tan-ur.jpg) | ![German](docs/images/wikipe-tan-de.jpg) |

</details>

*Original image: [Wikipe-tan manga page](https://en.wikipedia.org/wiki/Wikipe-tan) via Wikimedia Commons.*

---

## ✨ Features

- **Automatic translation** — open a manga page on an allowed site and the translated version appears in place, no button click needed.
- **Right-click any image** — choose "Send to comic-translate-4-free" to translate a specific picture, even one smaller than the minimum size.
- **114 target languages** via Google Translate, Azure Translator, or your own local LM Studio server.
- **Source language auto-detect** — Japanese, English, Simplified/Traditional Chinese identified automatically from the OCR'd text.
- **Long-strip / webtoon support** — tall pages are processed in overlapping segments so text stays sharp.
- **16 UI languages** — the extension interface follows your browser's language setting.

### 🔒 Privacy

- **The AI runs on your machine.** Bubble detection, OCR, and inpainting all execute locally in your browser via WebAssembly. Your pages never leave your device.
- **Only translated text is sent out** — just the extracted strings go to the translation service you choose (Google / Azure / your local LM Studio).
- **No account, no tracking, no telemetry.** All settings and cached models stay in your browser's local storage.

---

## 🚀 Installation

**Chrome / Edge / Brave (recommended):**

[**Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — one click, automatic updates.

**Manual install:** download the zip from the [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases) page, unzip it, then go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the folder.

**Firefox:** download the Firefox zip from [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases), then go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`. (Temporary add-ons unload on restart; a signed AMO listing is in progress.)

After installing, open the Settings page and click **Download all models** once (~350 MB: detector, OCR, inpainter). They're cached in the browser and verified by byte size.

---

## 💡 How to Use

1. **Allow the site first** — click the extension icon and press **Allow this site** (or enable **Allow all sites**). Translation only runs where you've granted permission.
2. **Open a manga page** — it starts translating automatically when the page loads. A pill in the top-right shows live progress (Capturing → Detecting → OCR → …).
3. **Done** — the page's picture is replaced in place with the translated version.

**Tips:**
- Right-click any image → **Send to comic-translate-4-free** to translate just that picture.
- If a site blocks downloads (HTTP 403), the extension automatically retries via a background tab.
- Pick your translation engine in Settings: Google (free, no key), Azure Translator (needs key), or LM Studio (local server).
- Enable **Debug mode** in Settings to inspect every pipeline stage.

---

## ❤️ Support this project

If this extension is useful to you, consider supporting its development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Known Issues

- **No Korean OCR yet** — source languages are Japanese, English, and Simplified/Traditional Chinese. (Korean remains available as a translation target.)
- **One picture per page** for auto-translate (the page's main image). Use right-click → Send to translate others.
- **Large sessions** — translating dozens of images in one session can crash the browser. Clear the page cache in Settings if this happens.
- **Firefox** — models run in the background page (no offscreen documents), sharing memory with everything else. Restart the browser if you see "no available backend found".
- Google Translate uses the unofficial free endpoint and may be rate-limited.

---

## 📄 Third-party notices

This project is inspired by [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — the detector, OCR, and inpainting models are its ONNX exports, and the inference logic is ported from it.

Bundled libraries, ported code, and runtime-downloaded models are listed with their licenses in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

MIT License — see [LICENSE](LICENSE).
