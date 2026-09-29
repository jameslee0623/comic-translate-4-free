// Content script: final render overlay + debug inspector panel.
// Injected on demand by the service worker when a run finishes a stage.
// Classic script (no modules) — everything lives in this file.
(function () {
  if (window.__ctContentLoaded) return;
  window.__ctContentLoaded = true;

  const FONT_STACK = '"Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans",sans-serif';

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
  // the text box; -5px each side except ko/zh source.
  function renderAreaFor(block, srcLang) {
    let area = (block.text_class === 'text_bubble' && block.bubble_xyxy)
      ? shrinkBbox(block.bubble_xyxy, 0.3)
      : block.xyxy.slice();
    if (!['ko', 'zh-CN', 'zh-TW'].includes(srcLang)) {
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

  // Largest font size (initSize -> minSize, 0.75 steps) whose wrapped text fits.
  function fitFont(ctx, text, rw, rh, initSize, minSize, vertical) {
    let best = null;
    for (let size = initSize; size >= minSize - 1e-6; size -= 0.75) {
      ctx.font = `${size}px ${FONT_STACK}`;
      const lh = size * 1.18;
      let ok, lines;
      if (vertical) {
        // charsPerCol must be >= 1: rh < lh (tiny box) would give 0 and hang
        // wrapVertical forever on `i += 0`.
        const cols = wrapVertical(text, Math.max(1, Math.floor(rh / lh)));
        const colW = size * 1.05;
        ok = cols.length * colW <= rw;
        lines = cols;
      } else {
        lines = wrapGreedy(ctx, text, rw);
        const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
        ok = lines.length * lh <= rh && maxW <= rw;
      }
      if (ok) { best = { size, lines, lh }; break; }
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
  // model: each glyph occupies ~size^2 * lineHeight). The render then starts
  // from this size and only shrinks until the translation fits the area.
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
    const { size, lines, lh } = fitFont(ctx, text, rw, rh, autoSize, minSize, vertical);
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

  function findMainImage() {
    const imgs = [...document.images].filter(im => {
      if (!im.isConnected || !im.complete || !im.naturalWidth) return false;
      const r = im.getBoundingClientRect();
      return r.width >= 120 && r.height >= 120;
    });
    if (!imgs.length) { mainImgEl = null; return null; }
    imgs.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
    const im = imgs[0];
    mainImgEl = im;
    return { src: im.currentSrc || im.src, w: im.naturalWidth, h: im.naturalHeight };
  }

  // Direct pixels via page canvas. Throws (tainted canvas) when the image
  // host sends no CORS headers — the worker then tries a direct fetch.
  function mainImagePixels() {
    const im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null;
    if (!im) throw new Error('no main image');
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const cx = c.getContext('2d');
    cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height);
    return { data: d.data.buffer, w: c.width, h: c.height };
  }

  function replaceMainImage(dataUrl) {
    let im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null;
    // The stored element can go stale over a long pipeline (page re-rendered
    // the <img>); re-find it before giving up.
    if (!im) { findMainImage(); im = mainImgEl && mainImgEl.isConnected ? mainImgEl : null; }
    if (!im) return false;
    if (!im.dataset.ctOriginal) im.dataset.ctOriginal = im.currentSrc || im.src;
    im.removeAttribute('srcset');
    im.src = dataUrl;
    return true;
  }

  // ------------------------------------------------------------ status pill
  let pill = null, pillTimer = null;
  function ensurePill() {
    if (pill) return pill;
    pill = document.createElement('div');
    pill.id = 'ct-pill';
    pill.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1c1c22;color:#eee;' +
      'font:13px/1.4 sans-serif;padding:10px 14px;border-radius:10px;border:1px solid #444;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;max-width:340px;';
    document.documentElement.appendChild(pill);
    return pill;
  }
  function showPill(html, sticky) {
    const p = ensurePill();
    p.innerHTML = html;
    p.style.display = 'block';
    p.style.borderColor = '#444';
    clearTimeout(pillTimer);
    if (!sticky) pillTimer = setTimeout(() => { p.style.display = 'none'; }, 4000);
  }
  function showPillError(text) {
    const p = ensurePill();
    p.innerHTML = 'comic-translate-4-free — error: ' + esc(text) +
      ' <a href="#" id="ct-pill-x" style="color:#8ab4f8;margin-left:8px">dismiss</a>';
    p.style.display = 'block';
    p.style.borderColor = '#a33';
    const x = document.getElementById('ct-pill-x');
    if (x) x.onclick = e => { e.preventDefault(); p.style.display = 'none'; };
  }
  const PILL_STAGE = {
    capture: 'Capturing', detect: 'Detecting bubbles', blocks: 'Building blocks',
    ocr: 'Reading text', mask: 'Masking', translate: 'Translating',
    inpaint: 'Inpainting', render: 'Rendering',
  };
  function pillProgress(stage, progress) {
    showPill('comic-translate-4-free — ' + esc(PILL_STAGE[stage] || stage) +
      '… ' + Math.round((progress || 0) * 100) + '%');
  }

  // ------------------------------------------------------------ overlay DOM
  let overlay = null, canvas = null, ctx = null, debugPanel = null, debugBody = null, dbgBtn = null;  const stageTabs = {};   // stage -> payload
  const stageOrder = ['capture', 'detect', 'blocks', 'ocr', 'mask', 'inpaint', 'translate', 'render'];
  let currentRunId = null;
  let latestRunId = null;   // run the service worker last started for this tab

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
    canvas = document.createElement('canvas');
    // Vestigial: nothing ever paints into the overlay canvas (the translated
    // page replaces the <img> in place). Kept hidden so it takes no space.
    canvas.style.cssText = 'display:none;';
    wrap.appendChild(canvas);
    debugPanel = document.createElement('div');
    debugPanel.style.cssText = 'display:none;pointer-events:auto;width:340px;max-height:calc(100vh - 60px);overflow:auto;background:rgba(18,18,24,0.96);color:#ddd;font:12px sans-serif;border-left:1px solid #333;flex-direction:column;';
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
    ctx = canvas.getContext('2d');
  }

  function closeOverlay() {
    if (overlay) overlay.remove();
    overlay = null; canvas = null; ctx = null; debugPanel = null; debugBody = null;
    for (const k of Object.keys(stageTabs)) delete stageTabs[k];
    chrome.runtime.sendMessage({ type: 'ct/overlay-closed' }).catch(() => {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderDebugTab(stage) {
    const p = stageTabs[stage];
    if (!p) { debugBody.innerHTML = `<p style="color:#888">no data for "${esc(stage)}" yet</p>`; return; }
    let html = `<h3 style="margin:0 0 8px">${esc(p.title || stage)}</h3>`;
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
      html += p.crops.map(c =>
        `<div style="margin-bottom:8px;border-bottom:1px solid #333;padding-bottom:6px">` +
        `<img src="${c.thumb}" style="max-width:100%;background:#fff">` +
        `<div>#${c.id}: ${esc(c.text) || '<i style="color:#888">empty</i>'}</div></div>`
      ).join('');
    }
    if (p.rows) {
      html += '<table style="width:100%;border-collapse:collapse">' +
        p.rows.map(r =>
          `<tr><td style="border:1px solid #333;padding:3px">${esc(r.text)}</td>` +
          `<td style="border:1px solid #333;padding:3px;color:#8f8">${esc(r.translation)}</td></tr>`
        ).join('') + '</table>';
    }
    debugBody.innerHTML = html;
  }

  // ------------------------------------------------------------ messages
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('ct/')) return false;
    if (msg.type === 'ct/close-overlay') { closeOverlay(); sendResponse({ ok: true }); return false; }
    if (msg.type === 'ct/find-image') {
      try { sendResponse({ ok: true, image: findMainImage() }); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/get-image-pixels') {
      try { sendResponse({ ok: true, ...mainImagePixels() }); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    }
    if (msg.type === 'ct/run-progress') {
      if (!msg.direct) return false; // broadcasts are for the popup; the pill takes targeted copies
      const st = msg.stage;
      if (st === 'error') showPillError(msg.error || 'unknown error');
      else if (st === 'done') showPill('comic-translate-4-free — done ✓');
      else if (st === 'cancelled') showPill('comic-translate-4-free — cancelled');
      else if (st && st !== 'idle') pillProgress(st, msg.progress);
      return false;
    }
    if (msg.type === 'ct/run-started') {
      // The service worker's current run for this tab. Renders/debug output
      // from any older run (a page the user already left) are ignored — they
      // must never touch this page's DOM.
      latestRunId = msg.runId;
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'ct/debug-stage') {
      if (msg.runId !== latestRunId) { sendResponse({ ok: false, error: 'stale run' }); return false; }
      ensureOverlay();
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
          const renderT0 = performance.now();
          const work = document.createElement('canvas');
          work.width = width; work.height = height;
          const wctx = work.getContext('2d');
          // The inpainted page arrives as a PNG data URL (raw pixel buffers do
          // not survive extension messaging from the service worker).
          const baseImg = new Image();
          await new Promise((res, rej) => {
            baseImg.onload = res;
            baseImg.onerror = () => rej(new Error('could not decode the translated page image'));
            baseImg.src = imageDataUrl;
          });
          wctx.drawImage(baseImg, 0, 0, width, height);
          const settings = await chrome.storage.local.get('settings').then(r => r.settings || {});
          const maxSize = settings.initFontSize || 40, minSize = settings.minFontSize || 10;
          const srcLang = (blocks[0] && blocks[0].source_lang) || settings.sourceLang || 'ja';
          const renderInfo = [];
          for (const b of blocks) {
            const info = drawBlock(wctx, b, srcLang, maxSize, minSize);
            if (info) {
              b.render_xyxy = info.render_xyxy;
              b.render_font_size = info.render_font_size;
              renderInfo.push({ text: b.text, size: info.render_font_size, auto: info.auto_font_size, vertical: info.vertical });
            }
          }
          stageTabs['render'] = {
            title: 'Render',
            ms: Math.round(performance.now() - renderT0),
            rows: renderInfo.map(r => ({ text: r.text, translation: `${r.size}px (auto ${r.auto}px)${r.vertical ? ' vertical' : ''}` })),
          };
          let replaced = false;
          if (mode === 'replace') {
            // In-place: swap the page's original <img> for the translated one.
            // No overlay mask — the translation lives in the page itself.
            replaced = replaceMainImage(work.toDataURL('image/png'));
            if (replaced) {
              if (overlay) overlay.style.display = 'none';
            } else {
              showPillError('the page image changed before translation finished — reload the page to retry');
            }
          } else {
            showPillError('unexpected render mode — reload the page to retry');
          }
          const allTimings = { ...(timings || {}) };
          allTimings.render = Math.round(performance.now() - renderT0);
          const totalMs = allTimings.total != null
            ? allTimings.total
            : Object.entries(allTimings).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + (v || 0), 0);
          const ms = '<p style="color:#eee;font-size:14px">total: <b>' + totalMs + 'ms</b></p>' +
            '<p style="color:#888">' +
            Object.entries(allTimings).filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${v}ms`).join(' · ') + '</p>';
          if (debugBody) debugBody.insertAdjacentHTML('afterbegin', ms);
          if (debug) {
            ensureOverlay();
            overlay.style.display = 'flex';
            debugPanel.style.display = 'flex';
            if (dbgBtn) dbgBtn.textContent = 'Debug: on';
            renderDebugTab('render');
          }
          sendResponse({ ok: true, replaced });
        } catch (e) {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        }
      })();
      return true;
    }
    return false;
  });
})();
