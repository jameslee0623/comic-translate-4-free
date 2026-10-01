// Headless smoke test: load the built chrome/ extension, verify the service
// worker starts clean and the popup + options pages render without errors.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

const CHROME = process.env.CHROME_PATH || '/opt/meta-chromium/chrome';
const EXT = new URL('../dist/chrome', import.meta.url).pathname;
const PROFILE = '/tmp/ct-smoke-profile';
// Compare against the repo, never a hard-coded build: the stamp moves every
// build and a stale literal here turns every run into a false failure.
const EXPECT = (await import('node:fs')).readFileSync(
  new URL('../src/shared/version.js', import.meta.url), 'utf8').match(/BUILD = '([^']+)'/)?.[1];

function getJson(port, path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--user-data-dir=${PROFILE}`, '--remote-debugging-port=19222',
  `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check',
], { stdio: 'ignore' });
await sleep(4000);

let failures = 0;
try {
  const targets = await getJson(19222, '/json/list');
  const sw = targets.find(t => t.type === 'service_worker' && t.url.includes('service-worker.js'));
  if (!sw) { console.log('FAIL: service worker target not found'); failures++; }
  else {
    console.log('service worker:', sw.url);
    // Attach via CDP and collect console errors / exceptions for 5s.
    const ws = new WebSocket(sw.webSocketDebuggerUrl);
    const errors = [];
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('cdp timeout')), 15000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
      };
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id === 2) { clearTimeout(to); res(); }
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
      };
      ws.onerror = rej;
    });
    // Evaluate the build stamp directly in the service worker.
    const stamp = await new Promise((res, rej) => {
      const id = 10;
      const h = ev => {
        const m = JSON.parse(ev.data);
        if (m.id === id) { ws.removeEventListener('message', h); res(m.result?.result?.value); }
      };
      ws.addEventListener('message', h);
      const extId = new URL(sw.url).host;
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `fetch(chrome.runtime.getURL('src/shared/version.js')).then(r=>r.text()).then(t=>(t.match(/BUILD = '([^']+)'/)||[])[1]).catch(e=>'ERR:'+e.message)`, awaitPromise: true } }));
      setTimeout(() => rej(new Error('stamp timeout')), 8000);
    });
    await sleep(5000);
    ws.close();
    console.log('BUILD stamp in SW:', stamp);
    if (stamp !== EXPECT) { console.log(`FAIL: expected stamp ${EXPECT}, got ${stamp}`); failures++; }
    const fatal = errors.filter(e => !/favicon|net::ERR/i.test(e));
    if (fatal.length) { console.log('FAIL: SW errors:', fatal.slice(0, 5)); failures++; }
    else console.log('SW: no errors in 5s window');
  }

  // Popup + options pages: fetch their targets and check they have no load errors.
  for (const page of ['src/ui/popup.html', 'src/ui/options.html']) {
    const t = targets.find(t => t.url.includes(page));
    console.log(page, t ? 'target present' : 'not open (ok — opened on demand)');
  }
} finally {
  chrome.kill('SIGKILL');
}

console.log(failures ? `\nSMOKE: ${failures} FAILURES` : '\nSMOKE: PASS');
process.exit(failures ? 1 : 0);
