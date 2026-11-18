// Learned next-page rules — pure helpers, no chrome APIs.
// A rule is learned from real URL changes only: the user moves from one page
// to another on the same site and exactly one number in the URL goes up by 1.
// A rule becomes active after LEARN_REPEATS observations of the same pattern
// and is forgotten after LEARN_MAX_MISSES misses in a row.
// Guard: the URL must carry at least 2 digit runs, so a bare id change
// (one gallery -> the next gallery) is never learned as "next page" — the
// built-in +1 rules already cover single-number URLs.
// A rule is { pattern, count, misses }, keyed by its shape (the URL with
// every digit run replaced by '{n}'). Rules are stored per shape, so one
// site can hold several (gallery pages vs image pages, …).
export const LEARN_REPEATS = 2;
export const LEARN_MAX_MISSES = 10;

// The rule key: origin + path + query with every digit run masked.
export function urlShape(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\d+/g, '{n}') + u.search.replace(/\d+/g, '{n}');
  } catch { return null; }
}

// Count the digit runs in a URL's path + query (port digits excluded).
function digitRunCount(url) {
  try {
    const u = new URL(url);
    return ((u.pathname + u.search).match(/\d+/g) || []).length;
  } catch { return 0; }
}

// Learn a next-page pattern from one real navigation, or null.
export function learnPattern(oldUrl, newUrl) {
  let a, b;
  try { a = new URL(oldUrl); b = new URL(newUrl); } catch { return null; }
  if (a.origin !== b.origin || a.href === b.href) return null;
  const shape = urlShape(oldUrl);
  if (!shape || shape !== urlShape(newUrl)) return null;
  const sa = a.pathname.split('/'), sb = b.pathname.split('/');
  if (sa.length !== sb.length) return null;
  let diff = null;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] === sb[i]) continue;
    if (diff) return null; // two segments changed: not a page turn
    diff = { i, from: sa[i], to: sb[i] };
  }
  if (diff) {
    // Same series needs a second number that stayed put (gallery id, …),
    // and the changed number must be the LAST digit run in the URL —
    // otherwise a gallery hop (id +1, page unchanged) would be learned
    // as "next page".
    if (digitRunCount(oldUrl) < 2) return null;
    const after = sa.slice(diff.i + 1).join('/') + a.search;
    if (/\d/.test(after)) return null;
    if (/^\d+$/.test(diff.from) && /^\d+$/.test(diff.to) &&
        parseInt(diff.to, 10) === parseInt(diff.from, 10) + 1) {
      return { kind: 'seg', index: diff.i, shape };
    }
    const ma = /^(\d+)-(\d+)$/.exec(diff.from), mb = /^(\d+)-(\d+)$/.exec(diff.to);
    if (ma && mb && ma[1] === mb[1] &&
        parseInt(mb[2], 10) === parseInt(ma[2], 10) + 1) {
      return { kind: 'dash', index: diff.i, shape };
    }
    return null;
  }
  // No path change: exactly one query param changed, +1, named page/p.
  // No digit-count guard here — the identical path is the series evidence.
  if (a.search === b.search) return null;
  const qa = new URLSearchParams(a.search), qb = new URLSearchParams(b.search);
  const keys = new Set([...qa.keys(), ...qb.keys()]);
  let qdiff = null;
  for (const k of keys) {
    const va = qa.get(k), vb = qb.get(k);
    if (va === vb) continue;
    if (qdiff) return null;
    qdiff = { k, va, vb };
  }
  if (!qdiff) return null;
  if ((qdiff.k === 'page' || qdiff.k === 'p') &&
      /^\d+$/.test(qdiff.va || '') && /^\d+$/.test(qdiff.vb || '') &&
      parseInt(qdiff.vb, 10) === parseInt(qdiff.va, 10) + 1) {
    return { kind: 'query', name: qdiff.k, shape };
  }
  return null;
}

// Build the next URL from a learned pattern, or null when the URL does not
// match the pattern's shape.
export function applyPattern(pattern, url) {
  if (!pattern || urlShape(url) !== pattern.shape) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (pattern.kind === 'seg' || pattern.kind === 'dash') {
    const segs = u.pathname.split('/');
    const s = segs[pattern.index];
    if (pattern.kind === 'seg') {
      if (!/^\d+$/.test(s || '')) return null;
      segs[pattern.index] = String(parseInt(s, 10) + 1);
    } else {
      const m = /^(\d+)-(\d+)$/.exec(s || '');
      if (!m) return null;
      segs[pattern.index] = m[1] + '-' + String(parseInt(m[2], 10) + 1);
    }
    u.pathname = segs.join('/');
    return u.href;
  }
  if (pattern.kind === 'query') {
    const q = new URLSearchParams(u.search);
    const v = q.get(pattern.name);
    if (!/^\d+$/.test(v || '')) return null;
    q.set(pattern.name, String(parseInt(v, 10) + 1));
    u.search = q.toString();
    return u.href;
  }
  return null;
}

// The number at the pattern's increment spot, for the forward/back check
// (a forward jump past the prediction is a miss; going back never is).
export function patternNumber(pattern, url) {
  if (!pattern) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (pattern.kind === 'seg') {
    const s = u.pathname.split('/')[pattern.index];
    return /^\d+$/.test(s || '') ? parseInt(s, 10) : null;
  }
  if (pattern.kind === 'dash') {
    const m = /^(\d+)-(\d+)$/.exec(u.pathname.split('/')[pattern.index] || '');
    return m ? parseInt(m[2], 10) : null;
  }
  if (pattern.kind === 'query') {
    const v = new URLSearchParams(u.search).get(pattern.name);
    return /^\d+$/.test(v || '') ? parseInt(v, 10) : null;
  }
  return null;
}

// --- Learned link text ("next" in the site's own words, e.g. Romanian
// "următorul") ---
// Learned per origin from clicks: the user clicks a link and the page
// advances. Same 2-repeat / 10-miss rules as URL rules, same store, keyed
// 'link:<origin>|<normalized text>'. The prediction is the link's href, so
// it also covers pages whose URLs carry no number at all (hash URLs).
export function normalizeLinkText(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s || s.length > 40) return null;
  return s;
}
export function linkTextKey(origin, text) {
  const t = normalizeLinkText(text);
  return t ? 'link:' + origin + '|' + t : null;
}
// Fold one clicked link into the rules. The click must really have caused
// this navigation (href matches the new URL — checked by the caller) and
// the move must look like a page turn: either the URL learner sees a +1
// turn, or both pages sit in the same first path segment (e.g. /s/... ->
// /s/... on a hash-URL site). A one-off click on a gallery link never
// qualifies, and the 2-repeat bar needs the same text twice.
export function observeLinkRules(rules, origin, text, oldUrl, newUrl) {
  const next = { ...(rules || {}) };
  const key = linkTextKey(origin, text);
  if (!key) return next;
  let turn = learnPattern(oldUrl, newUrl) !== null;
  if (!turn) {
    try {
      const a = new URL(oldUrl), b = new URL(newUrl);
      const fa = a.pathname.split('/')[1], fb = b.pathname.split('/')[1];
      turn = a.origin === b.origin && !!fa && fa === fb;
    } catch { turn = false; }
  }
  if (!turn) return next;
  const cur = next[key];
  if (cur && cur.pattern.kind === 'link-text') {
    next[key] = { ...cur, count: cur.count + 1 };
  } else {
    next[key] = { pattern: { kind: 'link-text', origin, text: normalizeLinkText(text) }, count: 1, misses: 0 };
  }
  return next;
}
// Active learned link texts for this origin (count >= LEARN_REPEATS).
export function activeLinkTexts(rules, origin) {
  const out = [];
  for (const [key, r] of Object.entries(rules || {})) {
    if (r && r.pattern && r.pattern.kind === 'link-text' &&
        r.pattern.origin === origin && r.count >= LEARN_REPEATS) {
      out.push({ text: r.pattern.text, key });
    }
  }
  return out;
}

// --- Learned picture link ("the picture IS the next link") ---
// Learned per origin from clicks on picture links: the user clicks the
// picture and the page advances. Same 2-repeat / 10-miss bars. Keyed
// 'piclink:<origin>'. The rule carries no text or URL — the prediction is
// "the link around the biggest picture on the page" (see findPictureLink).
export function picLinkKey(origin) { return 'piclink:' + origin; }
export function observePicLinkRules(rules, origin, oldUrl, newUrl) {
  const next = { ...(rules || {}) };
  // Same-section move only (same first path segment); the click itself is
  // the evidence — the URL carries no number to check.
  let same = false;
  try {
    const a = new URL(oldUrl), b = new URL(newUrl);
    const fa = a.pathname.split('/')[1], fb = b.pathname.split('/')[1];
    same = a.origin === b.origin && !!fa && fa === fb;
  } catch {}
  if (!same) return next;
  const key = picLinkKey(origin);
  const cur = next[key];
  if (cur && cur.pattern.kind === 'pic-link') {
    next[key] = { ...cur, count: cur.count + 1 };
  } else {
    next[key] = { pattern: { kind: 'pic-link', origin }, count: 1, misses: 0 };
  }
  return next;
}
export function activePicLinkRule(rules, origin) {
  const r = (rules || {})[picLinkKey(origin)];
  if (!r || r.pattern.kind !== 'pic-link' || r.count < LEARN_REPEATS) return null;
  return { pattern: r.pattern, key: picLinkKey(origin) };
}

// Fold one observed navigation into the rules. Same pattern again counts up;
// a different pattern for the same shape restarts that shape from 1.
export function observeRules(rules, oldUrl, newUrl) {
  const next = { ...(rules || {}) };
  const pattern = learnPattern(oldUrl, newUrl);
  if (!pattern) return next;
  const cur = next[pattern.shape];
  if (cur && cur.pattern.kind === pattern.kind &&
      cur.pattern.index === pattern.index && cur.pattern.name === pattern.name) {
    next[pattern.shape] = { ...cur, count: cur.count + 1 };
  } else {
    next[pattern.shape] = { pattern, count: 1, misses: 0 };
  }
  return next;
}

// The active rule for this URL, if its pattern has repeated enough.
export function activeRuleFor(rules, url) {
  if (!rules) return null;
  const shape = urlShape(url);
  const r = shape ? rules[shape] : null;
  if (!r || r.count < LEARN_REPEATS) return null;
  return { pattern: r.pattern, key: shape };
}

// Score one outcome: success resets the miss streak; a miss counts up and
// drops the rule at LEARN_MAX_MISSES so learning starts again from zero.
export function noteLearnResult(rules, key, ok) {
  const next = { ...(rules || {}) };
  const r = next[key];
  if (!r) return next;
  if (ok) {
    next[key] = { ...r, misses: 0 };
    return next;
  }
  const misses = r.misses + 1;
  if (misses >= LEARN_MAX_MISSES) delete next[key];
  else next[key] = { ...r, misses };
  return next;
}
