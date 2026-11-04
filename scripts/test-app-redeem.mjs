import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const Y = require('../lib/yan.js');

const menu = new Map([['a', { id: 'a', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', en: 'Americano', ja: '', price: 150, points: 15 }], ['b', { id: 'b', venue: 'CAFE', cat: 'COFFEE', zh: '無兌換', price: 100, points: 0 }]]);

test('addRedeemLine：0 元、原價留 regular_price、記點數與兌換者', () => {
  const r = T.addRedeemLine([], menu, { item_id: 'a', by: '小明', guest: 'app12345678', userId: 'u1' });
  const l = r.items[0];
  assert.equal(l.price, 0); assert.equal(l.regular_price, 150); assert.equal(l.redeem_points, 15);
  assert.equal(l.app_redeem, true); assert.equal(l.redeem_user, 'u1'); assert.equal(T.sum(r.items), 0);
});
test('addRedeemLine：points=0 或不存在回 400', () => {
  assert.throws(() => T.addRedeemLine([], menu, { item_id: 'b', guest: 'app12345678', userId: 'u1' }), e => e.status === 400);
  assert.throws(() => T.addRedeemLine([], menu, { item_id: 'zz', guest: 'app12345678', userId: 'u1' }), e => e.status === 400);
});
test('扣點與退點：以 rl_<行號> 為 ref，各只一次', () => {
  const rows0 = Y.applyEarn([], { userId: 'u1', orderId: 'o1', amount: 3000 }).rows;
  const r = Y.applyRedeem(rows0, { orderId: 'rl_x', points: 15, userId: 'u1', refType: 'line' });
  assert.equal(Y.balance(r.rows), 15);
  const v = Y.applyVoidRedeem(r.rows, { orderId: 'rl_x' });
  assert.equal(Y.balance(v.rows), 30);
  assert.equal(Y.applyVoidRedeem(v.rows, { orderId: 'rl_x' }).delta, 0);
});
test('伺服器：/api/me/redeem 驗桌碼並在移除／清桌時退點；菜單回填 1 點＝NT$10', () => {
  const s = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(s, /app\.post\('\/api\/me\/redeem'/);
  assert.match(s, /verifySession\(req\.body\?\.s, req\.body\?\.k, SECRET\)/);
  assert.match(s, /refundAppRedeems\(client,s\.items\.filter/);
  assert.match(s, /Math\.ceil\(it\.price \/ 10\)/);
  assert.match(s, /menu_points_seed_v1/);
});

test('addRedeemLine：共用甜點記當下店別（三點水時段兌換要出在三點水的單，KK 11/5）', () => {
  const m = new Map([['d', { id: 'd', venue: 'CAFE', cat: 'DESSERT', zh: '原味費南雪', price: 90, points: 9 }], ['a', menu.get('a')]]);
  assert.equal(T.addRedeemLine([], m, { item_id: 'd', guest: 'app12345678', userId: 'u1', venue: 'BAR' }).line.venue, 'BAR');
  assert.equal(T.addRedeemLine([], m, { item_id: 'a', guest: 'app12345678', userId: 'u1', venue: 'BAR' }).line.venue, 'CAFE', '非共用品項維持原店別');
});
test('伺服器：兌換加進購物車不扣點，送出／結帳才扣（KK 11/5）', () => {
  const s = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const r = s.slice(s.indexOf("app.post('/api/me/redeem'"), s.indexOf("app.post('/api/orders/table/member'"));
  assert.doesNotMatch(r, /applyRedeem|persistYanDiff/, '加進購物車時不可扣點');
  assert.match(r, /bal - pending < per/, '要扣掉購物車裡未送出的兌換再比餘額');
  assert.match(r, /venue: tableOrders\.MenuLib\.orderWindow\(\)\.venue/);
  const mut = s.slice(s.indexOf('async function mutateItems('), s.indexOf("app.post('/api/orders/:id/items'"));
  assert.match(mut, /await chargeAppRedeems\(client,newlyPlaced\)/);
  const pay = s.slice(s.indexOf("app.post('/api/orders/:id/pay'"), s.indexOf("app.get('/api/admin/orders/kitchen-print-jobs'"));
  assert.match(pay, /chargeAppRedeems\(client,lines\.filter\(l=>!l\.placed_at\)\)/);
  const co = s.slice(s.indexOf("/sessions/:id/checkout'"));
  assert.match(co.slice(0, 12000), /chargeAppRedeems\(client,orderLines\.filter\(l=>!l\.placed_at\)\)/);
  assert.match(s, /function chargeAppRedeems[\s\S]{0,600}applyRedeem\(before, \{ orderId: 'rl_' \+ l\.line/);
});
test('前端：可用點數扣掉購物車裡未送出的兌換、送出後重抓餘額', () => {
  const h = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(h, /function pendingRedeem\(\)/);
  assert.match(h, /bal=Math\.max\(0,\(ME\.balance\|\|0\)-pendingRedeem\(\)\)/);
  assert.match(h, /\/place',\{method:'POST'[^;]*\.then\(function\(s\)\{applyState\(s\);if\(ME\)joinMember\(\);/);
});
