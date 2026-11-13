# Chrome Web Store listing — English (en)

## Short description (132 chars max)

Translate manga & comics in your browser. Reads Japanese, English, Simplified & Traditional Chinese; translates into 114 languages.

(Count: 131)

## Detailed description

📖 Read manga in your language — right in the browser.

comic-translate-4-free translates manga and comic pages automatically as you browse. It reads Japanese, English, Simplified and Traditional Chinese (with auto-detect), and translates into 114 languages. Open a page, and the translated version replaces the original image in place — speech bubbles filled with your language.

✨ Features
- Automatic translation — open a manga page on an allowed site and the translated version appears in place, no button click needed.
- Every picture on the page — auto-translate handles all pictures on a page (up to 50 per run), not just the main image.
- Right-click any image — choose "Send to comic-translate-4-free" to translate a specific picture, even one smaller than the minimum size.
- 114 target languages via Google Translate, Azure Translator, or your own local LM Studio server.
- Source language auto-detect — Japanese, English, Simplified/Traditional Chinese identified automatically from the OCR'd text.
- Long-strip / webtoon support — tall pages are processed in overlapping segments so text stays sharp.
- 17 UI languages — the extension interface follows your browser's language setting.

🔒 Privacy
- The AI runs on your machine. Bubble detection, OCR, and inpainting all run locally in your browser. Detection and OCR run via WebAssembly. Inpainting runs on GPU on Chrome (with WebAssembly fallback), and via WebAssembly on Firefox. Your pages never leave your device.
- Only translated text is sent out — just the extracted strings go to the translation service you choose (Google / Azure / your local LM Studio).
- No account, no tracking, no telemetry. All settings and cached models stay in your browser's local storage.

💡 How to Use
- Allow the site first — click the extension icon and press Allow this site (or enable ALLOW ALL SITES). Translation only runs where you've granted permission.

- Reload the manga page — it starts translating automatically when the page loads. A pill in the top-right shows live progress (Capturing → Detecting → OCR → …).
- Done — the page's pictures are replaced in place with the translated versions.

Tips:
- Right-click any image → Send to comic-translate-4-free to translate just that picture.

- If a site blocks downloads (HTTP 403), the extension automatically retries via a background tab.
- Pick your translation engine in Settings: Google (free, no key), Azure Translator (apply for keys below — 2M characters/month free), or LM Studio (local server).
- Enable Debug mode in Settings to inspect every pipeline stage.

⚠️ Known Issues
- No Korean OCR yet — source languages are Japanese, English, and Simplified/Traditional Chinese. (Korean remains available as a translation target.)
- Large sessions — translating dozens of images in one session can restart the extension in the background. If that happens, the run resumes automatically from where it left off.
- Firefox — models run in the background page (no offscreen documents), sharing memory with everything else. Restart the browser if you see "no available backend found".
- Firefox is slower than Chrome — Firefox extensions cannot use shared memory for multi-threading (SharedArrayBuffer), so the model runs on one CPU thread. This is a Firefox platform limit, not an extension bug (Mozilla bug 1673477).
- Google Translate uses the unofficial free endpoint and may be rate-limited.

📄 Third-party notices
This project is inspired by ogkalu2/comic-translate — the bubble/text detector and the manga-finetuned LaMa inpainter are its ONNX exports, and the inference logic is ported from it. (OCR uses Baberu by genshiai-daichi.)

Bundled libraries, ported code, and runtime-downloaded models are listed with their licenses in THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — see LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
