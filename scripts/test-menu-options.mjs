// 自訂選項（KK 11/18：子租戶要能改菜單與餐飲選項）：辣度、加料等由店家自訂，可加價；伺服器依備註計價
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/menu-lib.js'); require('../public/order-lib.js');
const ML = globalThis.MenuLib, OL = globalThis.OrderLib;
const C = require('../lib/menu-content.js');
const T = require('../lib/table-orders.js');
const M = require('../lib/pos-mcp.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('文字格式解析：名稱 ≤6 字、至少 2 選項、加價 0–1000、重複名稱去掉', () => {
  const o = ML.optionsFromText('辣度：不辣、小辣、大辣\n加料：不加、加蛋+20、加起司 + 30\n只有一個：A\n辣度：重複、重複2');
  assert.deepEqual(o, [{ label: '辣度', choices: [{ zh: '不辣', add: 0 }, { zh: '小辣', add: 0 }, { zh: '大辣', add: 0 }] }, { label: '加料', choices: [{ zh: '不加', add: 0 }, { zh: '加蛋', add: 20 }, { zh: '加起司', add: 30 }] }]);
  assert.equal(ML.optionsToText(o), '辣度：不辣、小辣、大辣\n加料：不加、加蛋+20、加起司+30');
  assert.equal(ML.normalizeOptions([{ label: '這個名稱太長了啦', choices: ['a', 'b'] }])[0].label, '這個名稱太長');
});

test('optionGroups：自訂選項接在系統規格後；auto_options:false 只剩自訂；套餐內選品不列有加價的組', () => {
  const it = { cat: 'MAIN', zh: '咖哩飯', options: [{ label: '辣度', choices: [{ zh: '不辣' }, { zh: '大辣' }] }, { label: '加料', choices: [{ zh: '不加' }, { zh: '加蛋', add: 20 }] }] };
  const g = OL.optionGroups(it, 'zh');
  assert.deepEqual(g.map(x => x.label), ['飯量', '辣度', '加料']);
  assert.deepEqual(g[2].choices, ['不加', '加蛋 +$20']);
  assert.deepEqual(OL.optionGroups({ ...it, auto_options: false }, 'en').map(x => x.label), ['辣度', '加料']);
  assert.deepEqual(OL.optionGroups(it, 'zh', { inCombo: true }).map(x => x.label), ['飯量', '辣度']);
  assert.deepEqual(OL.optionGroups({ cat: 'COFFEE', zh: '拿鐵', auto_options: false }, 'zh'), [], '關掉系統選項且沒自訂＝沒有選項');
});

test('計價：伺服器依備註加價，對不上的值當預設；會員價只折本價', () => {
  const menu = new Map([['a', ML.normalizeItem({ id: 'a', venue: 'CAFE', cat: 'MAIN', zh: '咖哩飯', price: 200, published: true, options: [{ label: '加料', choices: [{ zh: '不加' }, { zh: '加蛋', add: 20 }] }] })]]);
  const g = 'abcdefgh1';
  let items = T.addLine([], menu, { item_id: 'a', qty: 1, guest: g, note: '飯量：正常飯；加料：加蛋 +$20' });
  assert.equal(items[0].price, 220);
  items = T.addLine([], menu, { item_id: 'a', qty: 1, guest: g, note: '加料：加蛋 +$999' });
  assert.equal(items[0].price, 220, '加價看菜單，不看客人送的數字');
  items = T.addLine([], menu, { item_id: 'a', qty: 1, guest: g, note: '加料：亂寫' });
  assert.equal(items[0].price, 200);
  const one = T.addLine([], menu, { item_id: 'a', qty: 1, guest: g, note: '加料：加蛋 +$20' });
  assert.equal(T.applyMemberPrice(one, menu)[0].price, 180 + 20, '本價九折＋加價原價');
  const ed = T.editLine(one, one[0].line, { note: '加料：不加', item: menu.get('a') });
  assert.equal(ed[0].price, 200, '櫃檯改規格跟著改價');
  const ge = T.guestEditLine(one, menu, one[0].line, { guest: g, qty: 1, note: '' });
  assert.equal(ge[0].price, 200);
});

test('內容管理：options_text 寫入、看不懂的行 400、view 回 options_text／auto_options、修改其他欄位不丟選項', () => {
  const menu = JSON.stringify({ version: 1, items: [{ id: 'a', venue: 'CAFE', cat: 'MAIN', zh: '咖哩飯', price: 200, published: true }] });
  const out = C.editItem(menu, { id: 'a', options_text: '辣度：不辣、大辣', auto_options: false }, { venues: ['CAFE'] });
  assert.deepEqual(out.item.options, [{ label: '辣度', choices: [{ zh: '不辣', add: 0 }, { zh: '大辣', add: 0 }] }]);
  assert.equal(out.item.auto_options, false);
  const v = C.view(out.item); assert.equal(v.options_text, '辣度：不辣、大辣'); assert.equal(v.auto_options, false);
  const again = C.editItem(out.json, { id: 'a', price: 210 }, { venues: ['CAFE'] });
  assert.equal(again.item.options.length, 1); assert.equal(again.item.auto_options, false);
  assert.throws(() => C.editItem(menu, { id: 'a', options_text: '只有一個：A' }, { venues: ['CAFE'] }), /看不懂/);
  const cleared = C.editItem(out.json, { id: 'a', options_text: '', auto_options: true }, { venues: ['CAFE'] });
  assert.deepEqual(cleared.item.options, []); assert.equal(cleared.item.auto_options, undefined);
});

test('接線：MCP pos_menu_save 收 options_text／auto_options；POS 菜單內容表單有欄位；後台存檔帶回 options', () => {
  const t = M.TOOLS.find(x => x.name === 'pos_menu_save');
  assert.ok(t.inputSchema.properties.options_text && t.inputSchema.properties.auto_options);
  assert.match(read('lib/pos-mcp.js'), /'combo_text', 'options_text', 'auto_options'\]/);
  const pc = read('public/pos-content.js');
  assert.match(pc, /id="mc-options"/); assert.match(pc, /id="mc-auto"/); assert.match(pc, /body\.options_text=g\('#mc-options'\)\.value/);
  assert.match(read('public/admin.html'), /options: \(MENU_DOC\.items\.find/);
});
