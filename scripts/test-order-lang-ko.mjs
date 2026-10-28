// 桌邊點餐語言選單＋韓文（KK 10/28）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; require('../public/order-lib.js'); require('../public/menu-lib.js');
const { OrderLib, MenuLib } = globalThis;
const html = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');

test('語言選單：四種語言、點按鈕開選單、選完關閉', () => {
  assert.deepEqual(OrderLib.LANGS.map(l => l.id), ['zh', 'en', 'ja', 'ko']);
  assert.equal(OrderLib.LANGS.find(l => l.id === 'ko').name, '한국어');
  assert.match(html, /id="lang-toggle"[^>]*aria-haspopup="menu"/);
  assert.match(html, /id="lang-menu" role="menu" hidden/);
  assert.match(html, /role="menuitemradio"/);
  assert.match(html, /\/\^ko\/\.test\(nl\)\?'ko'/, '韓文瀏覽器自動選韓文');
});

test('韓文介面字串與中文鍵完全一致，沒有漏翻、沒有中文字', () => {
  const zh = Object.keys(OrderLib.TEXT.zh).sort(), ko = OrderLib.TEXT.ko;
  assert.deepEqual(Object.keys(ko).sort(), zh);
  for (const [k, v] of Object.entries(ko)) {
    if (k === 'info_company') continue;
    assert.doesNotMatch(v, /[\u4e00-\u9fff]/, k);
    for (const ph of (OrderLib.TEXT.zh[k].match(/\{\w+\}/g) || [])) assert.ok(v.includes(ph), k + ' 缺 ' + ph);
  }
});

test('韓文：規格選項、套餐欄位、分類有韓文；品名沒韓文退回英文', () => {
  const g = OrderLib.optionGroups({ cat: 'COFFEE', zh: '拿鐵', en: 'Latte' }, 'ko');
  assert.deepEqual(g.map(x => x.label), ['온도', '얼음']);
  assert.equal(g[0].choices[1], '핫');
  assert.equal(OrderLib.slotLabel('主餐', 'ko'), '메인');
  for (const [k, v] of Object.entries(MenuLib.CAT_LABEL)) assert.ok(v.ko, k + ' 缺韓文');
  const combo = OrderLib.comboGroups({ venue: 'CAFE', cat: 'COMBO', combo: [{ key: 'main', label: '主餐', choices: [{ id: 'm1', zh: '貝果' }] }] }, [{ id: 'm1', venue: 'CAFE', cat: 'BREAD', zh: '貝果', en: 'Bagel' }], 'ko');
  assert.equal(combo[0].choices[0], 'Bagel');
});

test('呼叫服務／回饋類別／打賞音效都有韓文', () => {
  for (const p of ['../lib/service-calls.js', '../lib/order-feedback.js']) for (const v of Object.values(require(p).KINDS)) assert.ok(v.ko, p);
  assert.equal(require('../lib/order-feedback.js').validate({ kind: 'app', text: '좋아요', lang: 'ko' }).lang, 'ko');
  assert.ok(!/ja:'[^']*'\}/.test(html.match(/var CALL_KINDS=.*/)[0] + html.match(/var FB_KINDS=.*/)[0]), '前台類別清單都要帶 ko');
});
