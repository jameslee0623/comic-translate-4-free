// Verifies the Chrome ML alarm backup (ml-bridge.js) without a browser:
// 1. a settled call clears its alarm + storage entry
// 2. an alarm firing with a pending entry tells the tab + restarts the host
// 3. an alarm firing with no entry is a no-op
// 4. cancel calls arm no alarm
// 5. a blocked doc makes mlHostAlive return false in ~3s (not forever)
// Usage: node hidden-audit/alarm-backup.mjs
import assert from 'node:assert';

const store = new Map();
const alarmsCreated = new Map();
const alarmsCleared = [];
const tabMessages = [];
let closeDocumentCalls = 0;
let sendBehavior = 'resolve'; // 'resolve' | 'hang'

globalThis.chrome = {
  runtime: {
    sendMessage: async (msg) => {
      // Hang mode means the doc's thread is blocked: it answers NOTHING,
      // not even a ping. (Checking ping first was a harness bug.)
      if (sendBehavior === 'hang') return new Promise(() => {});
      if (msg && msg.type === 'ml/ping') return { ok: true };
      return { ok: true, results: [], ms: 1 };
    },
  },
  storage: { local: {
    set: async (obj) => { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
    get: async (key) => ({ [key]: store.get(key) }),
    remove: async (key) => { store.delete(key); },
  } },
  alarms: {
    create: async (name, info) => { alarmsCreated.set(name, info); },
    clear: async (name) => { alarmsCleared.push(name); alarmsCreated.delete(name); },
    onAlarm: { addListener: (fn) => { globalThis.__ctOnAlarm = fn; } },
  },
  tabs: { sendMessage: async (tabId, msg) => { tabMessages.push({ tabId, msg }); } },
  offscreen: {
    closeDocument: async () => { closeDocumentCalls++; },
    createDocument: async () => {},
  },
};

const bridge = await import('../src/background/ml-bridge.js');
assert(globalThis.__ctOnAlarm, 'onAlarm listener must register');

// 1. Settled call clears its alarm + entry.
const r = await bridge.callMl({ type: 'ml/inpaint', runId: 'r1' }, { tabId: 7 });
assert(r && r.ok, 'fast call should resolve');
assert.equal(alarmsCreated.size, 0, 'alarm must be cleared on settle');
assert.equal([...store.keys()].filter(k => k.startsWith('ct-ml-pending:')).length, 0, 'entry must be removed on settle');

// 2. Alarm recovery with a pending entry (worker died mid-call).
const name = 'ct-ml:r2:ml/inpaint:12345';
store.set(`ct-ml-pending:${name}`, { runId: 'r2', tabId: 9, type: 'ml/inpaint', timeoutMs: 120000, deadline: Date.now() });
await globalThis.__ctOnAlarm({ name });
assert.equal(tabMessages.length, 1, 'tab must get one error');
assert.equal(tabMessages[0].tabId, 9);
assert.equal(tabMessages[0].msg.stage, 'error');
assert.match(tabMessages[0].msg.error, /timed out during inpaint/i);
assert.equal(closeDocumentCalls, 1, 'host must be restarted');
assert(!store.has(`ct-ml-pending:${name}`), 'entry must be removed by recovery');

// 3. Alarm with no entry is a no-op.
tabMessages.length = 0; closeDocumentCalls = 0;
await globalThis.__ctOnAlarm({ name: 'ct-ml:ghost:ml/detect:1' });
assert.equal(tabMessages.length, 0);
assert.equal(closeDocumentCalls, 0);

// 4. Cancel arms no alarm.
alarmsCreated.clear();
await bridge.callMl({ type: 'ml/cancel', runId: 'r1' });
assert.equal(alarmsCreated.size, 0, 'cancel must not create an alarm');

// 5. Blocked doc: mlHostAlive returns false in ~3s, not forever.
sendBehavior = 'hang';
const t0 = Date.now();
assert.equal(await bridge.mlHostAlive(), false);
const took = Date.now() - t0;
assert(took >= 2900 && took < 6000, `ping timeout should take ~3s, took ${took}ms`);

console.log('alarm-backup: all 5 checks passed');
