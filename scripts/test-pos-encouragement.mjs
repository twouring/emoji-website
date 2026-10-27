import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const sourcePath = fileURLToPath(new URL('../public/pos-encouragement.js', import.meta.url));
function load(math = Math) {
  assert.ok(existsSync(sourcePath), 'browser encouragement utility must exist');
  const context = vm.createContext({ Math: math });
  vm.runInContext(readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.PosEncouragement;
}

test('browser global supplies exactly 100 unique, compact, frozen bilingual phrases', () => {
  const api = load();
  assert.ok(api, 'sets globalThis.PosEncouragement without CommonJS or DOM');
  assert.equal(api.phrases.length, 100);
  assert.ok(Object.isFrozen(api.phrases));
  const zh = new Set();
  const en = new Set();
  for (const pair of api.phrases) {
    assert.deepEqual(Object.keys(pair).sort(), ['en', 'm', 'zh']);
    assert.ok(Object.isFrozen(pair));
    assert.equal(typeof pair.zh, 'string');
    assert.equal(typeof pair.en, 'string');
    assert.ok([...pair.zh].length > 0 && [...pair.zh].length <= 18, pair.zh);
    assert.ok(pair.en.length > 0 && pair.en.length <= 44, pair.en);
    assert.match(pair.zh, /\p{Script=Han}/u);
    assert.match(pair.en, /^[\x20-\x7e]+$/);
    assert.equal(pair.zh, pair.zh.trim());
    assert.equal(pair.en, pair.en.trim());
    zh.add(pair.zh);
    en.add(pair.en);
  }
  assert.equal(zh.size, 100, 'Chinese phrases must be unique');
  assert.equal(en.size, 100, 'English phrases must be unique');
});

test('pick maps equal random intervals to all 100 pairs and handles range edges', () => {
  const api = load();
  assert.equal(typeof api.pick, 'function');
  assert.strictEqual(api.pick(() => 0), api.phrases[0]);
  assert.strictEqual(api.pick(() => 1 - Number.EPSILON), api.phrases[99]);
  for (let index = 0; index < 100; index += 1) {
    assert.strictEqual(api.pick(() => (index + 0.5) / 100), api.phrases[index]);
  }
  const counts = new Map(api.phrases.map(pair => [pair, 0]));
  for (let index = 0; index < 10000; index += 1) {
    const pair = api.pick(() => (index + 0.5) / 10000);
    counts.set(pair, counts.get(pair) + 1);
  }
  for (const count of counts.values()) assert.equal(count, 100);
});

test('pick defaults to Math.random and samples anew on each call', () => {
  let calls = 0;
  const math = Object.create(Math);
  math.random = () => [0, 0.505, 1 - Number.EPSILON][calls++];
  const api = load(math);
  assert.strictEqual(api.pick(), api.phrases[0]);
  assert.strictEqual(api.pick(), api.phrases[50]);
  assert.strictEqual(api.pick(), api.phrases[99]);
  assert.equal(calls, 3);
});

test('each phrase has its own valid moji scene (100 unique illustrations)', () => {
  const api = load();
  const mojiPath = fileURLToPath(new URL('../public/pos-moji.js', import.meta.url));
  const ctx = vm.createContext({ Math });
  vm.runInContext(readFileSync(mojiPath, 'utf8'), ctx, { filename: mojiPath });
  const moji = ctx.PosMoji;
  assert.ok(moji, 'sets globalThis.PosMoji');
  const scenes = new Set();
  for (const pair of api.phrases) {
    assert.ok(moji.valid(pair.m), 'invalid scene: ' + pair.m + ' for ' + pair.zh);
    scenes.add(pair.m);
  }
  assert.equal(scenes.size, 100, 'every phrase gets a different illustration');
  assert.equal(moji.draw({}, api.phrases[0].m, 0, 0, 200), false, 'no Path2D => skip drawing, not throw');
  for (const h of ['public/pos.html', 'public/admin.html']) {
    const html = readFileSync(fileURLToPath(new URL('../' + h, import.meta.url)), 'utf8');
    assert.match(html, /<script src="\/pos-moji.js"><\/script>/, h + ' loads pos-moji.js');
  }
});
