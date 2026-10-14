// scripts/test-menu-other.mjs — 「其他」客製價格品項（pos_only + custom_price）：
// 客人掃碼點餐看不到、POS 才看得到；加點時現場輸入金額且經伺服器驗證，不同金額不合併。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');
const M = T.MenuLib;

const menuJson = JSON.stringify({ version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 180, published: true },
  { id: 'm_other', venue: 'CAFE', cat: 'OTHER', zh: '其他', price: 0, published: true, custom_price: true, pos_only: true },
  { id: 'm_other_bar', venue: 'BAR', cat: 'OTHER', zh: '其他', price: 0, published: true, custom_price: true, pos_only: true },
] });
const G = 'guest0000001';

test('pos_only 品項：客人端 menuIndex（預設）看不到；POS 端 {posOnly:true} 才看得到', () => {
  const guestMenu = T.menuIndex(menuJson);
  assert.ok(!guestMenu.has('m_other'), '客人掃碼點餐不該看到「其他」');
  assert.ok(guestMenu.has('m_latte'));
  const posMenu = T.menuIndex(menuJson, undefined, { posOnly: true });
  assert.ok(posMenu.has('m_other'), 'POS 代客加點看得到「其他」');
});

test('CAT_LABEL／CATS 含 OTHER，排在最後（分類排序不影響既有分類）', () => {
  assert.ok(M.CATS.includes('OTHER'));
  assert.equal(M.CAT_LABEL.OTHER.zh, '其他');
});

test('posAddLine：custom_price 品項採信伺服器驗證過的 price；其餘品項一律用菜單定價', () => {
  const posMenu = T.menuIndex(menuJson, undefined, { posOnly: true });
  const withOther = T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1, note: '客人要求加熱毛巾', price: 50 });
  assert.equal(withOther[0].price, 50);
  assert.equal(withOther[0].zh, '其他');
  // 一般品項：即使傳了 price 也忽略，一律用菜單定價
  const withLatte = T.posAddLine([], posMenu, { item_id: 'm_latte', qty: 1, price: 9999 });
  assert.equal(withLatte[0].price, 180);
});

test('posAddLine：custom_price 品項金額缺漏或超出 0–100000 範圍要擋', () => {
  const posMenu = T.menuIndex(menuJson, undefined, { posOnly: true });
  assert.throws(() => T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1 }), /金額/);
  assert.throws(() => T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1, price: -1 }), /金額/);
  assert.throws(() => T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1, price: 100001 }), /金額/);
});

test('custom_price 品項：不同金額的兩次加點不合併成一行；同金額、同人、無備註才合併', () => {
  const posMenu = T.menuIndex(menuJson, undefined, { posOnly: true });
  let items = T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1, price: 50 });
  items = T.posAddLine(items, posMenu, { item_id: 'm_other', qty: 1, price: 80 });
  assert.equal(items.length, 2, '不同金額要各自一行');
  let same = T.posAddLine([], posMenu, { item_id: 'm_other', qty: 1, price: 50 });
  same = T.posAddLine(same, posMenu, { item_id: 'm_other', qty: 1, price: 50 });
  assert.equal(same.length, 1, '同金額可合併數量');
  assert.equal(same[0].qty, 2);
});

test('安全邊界：custom_price 一律強制 pos_only，所以 /api/orders/:id/items（客人端，呼叫 addLine、未信任前端金額）\n' +
  '拿到的 menu 本來就查不到「其他」——即使在 body 塞了 price，也會因「品項不存在」被擋下，價格覆寫邏輯永遠碰不到', () => {
  const guestMenu = T.menuIndex(menuJson); // 真實客人端路徑：currentMenu() 不會傳 posOnly，等同這裡的預設呼叫
  assert.ok(!guestMenu.has('m_other'), 'pos_only 品項對客人端完全不可見');
  assert.throws(() => T.addLine([], guestMenu, { item_id: 'm_other', qty: 1, guest: G, price: 99999 }), /不存在/, '偽造 item_id／price 一樣擋在「品項不存在」');
});

test('即使刻意不給 pos_only（只給 custom_price），normalizeItem 仍會強制視為 pos_only，不留漏洞', () => {
  const doc = M.parseMenuDoc(JSON.stringify({ version: 1, items: [
    { id: 'm_x', venue: 'CAFE', cat: 'OTHER', zh: '測試', price: 0, published: true, custom_price: true, pos_only: false },
  ] }));
  assert.equal(doc.items[0].pos_only, true, 'custom_price:true 必定連帶 pos_only:true');
});
