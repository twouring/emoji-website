// 套餐「不加購」選項＋只當套餐內容的品項（KK 11/24：商業午餐合併成一項，飲品可加可不加）
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const ML = T.MenuLib;
const MC = require('../lib/menu-content.js');
const win = { MenuLib: ML };
vm.runInNewContext(fs.readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8'), { window: win, console });
const O = win.OrderLib;
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

const lunchCore = { id: 'm_core', venue: 'CAFE', cat: 'JAPANESE', zh: '日式醬燒漢堡排定食', price: 259, published: true, combo_only: true };
const drinks = [
  { id: 'm_am', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', price: 150, published: true },
  { id: 'm_la', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵咖啡', price: 180, published: true },
];
const lunch = { id: 'm_lunch', venue: 'CAFE', cat: 'COMBO', zh: '商業午餐', price: 259, published: true,
  combo: ML.comboFromText('主餐：日式醬燒漢堡排定食\n飲品：不加購、美式咖啡+80、拿鐵咖啡+110') };
const doc = { items: [lunchCore, ...drinks, lunch].map(ML.normalizeItem) };
const json = JSON.stringify(doc);

test('comboFromText 認得不加購；comboToText 寫回同字', () => {
  const s = lunch.combo[1];
  assert.deepEqual(s.choices[0], { zh: '不加購', add: 0, none: true });
  assert.match(ML.comboToText(lunch.combo), /飲品：不加購、美式咖啡\+80、拿鐵咖啡\+110/);
});

test('選不加購：價格＝套餐價、parts 只有主餐（只出廚房單）', () => {
  const menu = T.menuIndex(json, 'CAFE');
  const out = T.posAddLine([], menu, { item_id: 'm_lunch', qty: 1, combo: { main: { zh: '日式醬燒漢堡排定食' }, drink: { zh: '不加購' } } });
  assert.equal(out[0].price, 259);
  assert.deepEqual(out[0].parts.map(p => p.zh), ['日式醬燒漢堡排定食']);
});

test('選飲品：加價由伺服器算、飲品進 parts（吧台單）', () => {
  const menu = T.menuIndex(json, 'CAFE');
  const out = T.posAddLine([], menu, { item_id: 'm_lunch', qty: 1, combo: { main: { zh: '日式醬燒漢堡排定食' }, drink: { id: 'm_la', zh: '拿鐵咖啡', note: '溫度：熱' } } });
  assert.equal(out[0].price, 369);
  assert.deepEqual(out[0].parts.map(p => p.cat), ['JAPANESE', 'COFFEE']);
  assert.equal(out[0].parts[1].note, '溫度：熱');
});

test('只當套餐內容的品項：不在菜單／POS 加點格、不能單獨加點，但套餐選得到', () => {
  assert.ok(!ML.publishedOnly(doc).some(x => x.id === 'm_core'));
  assert.ok(!ML.orderableOnly(doc).some(x => x.id === 'm_core'));
  const menu = T.menuIndex(json, 'CAFE');
  assert.throws(() => T.posAddLine([], menu, { item_id: 'm_core', qty: 1 }), /只能從套餐點/);
  assert.match(ops, /filter\(it=>it\.published&&!it\.combo_only&&/);
});

test('點餐畫面：不加購在第一個、沒有冰熱子選項；comboPayload 送 zh 不送 id', () => {
  const g = O.comboGroups(ML.normalizeItem(lunch), doc.items, 'zh');
  const drink = g.find(x => x.key === 'drink');
  assert.equal(drink.choices[0], '不加購');
  const payload = O.comboPayload(g, { main: g[0].choices[0], drink: '不加購' });
  assert.equal(JSON.stringify(payload.drink), JSON.stringify({ zh: '不加購' }));
  assert.equal(O.comboGroups(ML.normalizeItem(lunch), doc.items, 'en').find(x => x.key === 'drink').choices[0], 'No add-on');
});

test('估清：飲品全估清套餐仍可點（可選不加購）；主餐估清＝套餐售完', () => {
  const sold = ML.businessDay();
  const d1 = doc.items.map(x => x.cat === 'COFFEE' ? { ...x, sold_out: sold } : x);
  assert.equal(ML.comboAvailable(d1.find(x => x.id === 'm_lunch'), d1), true);
  const d2 = doc.items.map(x => x.id === 'm_core' ? { ...x, sold_out: sold } : x);
  assert.equal(ML.comboAvailable(d2.find(x => x.id === 'm_lunch'), d2), false);
});

test('內容管理 API 可改 combo_only；view 回傳', () => {
  const r = MC.editItem(json, { id: 'm_core', combo_only: false }, {});
  assert.equal(r.item.combo_only, undefined);
  const r2 = MC.editItem(r.json, { id: 'm_core', combo_only: true }, {});
  assert.equal(r2.item.combo_only, true);
});

test('低消杯數：套餐選不加購不算一杯、選飲品算一杯', () => {
  assert.match(ops, /l\.cat==='COMBO'&&\(!Array\.isArray\(l\.parts\)\|\|!l\.parts\.length\|\|l\.parts\.some\(p=>DRINK\.includes\(p\.cat\)\)\)/);
});
