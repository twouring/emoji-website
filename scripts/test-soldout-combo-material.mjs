// scripts/test-soldout-combo-material.mjs — 估清連動（KK 11/15）：單品估清時套餐內選項一起停售；原物料（黑糖、紅烏龍）估清連動品項
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const INV = require('../lib/pos-inventory.js');
const { MenuLib } = T;
globalThis.MenuLib = MenuLib;
require('../public/order-lib.js');
const OrderLib = globalThis.OrderLib;
const NOW = new Date('2026-11-15T06:00:00Z');
const DAY = MenuLib.businessDay(NOW);
const menu = () => JSON.stringify({ version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '黑糖拿鐵', price: 180, published: true },
  { id: 'm_milk', venue: 'CAFE', cat: 'BEVERAGE', zh: '黑糖牛奶', price: 160, published: true },
  { id: 'm_oolong', venue: 'CAFE', cat: 'TEA', zh: '紅烏龍', price: 150, published: true },
  { id: 'm_bagel', venue: 'CAFE', cat: 'FOOD', zh: '原味貝果', price: 120, published: true },
  { id: 'm_combo', venue: 'CAFE', cat: 'COMBO', zh: '早午餐套餐', price: 250, published: true, combo: [
    { key: 'main', label: '主餐', choices: [{ id: 'm_bagel', zh: '原味貝果', add: 0 }] },
    { key: 'drink', label: '飲品', choices: [{ id: 'm_latte', zh: '黑糖拿鐵', add: 0 }, { id: 'm_oolong', zh: '紅烏龍', add: 0 }] },
  ] },
] });
const item = (json, id) => MenuLib.parseMenuDoc(json).items.find(x => x.id === id);
const pick = { main: { id: 'm_bagel', zh: '原味貝果' }, drink: { id: 'm_latte', zh: '黑糖拿鐵' } };

test('單品估清：套餐的這個選項不能選（客人端、POS 選項面板），其他選項照常', () => {
  const j = T.setSoldOut(menu(), 'm_latte', true, null, NOW);
  const doc = MenuLib.parseMenuDoc(j);
  const combo = doc.items.find(x => x.id === 'm_combo');
  assert.deepEqual(MenuLib.comboOffChoices(combo, doc.items, NOW).map(c => c.id), ['m_latte']);
  assert.equal(MenuLib.comboAvailable(combo, doc.items, NOW), true);
  const m = T.menuIndex(j, 'CAFE', { now: NOW });
  assert.ok(m.has('m_combo'));
  assert.throws(() => T.addLine([], m, { item_id: 'm_combo', qty: 1, guest: 'abcdefgh', combo: pick }), /今天無法供應/);
  assert.equal(T.addLine([], m, { item_id: 'm_combo', qty: 1, guest: 'abcdefgh', combo: { ...pick, drink: { id: 'm_oolong', zh: '紅烏龍' } } }).length, 1);
  const real = Date; globalThis.Date = class extends real { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW.getTime(); } };
  try {
    const g = OrderLib.comboGroups(combo, doc.items, 'zh').find(x => x.key === 'drink');
    assert.deepEqual(g.ids, ['m_oolong']);
  } finally { globalThis.Date = real; }
});

test('選擇欄全部估清：整個套餐視同售完、客人點不到', () => {
  let j = T.setSoldOut(menu(), 'm_latte', true, null, NOW);
  j = T.setSoldOut(j, 'm_oolong', true, null, NOW);
  assert.ok(!T.menuIndex(j, 'CAFE', { now: NOW }).has('m_combo'));
  const doc = MenuLib.parseMenuDoc(j);
  assert.equal(MenuLib.comboAvailable(doc.items.find(x => x.id === 'm_combo'), doc.items, NOW), false);
  assert.ok(T.menuIndex(j, 'CAFE', { now: new Date(NOW.getTime() + 86400e3) }).has('m_combo'), '隔天恢復');
});

test('原物料反查：直接用到＋經由備料（黑糖→黑糖漿→品項）都算', () => {
  const items = new Map([
    ['inv_sugar', { id: 'inv_sugar', kind: 'raw', bom: [] }],
    ['inv_syrup', { id: 'inv_syrup', kind: 'prep', bom: [{ inv_id: 'inv_sugar', qty: 500 }] }],
    ['inv_tea', { id: 'inv_tea', kind: 'raw', bom: [] }],
  ]);
  const recipes = { m_latte: [{ inv_id: 'inv_syrup', qty: 20 }], m_milk: [{ inv_id: 'inv_syrup', qty: 20 }], m_oolong: [{ inv_id: 'inv_tea', qty: 1 }] };
  assert.deepEqual(INV.menuIdsUsing('inv_sugar', recipes, items).sort(), ['m_latte', 'm_milk']);
  assert.deepEqual(INV.menuIdsUsing('inv_tea', recipes, items), ['m_oolong']);
});

test('原物料估清／恢復：只恢復因它而估清的品項；手動估清不動；兩個原物料都恢復才供應', () => {
  let j = T.setSoldOut(menu(), 'm_milk', true, null, NOW);   // 黑糖牛奶先手動估清
  let r = T.setMaterialSoldOut(j, 'inv_sugar', ['m_latte', 'm_milk'], true, null, NOW);
  assert.deepEqual(r.changed, ['m_latte']);
  assert.deepEqual(item(r.json, 'm_latte').sold_out_by, ['inv_sugar']);
  assert.equal(item(r.json, 'm_milk').sold_out_by.length, 0);
  r = T.setMaterialSoldOut(r.json, 'inv_milk', ['m_latte'], true, null, NOW);
  assert.deepEqual(item(r.json, 'm_latte').sold_out_by, ['inv_sugar', 'inv_milk']);
  r = T.setMaterialSoldOut(r.json, 'inv_sugar', ['m_latte', 'm_milk'], false, null, NOW);
  assert.equal(MenuLib.soldOutToday(item(r.json, 'm_latte'), NOW), true, '還缺牛奶');
  assert.equal(MenuLib.soldOutToday(item(r.json, 'm_milk'), NOW), true, '手動估清不被恢復');
  r = T.setMaterialSoldOut(r.json, 'inv_milk', ['m_latte'], false, null, NOW);
  assert.equal(MenuLib.soldOutToday(item(r.json, 'm_latte'), NOW), false);
  // 原物料估清的單品也連動套餐選項
  r = T.setMaterialSoldOut(menu(), 'inv_sugar', ['m_latte'], true, null, NOW);
  const doc = MenuLib.parseMenuDoc(r.json);
  assert.deepEqual(MenuLib.comboOffChoices(doc.items.find(x => x.id === 'm_combo'), doc.items, NOW).map(c => c.id), ['m_latte']);
  // 店別把關
  assert.deepEqual(T.setMaterialSoldOut(menu(), 'inv_sugar', ['m_latte'], true, ['BAR'], NOW).changed, []);
  // 手動恢復清掉原物料標記；後台存檔沿用現值
  assert.deepEqual(item(T.setSoldOut(r.json, 'm_latte', false, null, NOW), 'm_latte').sold_out_by, []);
  assert.ok(T.LIVE_MENU_FIELDS ? T.LIVE_MENU_FIELDS.includes('sold_out_by') : true);
  const kept = JSON.parse(T.keepLiveMenuFields(r.json, menu())).items.find(x => x.id === 'm_latte');
  assert.deepEqual(kept.sold_out_by, ['inv_sugar']); assert.equal(kept.sold_out, DAY);
});

test('原物料估清狀態隔天失效', () => {
  const j = JSON.stringify({ inv_sugar: DAY, inv_old: '2026-11-01' });
  assert.deepEqual(Object.keys(T.materialSoldOutToday(j, NOW)), ['inv_sugar']);
});

test('接線：路由、API 文件、操作紀錄、POS 原物料區', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/api\/admin\/menu\/materials'/);
  assert.match(server, /app\.post\('\/api\/admin\/menu\/material-sold-out'/);
  assert.match(api, /### GET \/api\/admin\/menu\/materials/);
  assert.match(api, /### POST \/api\/admin\/menu\/material-sold-out/);
  assert.match(ops, /data-so-mat=/); assert.match(ops, /\/admin\/menu\/material-sold-out/);
  assert.match(ops, /comboAvailable\(it,MENU_DOC/);
});

test('估清頁分頁與搜尋（KK 11/15）：各分類＋原物料分頁、搜尋框跨分頁只切 hidden', () => {
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
  assert.match(ops, /data-so-tab=/); assert.match(ops, /\['MAT','原物料'\]/); assert.match(ops, /\['','全部品項'\]/);
  assert.match(ops, /id="so-q"[^>]*type="search"|type="search" id="so-q"/);
  assert.match(ops, /function soFilter\(host\)/);
  assert.doesNotMatch(ops, /<section class="so-sec"/, '官網 style.css 的 section 有 72–128px 上下內距，會在分頁下方留空白'); assert.match(ops, /data-so-text=/);
  assert.match(css, /\.so-item\[hidden\],\.so-sec\[hidden\]\{display:none\}/);
});
