// Firefox entry point (loaded by background.html).
// Firefox MV3 has no chrome.offscreen API, but a background page has full DOM
// access — so the ML sessions live here, in-process. Importing offscreen.js
// constructs the Detector/OCR/Inpainter singletons; we publish their
// message handlers on globalThis so ml-bridge.js calls them directly instead
// of going through the offscreen document. service-worker.js then runs the
// whole pipeline unchanged in this page.
//
// Static imports (not await import) so the module graph loads in parallel and
// the runtime message listener in service-worker.js registers ASAP. If any
// import fails, we log it visibly — a silent background page is the hardest
// bug to diagnose.
import { mlHandlers } from '../offscreen/offscreen.js';
import './service-worker.js';

globalThis.__ctMlHandlers = mlHandlers;
globalThis.__ctBgReady = true;
