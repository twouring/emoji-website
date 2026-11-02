import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadMenuSeedRows, buildMenuSeedDoc } = require('../lib/menu-seed.js');
const { fillMenuJa, NOTE_JA, NOTE_EN } = require('../lib/menu-ja.js');
const MenuLib = require('../public/menu-lib.js') && globalThis.MenuLib;

test('seed 每項菜單說明都有日文，且不含中文字', () => {
  const rows = loadMenuSeedRows();
  assert.equal(rows.length, 74);
  for (const r of rows) {
    assert.ok(NOTE_JA[r.zh], '缺日文說明：' + r.zh);
    assert.doesNotMatch(NOTE_JA[r.zh].replace(/[弁辛酒]/g, ''), /[們這與種為說]/, r.zh);
  }
});
test('seed 帶 note_ja；fillMenuJa 只補空值、不蓋後台已填', () => {
  const doc = JSON.parse(JSON.stringify(buildMenuSeedDoc(loadMenuSeedRows())));
  assert.ok(doc.items.every(i => i.note_ja));
  const items = [{ zh: '可麗露', note: 'x', note_ja: '手動' }, { zh: '巴斯克蛋糕', note: 'x' }];
  fillMenuJa(items);
  assert.equal(items[0].note_ja, '手動');
  assert.equal(items[1].note_ja, NOTE_JA['巴斯克蛋糕']);
});
test('renderMenuHtml：ja 顯示 note_ja、en 顯示 note_en，缺翻譯才退回中文', () => {
  const it = MenuLib.normalizeItem({ zh: '可麗露', note: '中文說明', note_ja: '日本語の説明', note_en: 'English note', cat: 'DESSERT', venue: 'CAFE', price: 1 });
  assert.match(MenuLib.renderMenuHtml([it], 'ja'), /日本語の説明/);
  assert.match(MenuLib.renderMenuHtml([it], 'zh'), /中文說明/);
  assert.doesNotMatch(MenuLib.renderMenuHtml([it], 'en'), /日本語の説明/);
  assert.match(MenuLib.renderMenuHtml([it], 'en'), /English note/);
  assert.doesNotMatch(MenuLib.renderMenuHtml([it], 'en'), /中文說明/);
});
test('seed 每項菜單說明都有英文，且不含中文字；fillMenuJa 補 note_en 不蓋已填', () => {
  for (const r of loadMenuSeedRows()) {
    if (!r.note) continue;
    assert.ok(NOTE_EN[r.zh], '缺英文說明：' + r.zh);
  }
  for (const [k, v] of Object.entries(NOTE_EN)) assert.doesNotMatch(v, /[\u4e00-\u9fff]/, k);
  const items = [{ zh: '可麗露', note: 'x', note_en: 'manual' }, { zh: '巴斯克蛋糕', note: 'x' }];
  fillMenuJa(items);
  assert.equal(items[0].note_en, 'manual');
  assert.equal(items[1].note_en, NOTE_EN['巴斯克蛋糕']);
});

test('韓文（KK 11/2）：seed 每項都有韓文品名與說明、不含中日文字；fillMenuJa 補 ko／note_ko 不蓋已填', () => {
  const { MENU_KO, NOTE_KO, noteKoOf } = require('../lib/menu-ja.js');
  for (const r of loadMenuSeedRows()) {
    assert.ok(MENU_KO[r.zh], '缺韓文品名：' + r.zh);
    if (r.note) assert.ok(noteKoOf(r.zh, r.venue), '缺韓文說明：' + r.zh);
  }
  for (const [k, v] of [...Object.entries(MENU_KO), ...Object.entries(NOTE_KO)]) {
    assert.doesNotMatch(v.replace(/・/g, ''), /[\u4e00-\u9fff\u3040-\u30ff]/, k);   // 「・」是 U+30FB，排除
    assert.match(v, /[\uac00-\ud7af]/, k + ' 沒有韓文');
  }
  for (const zh of ['貝果套餐', '飯糰套餐', '早午餐套餐', '下午茶套餐', '麵套餐']) assert.ok(MENU_KO[zh], zh);
  assert.ok(NOTE_KO['麵套餐|CAFE'] && NOTE_KO['麵套餐|BAR']);
  const doc = buildMenuSeedDoc(loadMenuSeedRows());
  assert.ok(doc.items.every(i => i.ko && (!i.note || i.note_ko)));
  const items = [{ zh: '可麗露', note: 'x', ko: '手動', note_ko: '手動' }, { zh: '巴斯克蛋糕', venue: 'CAFE', note: 'x' }];
  fillMenuJa(items);
  assert.equal(items[0].ko, '手動'); assert.equal(items[0].note_ko, '手動');
  assert.equal(items[1].ko, MENU_KO['巴斯克蛋糕']); assert.equal(items[1].note_ko, NOTE_KO['巴斯克蛋糕']);
  const it = MenuLib.normalizeItem({ zh: '可麗露', ko: '카눌레', note: 'n', note_ko: '설명', cat: 'DESSERT', venue: 'CAFE', price: 1 });
  assert.equal(it.ko, '카눌레'); assert.equal(it.note_ko, '설명');
});
