// Verifies page-cache distinct-image counting (page-cache.js):
// Tier-1 + Tier-2 of one image count as ONE image, and the same image
// cached on two builds still counts as ONE image.
// Usage: node hidden-audit/cache-stats.mjs
import assert from 'node:assert';
import { baseImageKey } from '../src/shared/page-cache.js';

const t1 = (build) => `v2t1~aabbcc~800x3200~ja~0.5~detector:d@1|ocr:o@2~${build}`;
const t2 = (build, target, backend) => `${t1(build)}~t2~${target}~${backend}~`;

// One image, Tier-1 + Tier-2 -> one distinct key.
assert.equal(baseImageKey(t1('1018u')), baseImageKey(t2('1018u', 'en', 'google')));
// Same image on two builds -> still one distinct key.
assert.equal(baseImageKey(t1('1018u')), baseImageKey(t1('1018t')));
assert.equal(baseImageKey(t2('1018u', 'en', 'google')), baseImageKey(t2('1018t', 'en', 'google')));
// Two different images -> two distinct keys.
assert.notEqual(baseImageKey(t1('1018u')), baseImageKey(t1('1018u').replace('aabbcc', 'ddeeff')));
// Different target language is still the same image (Tier-2 collapses).
assert.equal(baseImageKey(t2('1018u', 'en', 'google')), baseImageKey(t2('1018u', 'ja', 'azure')));

console.log('cache-stats: all checks passed');
