// Content script: final render overlay + debug inspector panel.
// Injected on demand by the service worker when a run finishes a stage.
// Classic script (no modules) — everything lives in this file.
(function () {
  if (window.__ctContentLoaded) return;
  window.__ctContentLoaded = true;

  const FONT_STACK = '"Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans",sans-serif';

  // Anti-right-click override: some sites block the context menu
  // (document.addEventListener('contextmenu', e => e.preventDefault())),
  // which also blocks the extension's "Send to comic-translate-4-free"
  // item. When the user right-clicks a picture, stop the event in the
  // capture phase — before the page's bubble-phase blocker runs — so
  // the browser still shows its menu. stopPropagation() does NOT call
  // preventDefault(), so the browser's default action (show the menu)
  // still happens, and the browser builds the menu from the clicked
  // element, so the image item still appears. Scoped to pictures only
  // so other custom menus (text, background) keep working. Registered
  // here, at content-script load, so it is in place before the user
  // right-clicks — the worker injects this script on page load for
  // allowed sites for exactly this reason.
  function unblockImageContextMenu(e) {
    const t = e.target;
    if (!t) return;
    const img = t.tagName === 'IMG' ? t : (t.closest ? t.closest('img') : null);
    if (img) e.stopPropagation();
  }
  window.addEventListener('contextmenu', unblockImageContextMenu, true);

  // Browser canvas size guards (mirrors src/shared/image-ops.js renderScale —
  // this is a classic script, no modules, so the constants are duplicated).
  // Chrome ~16384px side, Firefox ~11180, Safari ~4096-8192.
  const MAX_RENDER_MP = 16;
  const MAX_RENDER_SIDE = 8192;
  function renderScale(w, h) {
    if (!(w > 0 && h > 0)) return 1;
    return Math.min(1,
      Math.sqrt(MAX_RENDER_MP * 1e6 / (w * h)),
      MAX_RENDER_SIDE / Math.max(w, h));
  }

  // ------------------------------------------------------------ text utils
  // Port of ogkalu2/comic-translate's shrink_bbox (Apache License 2.0,
  // https://github.com/ogkalu2/comic-translate): `pct` is the TOTAL shrink, applied
  // centered, i.e. pct/2 inset per side. shrink_bbox(b, 0.3) leaves 70% of
  // the bubble's width/height (15% per side), NOT 40% (30% per side).
  function shrinkBbox(xyxy, pct) {
    const [x1, y1, x2, y2] = xyxy;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const w = (x2 - x1) * (1 - pct), h = (y2 - y1) * (1 - pct);
    if (w <= 0 || h <= 0) return [x1, y1, x2, y2];
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  }

  // Port of get_best_render_area + adjust_blks_size: bubble interior (ogkalu2's
  // shrink_bbox with 0.3 = 30% total shrink, i.e. 15% inset per side), else
  // the text box; -5px each side except zh source.
  function renderAreaFor(block, srcLang) {
    let area = (block.text_class === 'text_bubble' && block.bubble_xyxy)
      ? shrinkBbox(block.bubble_xyxy, 0.3)
      : block.xyxy.slice();
    // 5px inset was for Latin source text (to avoid bubble outlines).
    // Don't apply it to CJK sources — vertical CJK in small bubbles
    // gets over-shrunk (e.g. 44px bubble -> 20px render width).
    const isCjkSrc = ['ja', 'zh-CN', 'zh-TW', 'ko'].includes(srcLang);
    if (!isCjkSrc) {
      area = [area[0] + 5, area[1] + 5, area[2] - 5, area[3] - 5];
    }
    return area;
  }

  const isCJK = s => /[\u3040-\u30ff\u4e00-\u9faf\uac00-\ud7af]/.test(s);

  function wrapGreedy(ctx, text, maxW) {
    // word wrap for spaced text, char wrap for CJK / long words
    const words = text.split(/(\s+)/).filter(t => t.length);
    const lines = [];
    let cur = '';
    const push = () => { if (cur) lines.push(cur); cur = ''; };
    for (const w of words) {
      if (/^\s+$/.test(w)) { cur += w; continue; }
      const trial = cur + w;
      if (ctx.measureText(trial).width <= maxW || !cur.trim()) {
        if (ctx.measureText(trial).width <= maxW) { cur = trial; continue; }
        // single word too long: char-break it
        push();
        let cw = '';
        for (const ch of w) {
          if (ctx.measureText(cw + ch).width > maxW && cw) { lines.push(cw); cw = ''; }
          cw += ch;
        }
        cur = cw;
      } else {
        push();
        cur = w;
      }
    }
    push();
    // CJK: also break lines that are still too wide, char by char
    const out = [];
    for (const line of lines) {
      if (ctx.measureText(line).width <= maxW || !isCJK(line)) { out.push(line); continue; }
      let cw = '';
      for (const ch of line) {
        if (ctx.measureText(cw + ch).width > maxW && cw) { out.push(cw); cw = ''; }
        cw += ch;
      }
      if (cw) out.push(cw);
    }
    return out.filter(l => l.length);
  }

  // Largest font size in [minSize, initSize] whose wrapped text fits.
  // Binary search (~7 iterations) replaces the old 0.75px linear scan (~40
  // iterations, each doing a full wrap + measure pass). "Fits" is monotonic
  // in size, so the search converges to the largest fitting size.
  function fitFont(ctx, text, rw, rh, initSize, minSize, vertical) {
    // Early exit: degenerate box — skip the binary search entirely.
    if (!(rw > 0 && rh > 0)) {
      const size = minSize;
      ctx.font = `${size}px ${FONT_STACK}`;
      return vertical
        ? { size, lines: wrapVertical(text, 1), lh: size * 1.18 }
        : { size, lines: [text], lh: size * 1.18 };
    }
    const fits = (size) => {
      // Cache the font string per size probe — wrapGreedy/wrapVertical call
      // measureText many times but the font only changes here.
      ctx.font = `${size}px ${FONT_STACK}`;
      const lh = size * 1.18;
      if (vertical) {
        // charsPerCol must be >= 1: rh < lh (tiny box) would give 0 and hang
        // wrapVertical forever on `i += 0`.
        const cols = wrapVertical(text, Math.max(1, Math.floor(rh / lh)));
        return { ok: cols.length * (size * 1.05) <= rw, lines: cols, lh };
      }
      const lines = wrapGreedy(ctx, text, rw);
      const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
      return { ok: lines.length * lh <= rh && maxW <= rw, lines, lh };
    };
    let best = null;
    let lo = minSize, hi = initSize;
    // 10 iterations: 0.5px precision is enough (16 was overkill — each
    // iteration re-wraps and re-measures every line).
    for (let i = 0; i < 10 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      const r = fits(mid);
      if (r.ok) { best = { size: mid, lines: r.lines, lh: r.lh }; lo = mid; }
      else hi = mid;
    }
    if (!best) {
      const size = minSize;
      ctx.font = `${size}px ${FONT_STACK}`;
      best = vertical
        ? { size, lines: wrapVertical(text, Math.max(1, Math.floor(rh / (size * 1.18)))), lh: size * 1.18 }
        : { size, lines: wrapGreedy(ctx, text, rw), lh: size * 1.18 };
    }
    return best;
  }

  function wrapVertical(text, charsPerCol) {
    const clean = text.replace(/\s+/g, '');
    const cols = [];
    for (let i = 0; i < clean.length; i += charsPerCol) cols.push(clean.slice(i, i + charsPerCol));
    return cols.length ? cols : [''];
  }

  function luminance(css) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css || '');
    if (!m) return 0;
    return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  }

  // Auto font size from the ORIGINAL text: estimate the glyph size the source
  // text was set in from its detector text box and character count (area
  // model: each glyph occupies ~size^2 * lineHeight). The render starts
  // from 1.2x this size (capped by the maximum, floored by the minimum)
  // and only shrinks until the translation fits the area.
  function estimateFontSize(block, maxSize, minSize) {
    const text = (block.text || '').replace(/\s+/g, '');
    const n = Math.max(1, [...text].length);
    const xy = block.xyxy || [0, 0, 0, 0];
    const w = Math.max(1, xy[2] - xy[0]), h = Math.max(1, xy[3] - xy[1]);
    let est = Math.sqrt((w * h) / (n * 1.18));
    if (!isFinite(est) || est <= 0) est = maxSize;
    return Math.min(maxSize, Math.max(minSize, est));
  }

  function drawBlock(ctx, block, srcLang, maxSize, minSize) {
    const text = (block.translation || block.text || '').trim();
    if (!text) return null;
    const area = renderAreaFor(block, srcLang);
    const [x1, y1, x2, y2] = area;
    const rw = Math.max(8, x2 - x1), rh = Math.max(8, y2 - y1);
    const vertical = isCJK(text) && rh > rw * 1.5;
    const autoSize = estimateFontSize(block, maxSize, minSize);
    // Start from 1.2x the estimated original size (not maxSize): the estimate
    // is approximate (box area + char count), so 1.2x gives headroom to reach
    // the original size. fitFont then shrinks until it fits the box.
    // Capped by maxSize, floored by minSize — "not too big nor too small".
    const startSize = Math.min(maxSize, Math.max(minSize, autoSize * 1.2));
    const { size, lines, lh } = fitFont(ctx, text, rw, rh, startSize, minSize, vertical);
    ctx.font = `${size}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fg = block.font_color || '#000000';
    const outline = luminance(fg) > 0.5 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, size / 7);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.fillStyle = fg;
    // Hard guarantee: wrapped text stays inside the render area even when the
    // translation cannot fit at the minimum font size. The fit loop above
    // shrinks until it fits; this clip only bites in the fallback case.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y1, rw, rh);
    ctx.clip();
    if (vertical) {
      const colW = size * 1.05;
      const totalW = lines.length * colW;
      const startX = (x1 + x2) / 2 + totalW / 2 - colW / 2;
      lines.forEach((col, ci) => {
        const x = startX - ci * colW;
        const chars = [...col];
        const totalH = chars.length * lh;
        let y = y1 + (rh - totalH) / 2 + lh / 2;
        for (const ch of chars) {
          ctx.strokeText(ch, x, y);
          ctx.fillText(ch, x, y);
          y += lh;
        }
      });
    } else {
      const cx = (x1 + x2) / 2;
      const totalH = lines.length * lh;
      let y = y1 + (rh - totalH) / 2 + lh / 2;
      for (const line of lines) {
        ctx.strokeText(line, cx, y);
        ctx.fillText(line, cx, y);
        y += lh;
      }
    }
    ctx.restore();
    return { render_xyxy: area.map(v => Math.round(v)), render_font_size: Math.round(size * 10) / 10, auto_font_size: Math.round(autoSize * 10) / 10, vertical };
  }

  // ------------------------------------------------------------ main image
  // The page's own picture: largest fully-loaded <img> on the page.
  let mainImgEl = null;

  // Collect <img> elements from light DOM and shadow DOMs (some readers
  // render pages inside shadow roots; document.images misses those).
  // The shadow-root scan is cached per "image run" (see _imgScanCache) —
  // querySelectorAll('*') on every find is slow on large pages.
  let _imgScanCache = null;
  function invalidateImageCache() { _imgScanCache = null; }

  function collectShadowImages(root, depth, out) {
    if (depth > 3) return;
    let els;
    try { els = root.querySelectorAll('*'); } catch { return; }
    for (const el of els) {
      let sr = null;
      try { sr = el.shadowRoot; } catch { continue; }
      if (sr) {
        try { out.push(...sr.querySelectorAll('img')); } catch { /* best-effort */ }
        collectShadowImages(sr, depth + 1, out);
      }
    }
  }

  function allImages() {
    if (_imgScanCache) return _imgScanCache;
    const out = [...document.images];
    try {
      collectShadowImages(document, 0, out);
    } catch { /* shadow scan is best-effort */ }
    _imgScanCache = out;
    return out;
  }

  // Placeholder test matches only the path/filename — never the query
  // string (a legit URL like /img.png?placeholder=0 is not a placeholder).
  function isPlaceholderUrl(url) {
    const path = String(url || '').split(/[?#]/)[0];
    return /placeholder|blank|1x1|spacer/i.test(path);
  }

  // Lazy-load fallback: if the <img> src is a placeholder, try data-src /
  // data-original / data-lazy-src for the real URL. Falls back to `cur`
  // (even a placeholder) when no data-src is present — better than ''.
  function realSrc(im) {
    const cur = im.currentSrc || im.src || '';
    if (cur && !isPlaceholderUrl(cur)) return cur;
    return im.dataset.src || im.dataset.original || im.dataset.lazySrc ||
           im.getAttribute('data-src') || im.getAttribute('data-original') || cur;
  }

  function findMainImage() {
    const imgs = allImages().filter(im => {
      if (!im.isConnected || !im.complete || !im.naturalWidth) return false;
      const r = im.getBoundingClientRect();
      return r.width >= 120 && r.height >= 120;
    });
    if (!imgs.length) { mainImgEl = null; return null; }
    // Displayed size is what the user sees — the minimum-size gate uses it,
    // so a big file shown small (e.g. a 700x979 file at 350x490) does not run.
    // Biggest on screen first (displayed area, not file area).
    imgs.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    const im = imgs[0];
    mainImgEl = im;
    const cur = realSrc(im);
    // Already translated in place: the <img> now shows our rendered data URL
    // (the real url was kept in dataset.ctOriginal). Report the ORIGINAL url:
    // a multi-MB data URL in this message can break tabs.sendMessage (the
    // worker then reports "no picture found"), and the worker must download
    // the original — page-canvas pixels would be the already-translated
    // image, which would translate the translation and poison the page-cache
    // key so revisits never hit the cache.
    const wasTranslated = !!im.dataset.ctOriginal && /^data:/i.test(cur);
    const r = im.getBoundingClientRect();
    return {
      src: wasTranslated ? im.dataset.ctOriginal : cur,
      w: Math.round(r.width), h: Math.round(r.height),
      translated: wasTranslated,
    };
  }

  // Multi-pic: every qualifying <img> gets a stable uid (data-ct-uid). The
  // worker translates each picture and replaces it by uid, so any layout works
  // (long strips, galleries, grids). The uid prefix is random per content
  // script load, so a re-injection never collides with uids already in the DOM.
  const IMG_UID_PREFIX = 'ct' + Math.random().toString(36).slice(2, 8) + '_';
  let imgUidSeq = 0;
  function ensureImgUid(im) {
    if (!im.dataset.ctUid) im.dataset.ctUid = IMG_UID_PREFIX + (++imgUidSeq);
    return im.dataset.ctUid;
  }
  function imgElByUid(uid) {
    if (!uid) return null;
    // allImages() descends into shadow roots — querySelector does not.
    const el = allImages().find(im => im.dataset.ctUid === uid);
    return el && el.isConnected ? el : null;
  }
  // One <img> as the worker sees it. Displayed size is what the gate uses
  // (2.1.28), so w/h are on-screen, not file size. Already translated in
  // place? Report the ORIGINAL url (same reason as findMainImage).
  function describeImage(im) {
    const cur = realSrc(im);
    const wasTranslated = !!im.dataset.ctOriginal && /^data:/i.test(cur);
    const r = im.getBoundingClientRect();
    return {
      uid: ensureImgUid(im),
      src: wasTranslated ? im.dataset.ctOriginal : cur,
      w: Math.round(r.width), h: Math.round(r.height),
      translated: wasTranslated,
    };
  }
  // Every qualifying picture on the page, top to bottom in the layout
  // (not biggest first — James's order). The worker applies the minimum
  // image size and the per-run cap; this only skips tiny/hidden images.
  // Force every picture on the page to load (auto-translate only). Lazy
  // pictures below the fold have complete=false / naturalWidth=0 until
  // they load, so the inventory would skip them. This tries, in order:
  // Phase 0 (no scroll): tell each picture to load directly — native
  // loading=lazy becomes eager, a placeholder src is replaced by the
  // real URL from data-src/data-original/data-lazy-src, data-srcset
  // becomes srcset. This covers most lazy-load patterns with no scroll
  // at all. Phase 1 (scroll fallback, only for pictures still not
  // loaded — e.g. a JS observer that holds the URL in code, not in the
  // DOM): scroll through the page in viewport steps so each picture
  // enters the viewport, then jump back to where the user was BEFORE
  // waiting for the downloads — the fetches keep running in the
  // background once triggered, so the user is only displaced for the
  // brief scroll-through, not the whole download wait. The budgets below
  // are time limits so a huge / infinite-scroll page can never hang the
  // run — after the budget, translate whatever loaded. Returns
  // { loaded, total, ms, steps, directTriggered, scrolled }.
  async function forceLoadAllImages() {
    const t0 = Date.now();
    const BUDGET_MS = 15000; // whole force-load must fit in this
    const DIRECT_WAIT_MS = 5000; // longest to wait for direct triggers
    const DIRECT_STALL_MS = 1000; // no picture finished in this long: rest need scroll
    const STEP_WAIT_MS = 60; // let the lazy-load observer fire after each scroll step
    const MAX_STEPS = 200; // taller than this is effectively infinite scroll
    const startY = window.scrollY || 0, startX = window.scrollX || 0;
    const vh = Math.max(1, window.innerHeight || 800);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const pageHeight = () => document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const countPending = () => {
      let n = 0;
      for (const im of allImages()) if (im.isConnected && !im.complete) n++;
      return n;
    };
    let steps = 0, directTriggered = 0, scrolled = false;
    // Which pictures the direct phase actually triggered. A picture
    // still loading after the direct wait that WAS triggered is just
    // slow (or broken) — the scroll cannot help it. Only a picture
    // the direct phase could not trigger at all needs the scroll.
    const triggered = new Set();
    // Phase 0: trigger every picture to load directly, without moving
    // the viewport. Skip pictures already loaded, and never touch a
    // translated picture (its src is our rendered data URL, complete).
    for (const im of allImages()) {
      if (!im.isConnected || im.complete || im.dataset.ctOriginal) continue;
      const cur = im.src || '';
      const real = realSrc(im);
      if (im.loading === 'lazy') {
        try { im.loading = 'eager'; } catch {}
        directTriggered++; triggered.add(im);
      }
      // A placeholder src with a real URL in a data attribute: point src
      // at the real URL so the browser fetches it now.
      if (real && real !== cur && (isPlaceholderUrl(cur) || !cur)) {
        try { im.src = real; } catch {}
        directTriggered++; triggered.add(im);
      }
      // Responsive lazy-load: point srcset at the real set.
      const ds = im.dataset.srcset || im.getAttribute('data-srcset');
      if (ds && ds !== (im.srcset || '')) {
        try { im.srcset = ds; } catch {}
        directTriggered++; triggered.add(im);
      }
    }
    // Wait for the direct triggers to finish: stop when all are loaded,
    // when nothing finished for DIRECT_STALL_MS (the rest were never
    // triggered and need the scroll), or at DIRECT_WAIT_MS.
    {
      let lastPending = Infinity, stallSince = Date.now();
      for (;;) {
        const pending = countPending();
        if (!pending) break;
        if (pending < lastPending) { lastPending = pending; stallSince = Date.now(); }
        else if (Date.now() - stallSince >= DIRECT_STALL_MS) break;
        if (Date.now() - t0 >= DIRECT_WAIT_MS) break;
        await sleep(200);
      }
    }
    // Phase 1: scroll fallback, only for pictures the direct phase
    // could not trigger (a JS observer holding the URL in code). A
    // picture that was triggered but is still loading is just slow or
    // broken — the scroll cannot help it, so it does not scroll.
    // Restore the scroll position as soon as the scroll-through is
    // done, even if the scroll loop itself throws.
    const needsScroll = () => {
      for (const im of allImages()) {
        if (im.isConnected && !im.complete && !triggered.has(im)) return true;
      }
      return false;
    };
    if (needsScroll()) {
      scrolled = true;
      try {
        let lastH = 0;
        for (;;) {
          const h = pageHeight();
          const maxY = Math.max(0, h - vh);
          const y = Math.min(maxY, steps * vh);
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          steps++;
          await sleep(STEP_WAIT_MS);
          const h2 = pageHeight();
          // At the bottom and nothing new appeared: done scrolling.
          if (y >= maxY && h2 <= lastH) break;
          lastH = Math.max(lastH, h2);
          if (steps >= MAX_STEPS || Date.now() - t0 >= BUDGET_MS) break;
        }
      } finally {
        try { window.scrollTo({ top: startY, left: startX, behavior: 'instant' }); } catch {}
      }
    }
    // Phase 2: wait for the triggered loads to finish. The user is
    // already back at the top (or never moved), so this wait is
    // invisible — the pictures download in the background. Poll until
    // all are complete (or errored — complete is true then too), or the
    // budget runs out; then translate whatever loaded.
    for (;;) {
      if (!countPending()) break;
      if (Date.now() - t0 >= BUDGET_MS) break;
      await sleep(200);
    }
    let loaded = 0, total = 0;
    for (const im of allImages()) {
      if (!im.isConnected) continue;
      total++;
      if (im.complete && im.naturalWidth) loaded++;
    }
    return { loaded, total, ms: Date.now() - t0, steps, directTriggered, scrolled };
  }

  // Diagnostic for the last inventory, read by the ct/list-images handler.
  // Lists every big picture (natural size >= 500px) with its shown size and
  // whether it made the inventory — so a browser that shows a picture big
  // but does not list it is visible in the diag log.
  let lastInventoryDiag = '';
  // Full src URLs of every big picture (in the list and excluded), so the
  // worker can check host permission for ALL of them — not just the ones
  // that made the inventory.
  let lastBigSrcs = [];
  function collectPageImages() {
    const all = allImages();
    // Diagnostic — best-effort only. It must NEVER break the inventory:
    // if any read throws, the diag is replaced by an error note and the
    // filter below still runs.
    try {
      const reasons = { notConn: 0, notComplete: 0, noNat: 0, dispSmall: 0 };
      const bigLines = [];
      lastBigSrcs = [];
      let nBig = 0, nBigIn = 0;
      for (const im of all) {
        // Big is decided FIRST, from natural size OR width/height attributes.
        // On a 403 site a picture that failed to load has natural size 0, but
        // its width="1410" height="1000" attributes still say it is big — and
        // its src/host must reach the permission check, or the 403 pictures
        // stay invisible. (An earlier version checked natural size first and
        // skipped failed pictures before ever calling them big.)
        let attrW = 0, attrH = 0;
        try {
          attrW = parseInt(im.getAttribute('width') || '0', 10) || 0;
          attrH = parseInt(im.getAttribute('height') || '0', 10) || 0;
        } catch { /* attributes unreadable — treat as 0 */ }
        const isBig = Math.max(im.naturalWidth || 0, im.naturalHeight || 0) >= 500 || Math.max(attrW, attrH) >= 500;
        const r = im.getBoundingClientRect();
        const inList = !!(im.isConnected && im.complete && im.naturalWidth && r.width >= 120 && r.height >= 120);
        if (!im.isConnected) reasons.notConn++;
        else if (!im.complete) reasons.notComplete++;
        else if (!im.naturalWidth) reasons.noNat++;
        else if (!inList) reasons.dispSmall++;
        if (isBig) {
          nBig++;
          if (inList) nBigIn++;
          const src = im.currentSrc || im.src || '';
          lastBigSrcs.push(src);
          let loading = '';
          try { loading = (typeof im.getAttribute === 'function' && im.getAttribute('loading')) || ''; } catch { /* ignore */ }
          bigLines.push(`big nat ${im.naturalWidth || 0}x${im.naturalHeight || 0} attr ${attrW}x${attrH} disp ${Math.round(r.width)}x${Math.round(r.height)} complete ${im.complete} loading ${loading || '-'} in ${inList ? 'Y' : 'N'} ${src.slice(0, 60)}`);
        }
      }
      const docImgs = (typeof document !== 'undefined' && document.images) ? document.images.length : 0;
      const vpW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 0;
      const vpH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 0;
      lastInventoryDiag = `inventory total ${all.length} (document.images ${docImgs}) viewport ${vpW}x${vpH} big-pics ${nBigIn}/${nBig} in list; excluded notConn ${reasons.notConn} notComplete ${reasons.notComplete} noNat ${reasons.noNat} dispSmall ${reasons.dispSmall}\n` + bigLines.join('\n');
    } catch (e) {
      lastInventoryDiag = 'inventory diag failed: ' + String((e && e.message) || e).slice(0, 120);
    }
    const imgs = all.filter(im => {
      if (!im.isConnected || !im.complete || !im.naturalWidth) return false;
      const r = im.getBoundingClientRect();
      return r.width >= 120 && r.height >= 120;
    });
    imgs.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    return imgs.map(describeImage);
  }

  // The image the user right-clicked ("Send to comic-translate-4-free"): match
  // by live src, by the translated data URL now shown, or by the stashed
  // original (re-send of an already-translated image). No size filter — the
  // manual send bypasses the minimum image size on purpose.
  function findImageBySrc(srcUrl) {
    if (!srcUrl) return null;
    const im = allImages().find(im => {
      if (!im.isConnected || !im.complete || !im.naturalWidth) return false;
      const cur = realSrc(im);
      return cur === srcUrl || im.dataset.ctOriginal === srcUrl;
    });
    if (!im) return null;
    const cur = realSrc(im);
    const wasTranslated = !!im.dataset.ctOriginal && /^data:/i.test(cur);
    return {
      uid: ensureImgUid(im),
      src: wasTranslated ? im.dataset.ctOriginal : cur,
      w: Math.round(im.getBoundingClientRect().width), h: Math.round(im.getBoundingClientRect().height),
      translated: wasTranslated,
    };
  }

  // Canvas capture for one <img> element. Throws (tainted canvas) when the
  // image host sends no CORS headers — the worker then tries a direct fetch.
  // NOTE: raw pixel buffers CANNOT travel via extension messaging — Chrome
  // silently turns ArrayBuffers into {} in both directions (verified). So
  // the pixels go as a WebP data URL string, the same trick the render path
  // uses for the translated image.
  // Async blob encode (not toDataURL): toDataURL is fully synchronous and
  // freezes the page for 1-3s on multi-MP images. Note: HTMLCanvasElement
  // has toBlob (callback), not convertToBlob (that's OffscreenCanvas only).
  async function captureElementPixels(im) {
    // Canvas guard: natural size can exceed browser limits (e.g. 2000x15000).
    // Downscale to fit — the pipeline downscales to 6.5MP anyway.
    const s = renderScale(im.naturalWidth, im.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * s));
    c.height = Math.max(1, Math.round(im.naturalHeight * s));
    const cx = c.getContext('2d');
    cx.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((resolve, reject) =>
      c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.95));
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, w: c.width, h: c.height };
  }

  // Direct pixels via page canvas. With srcUrl, captures that specific image
  // (the manual-send path); otherwise the main image. Throws (tainted
  // canvas) when the image host sends no CORS headers — the worker then
  // tries a direct fetch.
  async function mainImagePixels(srcUrl) {
    let im = null;
    if (srcUrl) {
      im = allImages().find(im => {
        if (!im.isConnected || !im.complete || !im.naturalWidth) return false;
        const cur = im.currentSrc || im.src || '';
        return cur === srcUrl || im.dataset.ctOriginal === srcUrl;
      });
      // Background-tab fallback: the tab IS the image (a single <img>).
      // If the image URL redirected, the exact match above fails even
      // though the picture is right there — use the only picture on the
      // page. Only when there is exactly one, so a normal multi-picture
      // page never picks the wrong one.
      if (!im) {
        const all = allImages().filter(x => x.isConnected && x.complete && x.naturalWidth);
        if (all.length === 1) im = all[0];
      }
    } else {
      im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null;
    }
    if (!im) throw new Error(srcUrl ? 'image not found on page' : 'no main image');
    return captureElementPixels(im);
  }

  // Multi-pic: pixels for the <img> a run named by uid.
  async function imagePixelsByUid(uid) {
    const im = imgElByUid(uid);
    if (!im) throw new Error('image left the page before translation finished — reload the page to retry');
    return captureElementPixels(im);
  }

  function replaceMainImage(dataUrl) {
    let im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null;
    // The stored element can go stale over a long pipeline (page re-rendered
    // the <img>); re-find it before giving up.
    if (!im) { findMainImage(); im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null; }
    if (!im) return false;
    // Always refresh the marker: on SPA-reused elements the old marker
    // points at a previous picture. Never overwrite with a data: URL —
    // on a re-render the element shows the old translation, and the
    // existing marker is the true original.
    const cur = im.currentSrc || im.src;
    if (cur && !/^data:/i.test(cur)) im.dataset.ctOriginal = cur;
    im.removeAttribute('srcset');
    im.src = dataUrl;
    return true;
  }

  // Multi-pic: swap the exact <img> a run named by uid. The stored element
  // can go stale over a long pipeline (page re-rendered the <img>); uid
  // lookup re-queries, so that case is covered too.
  function replaceImageByUid(uid, dataUrl) {
    const im = imgElByUid(uid);
    if (!im) return false;
    // Always refresh the marker: on SPA-reused elements the old marker
    // points at a previous picture. Never overwrite with a data: URL.
    const cur = im.currentSrc || im.src;
    if (cur && !/^data:/i.test(cur)) im.dataset.ctOriginal = cur;
    im.removeAttribute('srcset');
    im.src = dataUrl;
    return true;
  }

  // In-place replace for the manual-send path: swap the <img> matching
  // srcUrl (live src, shown data URL, or stashed original).
  function replaceImageBySrc(srcUrl, dataUrl) {
    const im = allImages().find(im => {
      if (!im.isConnected) return false;
      const cur = im.currentSrc || im.src || '';
      return cur === srcUrl || im.dataset.ctOriginal === srcUrl;
    });
    if (!im) return false;
    // Always refresh the marker to this render's original (srcUrl): on
    // SPA-reused elements the old marker points at a previous picture.
    // Never overwrite with a data: URL (re-translate after the run-start
    // clear wiped the marker) — any existing marker stays.
    if (srcUrl && !/^data:/i.test(srcUrl)) im.dataset.ctOriginal = srcUrl;
    im.removeAttribute('srcset');
    im.src = dataUrl;
    return true;
  }

  // ------------------------------------------------------------ status pill
  let pill = null, pillTimer = null;
  function ensurePill() {
    if (pill) {
      // The debug overlay shares the pill's max z-index but is appended
      // later, so it paints on top and hides the pill in debug mode.
      // Re-appending the pill moves it after the overlay, so it stays
      // visible even with the panel open.
      if (overlay) document.documentElement.appendChild(pill);
      return pill;
    }
    pill = document.createElement('div');
    pill.id = 'ct-pill';
    pill.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647;background:#1c1c22;color:#eee;' +
      'font:13px/1.4 sans-serif;padding:10px 14px;border-radius:10px;border:1px solid #444;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;max-width:340px;white-space:pre-wrap;';
    document.documentElement.appendChild(pill);
    return pill;
  }
  // Mirror of the pill's latest text inside the debug panel, so everything
  // the pill shows is also visible in the panel (plain text only — the
  // pill's buttons must not be duplicated with the same ids).
  function mirrorPillStatus(text) {
    try { if (debugStatus) debugStatus.textContent = text; } catch { /* never break the pill */ }
  }
  function showPill(html, sticky) {
    const p = ensurePill();
    p.innerHTML = html;
    p.style.display = 'block';
    p.style.borderColor = '#444';
    mirrorPillStatus(p.textContent);
    clearTimeout(pillTimer);
    if (!sticky) pillTimer = setTimeout(() => { p.style.display = 'none'; }, 4000);
  }
  function pillAllowLabel(host) {
    try {
      const m = chrome.i18n.getMessage('pill_allow_host', host);
      if (m) return m;
    } catch { /* fall through */ }
    return 'Allow ' + host;
  }
  function pillDeniedLabel() {
    try {
      const m = chrome.i18n.getMessage('pill_grant_denied');
      if (m) return m;
    } catch { /* fall through */ }
    return 'access denied — allow it from the popup';
  }
  function showPillError(text, grant) {
    const p = ensurePill();
    const errLabel = stageLabel('error');
    let html = 'comic-translate-4-free — ' + esc(errLabel) + ': ' + esc(text);
    if (grant && grant.host) {
      html += ' <button id="ct-pill-grant" style="margin-left:8px;padding:4px 10px;border:1px solid #1a73e8;border-radius:6px;' +
        'background:#1a73e8;color:#fff;font:600 12px sans-serif;cursor:pointer">' +
        esc(pillAllowLabel(grant.label || grant.host)) + '</button>';
    }
    html += ' <a href="#" id="ct-pill-x" style="color:#8ab4f8;margin-left:8px">' +
      esc(dismissLabel()) + '</a>';
    p.innerHTML = html;
    p.style.display = 'block';
    p.style.borderColor = '#a33';
    mirrorPillStatus(p.textContent);
    const x = document.getElementById('ct-pill-x');
    if (x) x.onclick = e => { e.preventDefault(); p.style.display = 'none'; };
    const g = document.getElementById('ct-pill-grant');
    if (g) g.onclick = e => {
      e.preventDefault();
      g.disabled = true;
      g.style.opacity = '.6';
      // Classic script (no modules): use the literal message type.
      chrome.runtime.sendMessage({ type: 'ct/grant-image-host', host: grant.host }, r => {
        if (r && r.ok) {
          // Granted — the worker re-runs the pipeline; hide the error.
          p.style.display = 'none';
        } else {
          g.disabled = false;
          g.style.opacity = '';
          g.textContent = pillDeniedLabel();
        }
      });
    };
  }
  // Stage labels come from the shared stage_* i18n keys (also used by the
  // popup), English fallback if a locale is missing one.
  const PILL_STAGE_FALLBACK = {
    capture: 'Capturing', detect: 'Detecting bubbles', blocks: 'Building blocks',
    ocr: 'Reading text', mask: 'Masking', translate: 'Translating',
    inpaint: 'Inpainting', render: 'Rendering',
  };
  function stageLabel(stage) {
    try {
      const m = chrome.i18n.getMessage('stage_' + stage);
      if (m) return m;
    } catch { /* extension contexts without i18n */ }
    return PILL_STAGE_FALLBACK[stage] || stage;
  }
  function dismissLabel() {
    try {
      const m = chrome.i18n.getMessage('pill_dismiss');
      if (m) return m;
    } catch { /* fall through */ }
    return 'dismiss';
  }
  // Generic pill message lookup with English fallback map for new keys.
  const PILL_MSG_FALLBACK = {
    pill_err_page_changed: 'the page image changed before translation finished — reload the page to retry',
    pill_err_render_mode: 'unexpected render mode — reload the page to retry',
  };
  function pillMsg(key) {
    try {
      const m = chrome.i18n.getMessage(key);
      if (m) return m;
    } catch { /* fall through */ }
    return PILL_MSG_FALLBACK[key] || key;
  }
  function pillProgress(stage, progress) {
    // Sticky for the whole run: the old non-sticky call armed a 4s auto-hide
    // on every update, so long stages (inpaint, translate) left the page with
    // no visible progress between updates. done/cancelled still auto-hide;
    // errors stay until dismissed.
    showPill('comic-translate-4-free — ' + esc(stageLabel(stage)) +
      ' ' + Math.round((progress || 0) * 100) + '%', true);
  }

  // ------------------------------------------------------------ completion chime
  // Short synthesized "ding" when a translation finishes. WebAudio only —
  // no audio file to ship. Best-effort: if the browser's autoplay policy
  // keeps the context suspended (no user interaction with the page yet),
  // we stay silent rather than show an error.
  let dingCtx = null;
  async function maybeDing() {
    try {
      const { settings } = await chrome.storage.local.get('settings');
      if (settings && settings.playDing === false) return; // default on
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      dingCtx = dingCtx || new AC();
      if (dingCtx.state === 'suspended') {
        try { await dingCtx.resume(); } catch { /* stay silent */ }
      }
      if (dingCtx.state !== 'running') return;
      const t0 = dingCtx.currentTime;
      for (const [freq, dt] of [[1046.5, 0], [1568.0, 0.14]]) { // C6 -> G6
        const o = dingCtx.createOscillator(), g = dingCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.6);
        o.connect(g);
        g.connect(dingCtx.destination);
        o.start(t0 + dt);
        o.stop(t0 + dt + 0.65);
      }
    } catch { /* sound must never break the page */ }
  }

  // ------------------------------------------------------------ overlay DOM
  let overlay = null, debugPanel = null, debugBody = null, dbgBtn = null, debugStatus = null;  const stageTabs = {};   // stage -> payload
  let lastRunTimes = null; // {totalMs, seqMs, breakdown} from the latest render — shown in the diaglog tab
  let currentDebugTab = null; // stage currently shown in the debug panel
  const stageOrder = ['capture', 'detect', 'blocks', 'ocr', 'mask', 'inpaint', 'translate', 'render', 'diaglog'];
  let currentRunId = null;
  let latestRunId = null;   // run the service worker last started for this tab

  // FIX3: content-script-held keep-alive Port. FIX2's self-connect Port
  // (both ends in the background) did not prevent the background dying
  // mid-run — a third run died at inpaint the same way. A Port whose
  // opener lives in a DIFFERENT context (this tab's content script) is
  // the documented keep-alive: an event page / worker stays alive while
  // it has an open channel to another context, and messages across it
  // count as activity resetting the idle timer (mere open, with no
  // messages, does not reliably reset timers on modern Chromium, and
  // Firefox likewise stays alive while the background "is doing
  // something periodically"). So this port also sends a heartbeat every
  // 20s while a run is active. Held in module scope so it is not GC'd.
  // Page unload disconnects it automatically, which is fine: the run
  // ends on navigation anyway. Best-effort everywhere; never throws.
  let tabKeepAlivePort = null;
  let tabKeepAliveRunId = null;
  let tabKeepAliveTimer = null;
  function openTabKeepAlive(runId) {
    try {
      if (tabKeepAlivePort && tabKeepAliveRunId === runId) return;
      closeTabKeepAlive();
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) return;
      const port = chrome.runtime.connect({ name: 'ct-keepalive-tab' });
      port.onDisconnect.addListener(() => {
        if (tabKeepAlivePort === port) {
          tabKeepAlivePort = null;
          tabKeepAliveRunId = null;
          if (tabKeepAliveTimer) { clearInterval(tabKeepAliveTimer); tabKeepAliveTimer = null; }
        }
      });
      tabKeepAlivePort = port;
      tabKeepAliveRunId = runId;
      // Heartbeat: a silent open port alone does not reliably reset idle
      // timers. One small message every 20s (under the ~30s idle clock)
      // is the activity that keeps the background alive during long runs.
      tabKeepAliveTimer = setInterval(() => {
        try {
          if (tabKeepAlivePort) tabKeepAlivePort.postMessage({ type: 'ct-keepalive-tab', runId: tabKeepAliveRunId });
          else if (tabKeepAliveTimer) { clearInterval(tabKeepAliveTimer); tabKeepAliveTimer = null; }
        } catch { closeTabKeepAlive(); }
      }, 20000);
    } catch { closeTabKeepAlive(); }
  }
  function closeTabKeepAlive(runId) {
    try {
      if (runId && tabKeepAliveRunId && tabKeepAliveRunId !== runId) return;
      if (tabKeepAliveTimer) { clearInterval(tabKeepAliveTimer); tabKeepAliveTimer = null; }
      if (tabKeepAlivePort) { try { tabKeepAlivePort.disconnect(); } catch {} }
    } catch {}
    tabKeepAlivePort = null;
    tabKeepAliveRunId = null;
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'ct-overlay';
    // Debug UI floats over the page WITHOUT dimming it: the backdrop is
    // transparent and click-through, so the original picture stays fully
    // visible (and the page stays usable) while stages are inspected.
    // pointer-events are re-enabled on the bar and the debug panel only.
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:none;display:none;flex-direction:column;align-items:flex-end;justify-content:flex-start;';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;padding:8px;align-items:center;color:#eee;font:13px sans-serif;pointer-events:auto;background:rgba(10,10,12,0.85);border-radius:0 0 0 8px;';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'padding:6px 12px;border:1px solid #555;border-radius:6px;background:#222;color:#eee;cursor:pointer;font:13px sans-serif;';
      b.onclick = fn;
      return b;
    };
    const title = document.createElement('span');
    title.textContent = 'comic-translate-4-free';
    title.style.cssText = 'font-weight:600;margin-right:8px;';
    bar.appendChild(title);
    const dbgBtnEl = mkBtn('Debug: off', () => {
      const on = debugPanel.style.display === 'none';
      debugPanel.style.display = on ? 'flex' : 'none';
      dbgBtnEl.textContent = on ? 'Debug: on' : 'Debug: off';
    });
    dbgBtn = dbgBtnEl;
    bar.appendChild(dbgBtn);
    bar.appendChild(mkBtn('✕ Close', closeOverlay));
    overlay.appendChild(bar);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;display:flex;min-height:0;width:100%;justify-content:flex-end;';
    debugPanel = document.createElement('div');
    debugPanel.style.cssText = 'display:none;pointer-events:auto;width:340px;max-height:calc(100vh - 60px);overflow:auto;background:rgba(18,18,24,0.96);color:#ddd;font:12px sans-serif;border-left:1px solid #333;flex-direction:column;';
    // Status line mirroring the pill (first child, so it is visible when
    // the panel opens). Initialized from the pill's current text, then kept
    // in sync by showPill/showPillError.
    debugStatus = document.createElement('div');
    debugStatus.style.cssText = 'padding:8px;border-bottom:1px solid #333;color:#eee;white-space:pre-wrap;';
    debugStatus.textContent = pill ? pill.textContent : '';
    debugPanel.appendChild(debugStatus);
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px;position:sticky;top:0;background:#16161a;';
    debugPanel.appendChild(tabBar);
    debugBody = document.createElement('div');
    debugBody.style.cssText = 'padding:8px;';
    debugPanel.appendChild(debugBody);
    stageOrder.forEach(st => {
      const b = document.createElement('button');
      b.textContent = st;
      b.style.cssText = 'padding:4px 8px;background:#222;border:1px solid #444;color:#ccc;border-radius:4px;cursor:pointer;font:11px sans-serif;';
      b.onclick = () => renderDebugTab(st);
      tabBar.appendChild(b);
    });
    wrap.appendChild(debugPanel);
    overlay.appendChild(wrap);
    document.documentElement.appendChild(overlay);
  }

  function closeOverlay() {
    if (overlay) overlay.remove();
    overlay = null; debugPanel = null; debugBody = null; debugStatus = null;
    for (const k of Object.keys(stageTabs)) delete stageTabs[k];
    lastRunTimes = null; currentDebugTab = null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderDebugTab(stage) {
    const p = stageTabs[stage];
    currentDebugTab = stage;
    if (!p) { debugBody.innerHTML = `<p style="color:#888">no data for "${esc(stage)}" yet</p>`; return; }
    // The total + per-stage times live in the diaglog tab (moved from the
    // render tab): they come from the render message, not the log payload,
    // so the diaglog tab reads them from lastRunTimes.
    const times = stage === 'diaglog' ? lastRunTimes : p;
    let html = `<h3 style="margin:0 0 8px">${esc(p.title || stage)}`;
    if (stage === 'diaglog' && p.log) html += ` <button id="ct-copy-log" style="margin-left:8px;padding:4px 8px;background:#222;border:1px solid #444;color:#ccc;border-radius:4px;cursor:pointer;font:11px sans-serif;vertical-align:middle">Copy</button>`;
    html += `</h3>`;
    // Capture tab (2.1.28): show the captured picture's size — dimensions
    // (after renderScale) and the download bytes when known. This is the
    // number the minImageSize gate uses, so a run on a small picture
    // explains itself here instead of in the log.
    if (stage === 'capture' && p.w != null && p.h != null) {
      html += `<p style="color:#eee;margin:0 0 8px">size: <b>${p.w}×${p.h}</b>${p.bytes != null ? ` · ${Number(p.bytes).toLocaleString('en-US')} bytes` : ''}</p>`;
    }
    if (times && times.totalMs != null) {
      html += `<p style="color:#eee;font-size:14px;margin:0 0 4px">total: <b>${times.totalMs}ms</b>`;
      if (times.seqMs != null && times.seqMs > times.totalMs) {
        html += ` <span style="color:#8f8;font-size:12px">(parallelism saved ${times.seqMs - times.totalMs}ms vs sequential ${times.seqMs}ms)</span>`;
      }
      html += `</p>`;
      if (times.breakdown) html += `<p style="color:#888;margin:0 0 8px">${esc(times.breakdown)}</p>`;
    }
    if (p.log) html += `<pre style="white-space:pre-wrap;word-break:break-all;color:#ddd;font:11px monospace;max-height:60vh;overflow:auto;border:1px solid #444;padding:8px">${esc(p.log)}</pre>`;
    if (p.ms != null) html += `<p style="color:#888">${p.ms} ms</p>`;
    if (p.error) html += `<p style="color:#f66">${esc(p.error)}</p>`;
    if (p.image) html += `<img src="${p.image}" style="max-width:100%;border:1px solid #444">`;
    if (p.mask) html += `<img src="${p.mask}" style="max-width:100%;border:1px solid #444">`;
    if (p.boxes) {
      html += `<p>${p.boxes.length} boxes (threshold ${esc(p.threshold)})</p>`;
      html += '<table style="width:100%;border-collapse:collapse">' +
        p.boxes.slice(0, 60).map(b =>
          `<tr><td style="border:1px solid #333;padding:2px">${b.label === 0 ? 'bubble' : 'text'}</td>` +
          `<td style="border:1px solid #333;padding:2px">${b.score.toFixed(2)}</td>` +
          `<td style="border:1px solid #333;padding:2px">${b.xyxy.map(v => Math.round(v)).join(',')}</td></tr>`
        ).join('') + '</table>';
      if (p.boxes.length > 60) html += `<p style="color:#888">…and ${p.boxes.length - 60} more</p>`;
    }
    if (p.blocks) {
      html += '<table style="width:100%;border-collapse:collapse">' +
        p.blocks.map(b =>
          `<tr><td style="border:1px solid #333;padding:2px">${b.i}</td>` +
          `<td style="border:1px solid #333;padding:2px">${esc(b.text_class)}</td>` +
          `<td style="border:1px solid #333;padding:2px">${b.xyxy.join(',')}</td></tr>`
        ).join('') + '</table>';
    }
    if (p.crops) {
      html += p.crops.map(c => {
        const n = c.chars != null ? c.chars : (c.text || '').length;
        // Baberu v1.1 reads up to ~256 chars; a crop hitting that ceiling gets
        // re-OCR'd in overlapping chunks (rare).
        const cap = c.hitCeiling
          ? ` <span style="color:#fc6">⚠ 256-char model cap` +
            (c.chunks > 1 ? ` — re-OCR'd in ${c.chunks} chunks` : ' — could not split further') + `</span>`
          : '';
        const looped = c.stopped === 'limit'
          ? ` <span style="color:#f88">⚠ hit the 128-token safety cap (output degenerate)</span>` : '';
        return `<div style="margin-bottom:8px;border-bottom:1px solid #333;padding-bottom:6px">` +
          `<img src="${c.thumb}" style="max-width:100%;background:#fff">` +
          `<div>#${c.id}: ${esc(c.text) || '<i style="color:#888">empty</i>'}</div>` +
          `<div style="color:#888">${n} chars${cap}${looped}</div></div>`;
      }).join('');
    }
    if (p.rows) {
      html += '<table style="width:100%;border-collapse:collapse">' +
        p.rows.map(r =>
          `<tr><td style="border:1px solid #333;padding:3px">${esc(r.text)}</td>` +
          `<td style="border:1px solid #333;padding:3px;color:#8f8">${esc(r.translation)}</td></tr>`
        ).join('') + '</table>';
    }
    debugBody.innerHTML = html;
    // Copy button (diaglog tab only): copies the times (total + per-stage)
    // above the log text.
    const copyBtn = debugBody.querySelector('#ct-copy-log');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const done = (t) => { copyBtn.textContent = t; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); };
        let text = p.log || '';
        if (lastRunTimes) {
          const saved = lastRunTimes.seqMs != null && lastRunTimes.seqMs > lastRunTimes.totalMs
            ? ` (parallelism saved ${lastRunTimes.seqMs - lastRunTimes.totalMs}ms vs sequential ${lastRunTimes.seqMs}ms)` : '';
          text = `total: ${lastRunTimes.totalMs}ms${saved}\n${lastRunTimes.breakdown}\n\n${text}`;
        }
        try { await navigator.clipboard.writeText(text); done('Copied'); }
        catch {
          try {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
            done('Copied');
          } catch { done('Copy failed'); }
        }
      };
    }
  }

  // ------------------------------------------------------------ messages
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('ct/')) return false;
    // Fresh image scan per message ("run"): the DOM may have changed since
    // the last scan (lazy-load, SPA navigation).
    invalidateImageCache();
    if (msg.type === 'ct/find-image') {
      try { sendResponse({ ok: true, image: findMainImage() }); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/find-image-by-src') {
      try { sendResponse({ ok: true, image: findImageBySrc(msg.srcUrl) }); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/get-image-pixels') {
      mainImagePixels(msg.srcUrl).then(
        r => sendResponse({ ok: true, ...r }),
        e => sendResponse({ ok: false, error: String((e && e.message) || e) })
      );
      return true; // async response
    }
    if (msg.type === 'ct/force-load-images') {
      // Auto-translate only: scroll the page to load every lazy picture
      // before the inventory is taken, then jump back. Async — the reply
      // carries how many pictures loaded.
      forceLoadAllImages().then(
        r => sendResponse({ ok: true, ...r }),
        e => sendResponse({ ok: false, error: String((e && e.message) || e) })
      );
      return true; // async response
    }
    if (msg.type === 'ct/list-images') {
      // Multi-pic inventory: every qualifying picture, top to bottom.
      try { const images = collectPageImages(); sendResponse({ ok: true, images, total: allImages().length, diag: lastInventoryDiag, bigSrcs: lastBigSrcs }); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/list-image-hosts') {
      // Distinct hosts of every picture's real address (src or data-src),
      // loaded or not — the access grant must cover ALL of them, not just
      // the biggest picture's host. The background-tab fallback injects
      // into a tab on the picture's host, so a host missing from the
      // grant fails there with "Missing host permission for the tab".
      try {
        const hosts = new Set();
        for (const im of allImages()) {
          try {
            const u = realSrc(im);
            if (u && /^https?:\/\//i.test(u)) hosts.add(new URL(u).hostname.toLowerCase());
          } catch {}
        }
        sendResponse({ ok: true, hosts: [...hosts] });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/get-image-pixels-by-uid') {
      imagePixelsByUid(msg.uid).then(
        r => sendResponse({ ok: true, ...r }),
        e => sendResponse({ ok: false, error: String((e && e.message) || e) })
      );
      return true; // async response
    }
    if (msg.type === 'ct/run-summary') {
      // End-of-run report from the worker: the popup is usually closed by
      // the time the last picture finishes, so the page pill carries the
      // outcome (translated / failed / tiny images skipped). A resumed run
      // says so and counts the pictures the dead run already finished.
      const n = (msg && msg.images) || 0;
      const failed = (msg && msg.failed) || [];
      const ignored = (msg && msg.ignored) || 0;
      const resumed = !!(msg && msg.resumed);
      const alreadyDone = (msg && msg.alreadyDone) || 0;
      if (failed.length) {
        showPillError(`run finished${resumed ? ' (resumed)' : ''} — ${n} translated, ${failed.length} not: ` +
          failed.slice(0, 2).join('; ') + (failed.length > 2 ? ' …' : '') +
          ' — full list in the popup');
      } else if (resumed) {
        showPill(`comic-translate-4-free — resumed ✓ (${n} more translated, ${alreadyDone} already done)`);
      } else if (n > 1 || ignored) {
        showPill(`comic-translate-4-free — done ✓ (${n} translated` +
          (ignored ? `, ${ignored} tiny/hidden images skipped` : '') + ')');
      }
      return false;
    }
    if (msg.type === 'ct/fetch-image-bytes') {
      // Download the image inside the PAGE (not the service worker): the
      // browser applies the page's real referrer policy and cookies, exactly
      // like the page's own <img> load. Some image hosts / WAFs 403 the
      // service worker's fetch because its Referer and Sec-Fetch-* headers
      // don't match what the page itself sends. The extension's host
      // permissions let the content script read the cross-origin response.
      // The bytes travel back as a data URL string: raw ArrayBuffers are
      // silently emptied by extension messaging (verified), so binary goes
      // the same string route the render path uses for the translated PNG.
      (async () => {
        try {
          // credentials:'include' — send the page's cookies like its own
          // <img> does. Cookie-gated image hosts 403 without them.
          const res = await fetch(msg.srcUrl, { credentials: 'include' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          if (!blob.size) throw new Error('empty response body');
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('read failed'));
            reader.readAsDataURL(blob);
          });
          sendResponse({ ok: true, dataUrl });
        } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e).slice(0, 120) }); }
      })();
      return true;
    }
    if (msg.type === 'ct/pill-notice') {
      // Custom pill message from the SW (e.g. 403-fallback status). Sticky
      // keeps it visible while the background work runs.
      showPill('comic-translate-4-free — ' + esc(msg.text || ''), !!msg.sticky);
      return false;
    }
    if (msg.type === 'ct/run-progress') {
      if (!msg.direct) return false; // broadcasts are for the popup; the pill takes targeted copies
      const st = msg.stage;
      // FIX3: terminal progress ends the run — release the tab-held keep-alive.
      if (st === 'error' || st === 'done' || st === 'cancelled') closeTabKeepAlive(msg.runId);
      if (st === 'error') showPillError(msg.error || stageLabel('error'),
        msg.grantHost ? { host: msg.grantHost, label: msg.grantLabel } : null);
      else if (st === 'done') { showPill('comic-translate-4-free — ' + esc(stageLabel('done')) + ' ✓' + (msg.cached ? ' (from cache)' : msg.backendLabel ? ' (' + esc(msg.backendLabel) + ')' : '')); maybeDing(); }
      else if (st === 'cancelled') showPill('comic-translate-4-free — ' + esc(stageLabel('cancelled')));
      else if (st && st !== 'idle') pillProgress(st, msg.progress);
      return false;
    }
    if (msg.type === 'ct/run-started') {
      // The service worker's current run for this tab. Renders/debug output
      // from any older run (a page the user already left) are ignored — they
      // must never touch this page's DOM.
      latestRunId = msg.runId;
      openTabKeepAlive(msg.runId); // FIX3: tab-held keep-alive for this run.
      // Clear stale original-image markers from a previous run (SPA
      // navigation can leave them behind; a new run must not resolve
      // against the old page's stashed URLs). allImages() also descends
      // into shadow roots — querySelectorAll does not, so a stale marker
      // inside a shadow box survived the clear.
      try {
        allImages().forEach(im => {
          delete im.dataset.ctOriginal;
        });
      } catch { /* best-effort */ }
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'ct/debug-stage') {
      if (msg.runId !== latestRunId) { sendResponse({ ok: false, error: 'stale run' }); return false; }
      ensureOverlay();
      // New run: drop the previous run's stage payloads (each holds a data
      // URL image). Keeps memory bounded across runs.
      if (currentRunId !== msg.runId) {
        for (const k of Object.keys(stageTabs)) delete stageTabs[k];
        lastRunTimes = null;
      }
      currentRunId = msg.runId;
      stageTabs[msg.stage] = msg.payload;
      if (msg.debug) {
        overlay.style.display = 'flex';
        debugPanel.style.display = 'flex';
        if (dbgBtn) dbgBtn.textContent = 'Debug: on';
      }
      renderDebugTab(msg.stage);
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'ct/render') {
      // A render from a run that is no longer current (user changed page and
      // a new run started, or this run was cancelled) must never touch the page.
      if (msg.runId !== latestRunId) { sendResponse({ ok: false, error: 'stale run' }); return false; }
      (async () => {
        try {
          currentRunId = msg.runId;
          const { imageDataUrl, width, height, blocks, timings, debug, mode } = msg;
          // Compose the final translated page on a scratch canvas.
          // Canvas guard: downscale if over browser limits; draw blocks in
          // original coordinates via ctx.scale so text layout is unchanged.
          const renderT0 = performance.now();
          const rs = renderScale(width, height);
          const work = document.createElement('canvas');
          work.width = Math.max(1, Math.round(width * rs));
          work.height = Math.max(1, Math.round(height * rs));
          const wctx = work.getContext('2d');
          // The inpainted page arrives as a WebP data URL (raw pixel buffers do
          // not survive extension messaging from the service worker).
          const baseImg = new Image();
          await new Promise((res, rej) => {
            baseImg.onload = res;
            baseImg.onerror = () => rej(new Error('could not decode the translated page image'));
            baseImg.src = imageDataUrl;
          });
          wctx.drawImage(baseImg, 0, 0, work.width, work.height);
          if (rs < 1) wctx.scale(rs, rs);
          const settings = await chrome.storage.local.get('settings').then(r => r.settings || {});
          // Font size bounds are fixed now (the Maximum/Minimum settings
          // were removed in 1.2.6): 120px cap, 10px floor. Sizing starts
          // from the estimated original size (see drawBlock), so the
          // bounds rarely bind.
          const maxSize = 120, minSize = 10;
          const srcLang = (blocks[0] && blocks[0].source_lang) || settings.sourceLang || 'ja';
          const renderInfo = [];
          for (const b of blocks) {
            const info = drawBlock(wctx, b, srcLang, maxSize, minSize);
            if (info) {
              // render_xyxy is debug info in original coordinates; scale to
              // match the downscaled output when the guard kicked in.
              b.render_xyxy = rs < 1 ? info.render_xyxy.map(v => Math.round(v * rs)) : info.render_xyxy;
              b.render_font_size = info.render_font_size;
              renderInfo.push({ text: b.text, size: info.render_font_size, auto: info.auto_font_size, vertical: info.vertical });
            }
          }
          let replaced = false;
          if (mode === 'replace') {
            // In-place: swap the page's original <img> for the translated one.
            // No overlay mask — the translation lives in the page itself.
            // The multi-pic path names the exact <img> (msg.uid); the
            // manual-send path names it by src (msg.srcUrl); the auto path
            // replaces the detected main image.
            // Async blob encode (not toDataURL): toDataURL is fully synchronous
            // and freezes the page for 1-3s on multi-MP images.
            // Note: HTMLCanvasElement has toBlob (callback), not convertToBlob
            // (that's OffscreenCanvas only).
            const blob = await new Promise((resolve, reject) =>
              work.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.95));
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error || new Error('read failed'));
              reader.readAsDataURL(blob);
            });
            replaced = msg.uid ? replaceImageByUid(msg.uid, dataUrl)
              : msg.srcUrl ? replaceImageBySrc(msg.srcUrl, dataUrl)
              : replaceMainImage(dataUrl);
            if (replaced) {
              if (overlay) overlay.style.display = 'none';
            } else {
              showPillError(pillMsg('pill_err_page_changed'));
            }
          } else {
            showPillError(pillMsg('pill_err_render_mode'));
          }
          const allTimings = { ...(timings || {}) };
          allTimings.render = Math.round(performance.now() - renderT0);
          const totalMs = allTimings.total != null
            ? allTimings.total
            : Object.entries(allTimings).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + (v || 0), 0);
          const seqMs = Object.entries(allTimings).filter(([k]) => k !== 'total' && k !== 'render').reduce((a, [, v]) => a + (v || 0), 0);
          stageTabs['render'] = {
            title: 'Render',
            ms: allTimings.render,
            rows: renderInfo.map(r => ({ text: r.text, translation: `${r.size}px (auto ${r.auto}px)${r.vertical ? ' vertical' : ''}` })),
          };
          // Total + per-stage times live in the diaglog tab now, not here.
          lastRunTimes = {
            totalMs,
            seqMs,
            breakdown: Object.entries(allTimings).filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${v}ms`).join(' · '),
          };
          if (debug) {
            ensureOverlay();
            overlay.style.display = 'flex';
            debugPanel.style.display = 'flex';
            if (dbgBtn) dbgBtn.textContent = 'Debug: on';
            renderDebugTab('render');
          }
          sendResponse({ ok: true, replaced });
          closeTabKeepAlive(msg.runId); // FIX3: render done, run over.
        } catch (e) {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        }
      })();
      return true;
    }
    return false;
  });
})();
