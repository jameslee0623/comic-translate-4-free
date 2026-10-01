# Privacy Policy — comic-translate-4-free

Last updated: September 30, 2026

comic-translate-4-free is a browser extension that translates text inside comic
and manga page images. This policy explains what data the extension handles and
where that data goes.

## The short version

- The developer collects **no data**. There are no analytics, no tracking, no
  accounts, and no developer-run servers. Nothing you do with the extension is
  reported back to anyone.
- All machine learning — text detection, OCR, and inpainting — runs **locally
  in your browser**. Comic images never leave your device for processing.
- The only data that ever leaves your browser is the **recognized text** sent
  to the translation service **you choose** in settings, so it can be
  translated.

## Data processed locally (never transmitted)

- **Comic page images.** The extension reads the comic/manga image on the page
  you are viewing and processes it entirely on your device (detecting text
  regions, recognizing characters, erasing original text, rendering
  translations).
- **Your settings.** Source and target languages, translation backend and API
  keys, the allowed-sites list, model download state, and UI preferences are
  stored locally in your browser (`chrome.storage`). They are never sent
  anywhere.
- **Downloaded ML models.** The text detector, OCR, and inpainting models
  (~340 MB total) are downloaded once from Hugging Face and cached in your
  browser (IndexedDB) so translation works offline afterwards.
- **Translated page cache.** Pages you translate are cached for the current
  browser session only, so revisits load instantly. The cache is wiped when the
  browser closes.

## Data transmitted to third parties

To translate text, the extension must send the **recognized text** (and nothing
else — no images, no page URLs, no personal information) to the translation
service you selected in settings:

| Service | What is sent | Notes |
|---|---|---|
| Google Translate (default, free, no key) | Recognized text, source and target language codes | Subject to Google's privacy policy |
| Azure Translator | Same as above, plus your API key authenticates the request | Subject to Microsoft's privacy policy; key is stored locally |
| LM Studio | Same as above | Sent to the server URL you configured — commonly your own local machine, in which case data never leaves your device |

Image downloads are ordinary web requests: when the extension reads the page's
image from its host (or its CDN) or downloads models from Hugging Face, those
servers see the same request metadata any browser fetch would reveal. No
extension-specific identifiers are attached.

## Permissions and why they are needed

The extension requests browser permissions only to perform its single purpose —
translating comic images in place. Details are listed in the Chrome Web Store
and Firefox Add-ons listings. In particular, website content is accessed solely
to find and translate the comic image on pages you allow; the site-access gate
means translation never runs on sites you have not approved.

## Data retention

The developer retains nothing because nothing is collected. Locally stored data
(settings, cached models, session page cache) lives only in your browser: you
can clear the page cache from the options page, remove downloaded models from
the options page, and erase everything by removing the extension.

## Children

The extension is a general-purpose translation tool and is not directed at
children. Since no data is collected, there is nothing to delete on request —
but a parent or guardian can remove the extension and its local data at any
time via the browser.

## Changes to this policy

If the extension's data practices change, this policy will be updated and the
change noted in the release notes. Continued use of the extension after a
change constitutes acceptance of the updated policy.

## Contact

comic-translate-4-free is open source (MIT). For questions about this policy,
open an issue at https://github.com/jameslee0623/comic-translate-4-free.
