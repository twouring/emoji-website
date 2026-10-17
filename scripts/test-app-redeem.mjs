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
  assert.match(s, /verifyTable\(req\.body\?\.t, req\.body\?\.k, SECRET\)/);
  assert.match(s, /refundAppRedeems\(client,s\.items\.filter/);
  assert.match(s, /Math\.ceil\(it\.price \/ 10\)/);
  assert.match(s, /menu_points_seed_v1/);
});
