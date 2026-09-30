// Translation backends. translateBlocks(blocks, settings) -> aligned [string].
// Empty source texts map to empty translations. Throws with a human message.
import { LANGS, TARGET_LANGS } from '../shared/settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function langName(code) {
  const hit = LANGS.find(([c]) => c === code) || TARGET_LANGS.find(([c]) => c === code);
  return hit ? hit[1] : code;
}

async function googleFree(texts, src, dst) {
  const out = [];
  for (const t of texts) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx' +
      `&sl=${encodeURIComponent(src)}&tl=${encodeURIComponent(dst)}&dt=t&q=${encodeURIComponent(t)}`;
    // The gtx endpoint is unofficial and rate-limits aggressively (HTTP 500 /
    // 429 in bursts). One failure must not kill the whole page: retry with
    // exponential backoff + jitter before giving up on this text.
    const delays = [1500, 4000, 10000];
    let resp = null, lastErr = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        resp = await fetch(url);
      } catch (e) {
        lastErr = e;
        resp = null;
      }
      if (resp && resp.ok) break;
      const retryable = !resp || resp.status === 429 || resp.status >= 500;
      if (!retryable || attempt === delays.length) break;
      const wait = delays[attempt] + Math.random() * 800;
      await sleep(wait);
      resp = null;
    }
    if (!resp) throw new Error('google translate: network error — ' + String(lastErr).slice(0, 120));
    if (!resp.ok) {
      throw new Error(
        `google translate: HTTP ${resp.status} after retries (unofficial endpoint — ` +
        `Google is rate-limiting right now; wait a few minutes or switch to Azure / LM Studio)`);
    }
    const data = await resp.json();
    out.push(((data && data[0]) || []).map(seg => (seg && seg[0]) || '').join(''));
    await sleep(120); // be gentle with the unofficial endpoint
  }
  return out;
}

function azureLang(code) {
  // Same language, different code per backend (Google-style -> Azure).
  // ku is a semantic trap: Google's ku is Kurmanji, Azure's ku is Central
  // Kurdish (Sorani) — the mapping is mandatory, not cosmetic.
  const m = {
    'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant',
    pt: 'pt-pt', 'pt-BR': 'pt', 'pt-PT': 'pt-pt', 'fr-CA': 'fr-ca',
    sr: 'sr-Cyrl', mn: 'mn-Cyrl',
    ny: 'nya', lg: 'lug', rn: 'run',
    ku: 'kmr', ckb: 'ku',
  };
  return m[code] || code;
}

async function azure(texts, settings) {
  const key = (settings.azureKey || '').trim();
  const region = (settings.azureRegion || '').trim();
  if (!key) throw new Error('azure translator: API key not set — add it in Options');
  if (!region) throw new Error('azure translator: region not set — add it in Options');
  const to = azureLang(settings.targetLang);
  const out = [];
  for (let i = 0; i < texts.length; i += 25) {
    const batch = texts.slice(i, i + 25);
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-type': 'application/json',
          'X-ClientTraceId': crypto.randomUUID(),
        },
        body: JSON.stringify(batch.map(t => ({ text: t }))),
      });
    } catch (e) {
      throw new Error('azure translator: network error — ' + String(e).slice(0, 120));
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`azure translator: HTTP ${resp.status} ${body.slice(0, 160)}`);
    }
    const data = await resp.json();
    for (const r of data) out.push((r.translations && r.translations[0] && r.translations[0].text) || '');
  }
  return out;
}

function lmStudioBase(settings) {
  return (settings.lmStudioUrl || 'http://127.0.0.1:1234').replace(/\/+$/, '');
}

// Which server API the user points at. The two flavours differ in path,
// request shape and reply envelope:
// 'openai': POST <url>/chat/completions with {messages, temperature, ...},
//   reply {choices:[{message:{content}}]}. LM Studio mounts this under /v1,
//   so a bare host:port URL gets /v1 added; a URL that already carries a path
//   is left alone (a non-LM-Studio server with its own mount point).
// 'lmstudio-v1': POST <server-root>/api/v1/chat with {model, input},
//   reply {output:[{type:"reasoning"|"message", content}]}. `model` is required,
//   so it is auto-detected from /api/v1/models (the /v1 prefix the URL field
//   carries is the OpenAI-compat mount; the native REST API lives at the
//   server root, so it is stripped).
function lmStudioEndpoints(settings) {
  const url = lmStudioBase(settings);
  if ((settings.lmStudioApi || 'lmstudio-v1') === 'lmstudio-v1') {
    const root = url.replace(/\/v1$/, '');
    return { chat: root + '/api/v1/chat', models: root + '/api/v1/models', label: 'LM Studio REST API v1', flavor: 'lmstudio-v1' };
  }
  const afterHost = url.replace(/^https?:\/\/[^/]+/i, '');
  const base = afterHost === '' ? url + '/v1' : url;
  return { chat: base + '/chat/completions', models: base + '/models', label: 'OpenAI-compatible', flavor: 'openai' };
}

// The native v1 API requires a `model` id on every chat request, but the
// translation flow must not interrogate the server first — it just asks the
// running model to translate. So the loaded model is learned once (from the
// connection check, or lazily on the first translation) and remembered in
// settings; later translations send a single POST. If the remembered model
// is gone (unloaded/swapped in LM Studio), the caller rediscovers once and
// retries. Prefers the native v1 shape (key + loaded_instances), falls back
// to older {id, state} shapes.
async function lmStudioDiscoverModel(ep, headers) {
  let resp;
  try {
    resp = await fetch(ep.models, { headers });
  } catch (e) {
    throw new Error('LM Studio: cannot reach ' + ep.models + ' — is the server running?');
  }
  if (!resp.ok) throw new Error(`LM Studio: HTTP ${resp.status} from ${ep.models}`);
  const data = await resp.json().catch(() => ({}));
  const models = (data && (data.data || data.models)) || [];
  const loaded = models.find(m => m && Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0 && (m.key || m.id))
    || models.find(m => m && m.state === 'loaded' && (m.key || m.id));
  // No loaded model: say so plainly rather than JIT-loading some arbitrary
  // downloaded model the user didn't ask for.
  if (!loaded) throw new Error('LM Studio: no model is loaded — load one in LM Studio first, then translate again');
  const id = loaded.key || loaded.id;
  try {
    const cur = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(cur.settings || {}), lmStudioModelId: id } });
  } catch { /* remembering is best-effort; the id is still returned */ }
  return id;
}

// LM Studio's OpenAI-compatible server (user hosts the model themselves).
// One batched request for all texts. The prompt follows the contract from
// jameslee0623/ComicTranslate (src/background/lensLocalEngine.js): the
// instruction is the first line, outside any JSON, then the source strings as
// a JSON array (OCR text can contain newlines/quotes, so line-based framing
// would shift entries). `texts`/`target`/`source` ride along for chat servers
// that are actually dedicated translators; a general LLM ignores them and
// obeys the prompt. temperature 0: a re-read of the same page must give the
// same translation.
function lmStudioPrompt(texts, settings) {
  const n = texts.length;
  const from = langName(settings.sourceLang);
  const to = langName(settings.targetLang);
  return 'Translate the following ' + n + ' text(s) from ' + from + ' to ' + to +
    '. Reply with ONLY a JSON array of ' + n +
    ' translated strings, in the same order, no explanations, no code fences.' +
    ' Do not analyse the text and do not think step by step: output the array' +
    ' itself as your very first characters, then stop.' +
    '\n' + JSON.stringify(texts);
}

async function lmStudio(texts, settings) {
  const ep = lmStudioEndpoints(settings);
  const headers = { 'Content-Type': 'application/json' };
  if ((settings.lmStudioKey || '').trim()) headers['Authorization'] = 'Bearer ' + settings.lmStudioKey.trim();
  if (ep.flavor === 'lmstudio-v1') return lmStudioV1(texts, settings, ep, headers);
  const body = {
    messages: [{ role: 'user', content: lmStudioPrompt(texts, settings) }],
    temperature: 0,
    texts,
    target: settings.targetLang,
  };
  if (settings.sourceLang && settings.sourceLang !== 'auto') body.source = settings.sourceLang;
  let resp;
  try {
    resp = await fetch(ep.chat, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('LM Studio: cannot reach ' + ep.chat + ' (' + ep.label + ') — is the server running? (' + String(e).slice(0, 100) + ')');
  }
  // Read as text, not res.json(): the reply is not reliably JSON, an error
  // status carries the real reason in its body, and json() consumes the stream
  // even when the parse then throws.
  const bodyText = await resp.text().catch(() => '');
  if (!resp.ok) {
    throw new Error(`LM Studio: HTTP ${resp.status} — ${bodyText.slice(0, 160) || 'check the server URL'}`);
  }
  return parseLmStudioBody(bodyText, texts.length);
}

// Native REST API v1 translation: one POST per page, {model, input,
// temperature}. The model id is the remembered one when we have it; learned
// once when we don't; re-learned once if the remembered one fails (the user
// may have swapped models in LM Studio since).
async function lmStudioV1(texts, settings, ep, headers) {
  const input = lmStudioPrompt(texts, settings);
  const post = async (modelId) => {
    try {
      return await fetch(ep.chat, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: modelId, input, temperature: 0 }),
      });
    } catch (e) {
      throw new Error('LM Studio: cannot reach ' + ep.chat + ' — is the server running? (' + String(e).slice(0, 100) + ')');
    }
  };
  const fail = async (resp) => {
    const t = await resp.text().catch(() => '');
    throw new Error(`LM Studio: HTTP ${resp.status} — ${t.slice(0, 160) || 'check the server URL'}`);
  };
  const n = texts.length;
  let modelId = settings.lmStudioModelId;
  if (!modelId) {
    const resp = await post(await lmStudioDiscoverModel(ep, headers));
    if (!resp.ok) await fail(resp);
    return parseLmStudioBody(await resp.text(), n);
  }
  let resp = await post(modelId);
  if (!resp.ok) {
    resp = await post(await lmStudioDiscoverModel(ep, headers));
    if (!resp.ok) await fail(resp);
  }
  return parseLmStudioBody(await resp.text(), n);
}

// --- LM Studio reply parsing (ported from lensLocalEngine.js in the author's own
// project jameslee0623/ComicTranslate — no third-party license obligation)
// Index alignment is the whole contract: entry i translates region i. A length
// mismatch is an error, never a zip — silently pairing the wrong strings
// paints plausible nonsense into speech bubbles.

// Brace-balance scan for a [...] window that JSON.parses. A regex cannot do
// this: quoted strings are skipped (brackets inside text must not throw the
// depth count) and escapes are honoured. Of several parseable windows the LAST
// one with exactly `expected` entries wins — a reasoning model repeats its
// draft and then restates the final version. Without a count the longest
// parseable window wins.
function lmExtractJsonArray(raw, expected) {
  let best = null, exact = null;
  const counted = typeof expected === 'number' && expected >= 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '[') continue;
    let depth = 0, inString = false, escaped = false;
    for (let j = i; j < raw.length; j++) {
      const c = raw[j];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(i, j + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (counted && Array.isArray(parsed) && parsed.length === expected) {
              exact = { candidate, parsed };
            } else if (!best || candidate.length > best.candidate.length) {
              best = { candidate, parsed };
            }
          } catch { /* this window is prose, keep scanning */ }
          break;
        }
      }
    }
  }
  return exact || best;
}

// Pull the assistant's ANSWER out of a chat envelope, or null when this is
// not one. Reasoning models (Qwen3, Gemma, DeepSeek-R1, ...) carry two pieces
// of text: the reasoning half quotes the input back — including the ORIGINAL
// JSON array of source strings — so scanning the whole body for an array would
// find the untranslated original first. Only the answer half is a candidate.
function lmUnwrapAssistantText(data) {
  if (!data || typeof data !== 'object') return null;
  // LM Studio native: keep only the answer items, never the reasoning ones.
  if (Array.isArray(data.output)) {
    const parts = data.output
      .filter(o => o && (o.type === 'message' || o.type === 'text'))
      .map(o => String(o.content === undefined ? '' : o.content));
    return parts.length ? parts.join('\n') : null;
  }
  // OpenAI-compatible.
  if (Array.isArray(data.choices) && data.choices.length) {
    const msg = data.choices[0] && data.choices[0].message;
    if (msg && typeof msg.content === 'string' && msg.content.trim()) return msg.content;
    return null;
  }
  // Ollama.
  if (data.message && typeof data.message.content === 'string' && data.message.content.trim()) {
    return data.message.content;
  }
  return null;
}

// The model's SCRATCH text when the server split it out of the answer, or
// null. LM Studio can return HTTP 200 with an empty message.content and the
// whole reply in reasoning_content (LM Studio bug #1602) — the work is done,
// so it is recovered, but ONLY via an array of exactly `expected` entries:
// reading this field without a count could paint the quoted-back source text
// over every bubble.
function lmReasoningText(data) {
  if (!data || typeof data !== 'object') return null;
  const boxes = [];
  if (Array.isArray(data.choices) && data.choices.length) boxes.push(data.choices[0] && data.choices[0].message);
  boxes.push(data.message, data);
  for (const box of boxes) {
    if (!box || typeof box !== 'object') continue;
    for (const key of ['reasoning_content', 'reasoning', 'thinking']) {
      if (typeof box[key] === 'string' && box[key].trim()) return box[key];
    }
  }
  if (Array.isArray(data.output)) {
    const parts = data.output
      .filter(o => o && o.type === 'reasoning')
      .map(o => String(o.content === undefined ? '' : o.content));
    if (parts.length && parts.join('').trim()) return parts.join('\n');
  }
  return null;
}

// The server's own error text, when it reported one in a body. LM Studio
// answers an unknown route with HTTP 200 and {"error":"Unexpected endpoint or
// method. ..."} — surfacing it verbatim beats reporting a parsing bug.
function lmServerErrorMessage(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.translations || data.result) return null; // a real payload
  for (const key of ['error', 'detail', 'message', 'msg']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof v.message === 'string' && v.message.trim()) return v.message.trim();
  }
  return null;
}

function lmNormalizeTranslations(data, expected) {
  let list = null;
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.translations)) list = data.translations;
  else if (data && Array.isArray(data.result)) list = data.result;
  if (list === null) {
    throw new Error('LM Studio reply has no translations array. Expected a JSON array of ' + expected + ' translated strings.');
  }
  if (typeof expected === 'number' && list.length !== expected) {
    throw new Error('LM Studio returned ' + list.length + ' translation(s) for ' + expected +
      ' source line(s) — refusing to pair them, because shifted entries would paint the wrong text into the wrong bubble.');
  }
  return list.map(v => (v === null || v === undefined ? '' : String(v)));
}

function parseLmStudioBody(bodyText, expected) {
  const text = bodyText === null || bodyText === undefined ? '' : String(bodyText);
  if (!text.trim()) {
    throw new Error('LM Studio reply was empty. Is a model loaded in LM Studio?');
  }
  let parsedBody;
  try { parsedBody = JSON.parse(text); } catch { parsedBody = undefined; }

  let data = null;
  if (parsedBody !== undefined) {
    const answer = lmUnwrapAssistantText(parsedBody);
    if (answer !== null) {
      // A chat envelope. The answer is a STRING that may itself be JSON, may
      // be code-fenced, may carry prose — so parse that string, with `expected`
      // so a reply that also quotes the source back resolves to the array with
      // the right number of entries.
      try {
        data = JSON.parse(answer);
      } catch {
        const found = lmExtractJsonArray(answer, expected);
        data = found ? found.parsed : null;
      }
    } else {
      // Not an envelope: a dedicated translation server answering
      // {"translations":[...]} or a bare array — but surface its own error
      // text first.
      const reported = lmServerErrorMessage(parsedBody);
      if (reported) throw new Error('LM Studio reported: ' + reported);
      // An envelope whose ANSWER is empty: a reasoning model that put the whole
      // reply in its thinking half. Recoverable only with the exact count.
      const think = lmReasoningText(parsedBody);
      if (think !== null) {
        const found = typeof expected === 'number' ? lmExtractJsonArray(think, expected) : null;
        if (found && Array.isArray(found.parsed) && found.parsed.length === expected) {
          return lmNormalizeTranslations(found.parsed, expected);
        }
        throw new Error('LM Studio spent its whole reply thinking and left the answer empty — nothing was translated. ' +
          'Try switching off "Separate reasoning_content and content in API responses" in LM Studio Developer settings, or pick a non-reasoning model.');
      }
      data = parsedBody;
    }
  } else {
    // Not JSON at all: a raw completion that wrapped the array in prose or a
    // code fence.
    const found = lmExtractJsonArray(text, expected);
    data = found ? found.parsed : null;
  }
  if (data === null || data === undefined) {
    throw new Error('LM Studio reply was not valid JSON. Expected a JSON array of ' + expected + ' translated strings.');
  }
  return lmNormalizeTranslations(data, expected);
}

export async function checkLmStudio(settings) {
  const ep = lmStudioEndpoints(settings);
  let resp;
  try {
    resp = await fetch(ep.models);
  } catch (e) {
    return { ok: false, error: 'cannot reach ' + ep.models + ' (' + ep.label + ') — start the LM Studio server first' };
  }
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status} from ${ep.models}` };
  const data = await resp.json().catch(() => ({}));
  const models = (data && (data.data || data.models)) || [];
  const names = models.map(m => m.key || m.id).filter(Boolean);
  if (ep.flavor === 'lmstudio-v1') {
    // Remember the loaded model now, so translations just send one POST.
    const loaded = models.find(m => m && Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0 && (m.key || m.id));
    if (loaded) {
      try {
        const cur = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...(cur.settings || {}), lmStudioModelId: loaded.key || loaded.id } });
      } catch { /* best-effort */ }
    }
  }
  return {
    ok: true,
    detail: names.length
      ? `connected (${ep.label}) — ${names.length} model${names.length > 1 ? 's' : ''} loaded: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`
      : `connected (${ep.label}) — but no model is loaded in LM Studio`,
  };
}

export async function checkAzure(settings) {
  const key = (settings.azureKey || '').trim();
  const region = (settings.azureRegion || '').trim();
  if (!key) return { ok: false, error: 'API key not set' };
  if (!region) return { ok: false, error: 'region not set' };
  try {
    // Minimal real call: translate one word. A 200 proves key+region+network.
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-type': 'application/json',
        'X-ClientTraceId': crypto.randomUUID(),
      },
      body: JSON.stringify([{ text: 'test' }]),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, error: `HTTP ${resp.status} ${body.slice(0, 120)}` };
    }
    return { ok: true, detail: 'connected — key and region accepted' };
  } catch (e) {
    return { ok: false, error: 'network error — ' + String(e).slice(0, 120) };
  }
}
async function localLlm(texts, settings) {
  let wllm;
  try {
    wllm = await import(chrome.runtime.getURL('src/offscreen/vendor/web-llm.js'));
  } catch (e) {
    throw new Error('local LLM: could not load the WebLLM runtime — ' + String(e).slice(0, 120));
  }
  let engine;
  try {
    engine = await wllm.CreateMLCEngine(settings.localLlmModel, { logLevel: 'SILENT' });
  } catch (e) {
    throw new Error('local LLM: model load failed (needs WebGPU + a large download) — ' + String(e).slice(0, 160));
  }
  const sys = `Translate the following ${langName(settings.sourceLang)} manga dialogue to ${langName(settings.targetLang)}. Preserve tone and line breaks. Output only the translation, nothing else.`;
  const out = [];
  for (const t of texts) {
    const resp = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: t },
      ],
    });
    out.push(((resp.choices[0].message.content) || '').trim());
  }
  return out;
}

export async function translateBlocks(blocks, settings, onProgress) {
  const idx = [], texts = [];
  blocks.forEach((b, i) => {
    if (b.text && b.text.trim()) { idx.push(i); texts.push(b.text); }
  });
  const translated = new Array(blocks.length).fill('');
  if (!texts.length) return translated;
  const backend = settings.translationBackend || 'google';
  let results;
  if (backend === 'azure') results = await azure(texts, settings);
  else if (backend === 'lmstudio') results = await lmStudio(texts, settings);
  else if (backend === 'local-llm') results = await localLlm(texts, settings);
  else results = await googleFree(texts, settings.sourceLang, settings.targetLang);
  results.forEach((t, k) => { translated[idx[k]] = t; });
  onProgress && onProgress();
  return translated;
}

export const BACKEND_LABEL = { google: 'Google (free)', azure: 'Azure Translator', lmstudio: 'LM Studio (local)', 'local-llm': 'Local LLM (experimental)' };
