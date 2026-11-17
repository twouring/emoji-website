import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const tableOrders = require('../lib/table-orders.js');
const { MenuLib } = tableOrders;

/* KK 11/11 菜單分開（取代 11/2 的甜點／商店品兩店共用）：甜點各品牌一份、各自估清；
   商店品（SHOP）屬言文字聚落，只在會員 App 線上買，任何品牌 POS 與桌邊點餐都看不到、不能結帳。 */
test('沒有共用品項：isShared 一律 false；POS 店別過濾仍統一走 MenuLib.inVenue', () => {
  assert.equal(MenuLib.isShared({ cat: 'DESSERT' }), false);
  assert.equal(MenuLib.isShared({ cat: 'SHOP' }), false);
  for (const f of ['public/pos-ops.js', 'public/pos-inventory.js']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(s.includes('MenuLib.inVenue(it,SCOPE)'), f + ' 店別過濾要用 MenuLib.inVenue（KK 11/5 資料來源統一）');
  }
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(!srv.includes('MenuLib.isShared('), 'server 不再有共用品項分支');
});

test('約書旅 POS 不顯示別家甜點與商店品，只顯示自己的空間方案', () => {
  const doc = JSON.stringify({ items: [
    { id: 'd1', venue: 'CAFE', cat: 'DESSERT', zh: '檸檬塔', price: 130, published: true },
    { id: 'r1', venue: 'REST', cat: 'SPACE', zh: '貴賓室入場 1 小時', price: 150, published: true, pos_only: true },
    { id: 's1', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', price: 60, published: true },
  ] });
  assert.deepEqual([...tableOrders.menuIndex(doc, 'REST', { posOnly: true }).keys()], ['r1']);
});

test('三點水賣甜點用自己那一份：行記 BAR、收服務費；POS 傳別的 venue 也不會改記', () => {
  const menu = new Map([['d1_bar', { id: 'd1_bar', venue: 'BAR', cat: 'DESSERT', zh: '檸檬塔', price: 130, published: true }]]);
  const out = tableOrders.posAddLine([], menu, { item_id: 'd1_bar', qty: 1, venue: 'CAFE' });
  assert.equal(out[0].venue, 'BAR');
  assert.equal(MenuLib.serviceCharge(out, { now: '2026-11-02T13:00:00Z' }).amount, 13);
});

test('客人掃碼：三點水時段只點得到三點水自己的甜點；商店品不進桌邊', () => {
  const bar = { venue: 'BAR', food: true, drink: true };
  assert.ok(!MenuLib.orderableInWindow({ venue: 'CAFE', cat: 'DESSERT' }, bar));
  assert.ok(MenuLib.orderableInWindow({ venue: 'BAR', cat: 'DESSERT' }, bar));
  const doc = JSON.stringify({ items: [
    { id: 'd1', venue: 'CAFE', cat: 'DESSERT', zh: '檸檬塔', price: 130, published: true },
    { id: 'd1_bar', venue: 'BAR', cat: 'DESSERT', zh: '檸檬塔', price: 130, published: true },
    { id: 's1', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', price: 60, published: true },
  ] });
  assert.deepEqual([...tableOrders.menuIndex(doc, 'BAR').keys()], ['d1_bar']);
});

test('商店品 POS 不能加、不能結帳（KK 11/11 D4：只在會員 App 線上 Stripe 購買）', () => {
  const shop = { id: 's1', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', price: 60, published: true };
  assert.equal(MenuLib.isOrderable(shop, new Date(), { posOnly: true }), false);
  assert.equal(MenuLib.isOrderable(shop, new Date(), { shop: true }), true);
  assert.throws(() => tableOrders.posAddLine([], new Map([['s1', shop]]), { item_id: 's1', qty: 1 }), e => e.status === 403);
  const line = { line: 'a', item_id: 's1', cat: 'SHOP', venue: 'CAFE', price: 60, qty: 1, zh: '牙刷' };
  assert.throws(() => tableOrders.posCheckout([line], { method: 'cash' }, new Map()), e => e.status === 403);
});
