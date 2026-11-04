import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const tableOrders = require('../lib/table-orders.js');
const { MenuLib } = tableOrders;

test('甜點與商店品兩店共用（KK 11/2：三點水 POS 要放甜點）', () => {
  assert.ok(MenuLib.isShared({ cat: 'DESSERT' }));
  assert.ok(MenuLib.isShared({ cat: 'SHOP' }));
  assert.ok(!MenuLib.isShared({ cat: 'COFFEE' }));
  for (const f of ['public/pos-ops.js', 'public/pos-inventory.js']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!s.includes("it.cat==='SHOP')"), f + ' 店別過濾要用 MenuLib.isShared');
    assert.ok(s.includes('MenuLib.inVenue(it,SCOPE)'), f + ' 店別過濾要用 MenuLib.inVenue（KK 11/5 資料來源統一）');
  }
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(srv.includes('const shopItem=tableOrders.MenuLib.isShared(it);'));
});

test('三點水 POS 加在咖啡的甜點：行記 BAR（收服務費、進三點水日結）', () => {
  const menu = new Map([['d1', { id: 'd1', venue: 'CAFE', cat: 'DESSERT', zh: '檸檬塔', en: 'Lemon Tart', price: 130, published: true }]]);
  const out = tableOrders.posAddLine([], menu, { item_id: 'd1', qty: 1, venue: 'BAR' });
  assert.equal(out[0].venue, 'BAR');
  assert.equal(out[0].cat, 'DESSERT');
  const svc = MenuLib.serviceCharge(out, { now: '2026-11-02T13:00:00Z' });
  assert.equal(svc.amount, 13);
  const kept = tableOrders.posAddLine([], menu, { item_id: 'd1', qty: 1 });
  assert.equal(kept[0].venue, 'CAFE');
});

test('客人掃碼：三點水時段也點得到甜點，記在 BAR；商店品仍不進桌邊', () => {
  const bar = { venue: 'BAR', food: true, drink: true };
  assert.ok(MenuLib.orderableInWindow({ venue: 'CAFE', cat: 'DESSERT' }, bar));
  assert.ok(!MenuLib.orderableInWindow({ venue: 'CAFE', cat: 'SALAD' }, bar));
  assert.ok(!MenuLib.orderableInWindow({ venue: 'CAFE', cat: 'DESSERT' }, { venue: 'BAR', food: false, drink: true }));
  const doc = JSON.stringify({ items: [
    { id: 'd1', venue: 'CAFE', cat: 'DESSERT', zh: '檸檬塔', en: 'Lemon Tart', price: 130, published: true },
    { id: 's1', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', en: 'Brush', price: 60, published: true },
  ] });
  const m = tableOrders.menuIndex(doc, 'BAR');
  assert.ok(m.has('d1'));
  assert.ok(!m.has('s1'));
  const out = tableOrders.addLine([], m, { item_id: 'd1', qty: 1, guest: 'abcdefgh', venue: 'BAR' });
  assert.equal(out[0].venue, 'BAR');
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(srv.includes("addLine(items,menu,{...(req.body||{}),venue:tableOrders.MenuLib.orderWindow().venue})"));
});
