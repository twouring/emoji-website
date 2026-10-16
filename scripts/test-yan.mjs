// 點數：消費累積／折抵／作廢沖回；數位會員卡 QR。避開已淘汰的購點／贈點 API。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Y = require('../lib/yan');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

test('台灣手機正規化：09、9、+886、886 都收成 +8869xxxxxxxx', () => {
  assert.equal(Y.normalizeTwPhone('0912-345-678'), '+886912345678');
  assert.equal(Y.normalizeTwPhone('912345678'), '+886912345678');
  assert.equal(Y.normalizeTwPhone('+886912345678'), '+886912345678');
  assert.equal(Y.normalizeTwPhone('886912345678'), '+886912345678');
  assert.equal(Y.normalizeTwPhone('02-2555-1234'), null);
  assert.equal(Y.normalizeTwPhone(''), null);
});

test('累點：每滿 100 元 1 點；不足 100 不給；預收不算', () => {
  assert.equal(Y.earnPoints(0), 0);
  assert.equal(Y.earnPoints(99), 0);
  assert.equal(Y.earnPoints(100), 1);
  assert.equal(Y.earnPoints(250), 2);
  assert.equal(Y.earnPoints(1999), 19);
  assert.equal(Y.earnPoints(100, { prepay: true }), 0);
});

test('效期：入帳當年 → 隔年 4/30 台北結束', () => {
  assert.equal(Y.expiresAt('2026-10-16T06:00:00.000Z'), '2027-04-30T15:59:59.999Z');
  assert.equal(Y.expiresAt('2027-01-01T00:00:00+08:00'), '2028-04-30T15:59:59.999Z');
});

test('帳本：累點冪等、餘額加總、過期不算、作廢沖回', () => {
  const now = new Date('2026-11-01T04:00:00.000Z');
  let rows = [];
  const a = Y.applyEarn(rows, { userId: 'u1', orderId: 'to_a', amount: 480, brand: 'CAFE', at: now });
  assert.equal(a.delta, 4);
  rows = a.rows;
  const again = Y.applyEarn(rows, { userId: 'u1', orderId: 'to_a', amount: 480, brand: 'CAFE', at: now });
  assert.equal(again.delta, 0);
  assert.equal(again.rows.length, 1);
  const b = Y.applyEarn(rows, { userId: 'u1', orderId: 'to_b', amount: 100, brand: 'BAR', at: now });
  rows = b.rows;
  assert.equal(Y.balance(rows, now), 5);

  const expired = Y.applyEarn(rows, { userId: 'u1', orderId: 'to_old', amount: 1000, brand: 'CAFE', at: new Date('2025-03-01T00:00:00+08:00') });
  rows = expired.rows;
  assert.equal(Y.balance(rows, now), 5, '已過 2026-04-30 的累點不計入');

  const voided = Y.applyVoidEarn(rows, { orderId: 'to_a' });
  assert.equal(voided.delta, -4);
  assert.equal(Y.balance(voided.rows, now), 1);
  assert.equal(Y.applyVoidEarn(voided.rows, { orderId: 'to_a' }).delta, 0, '作廢沖回冪等');
});

test('折抵：1 點＝1 元、不得超餘額／應收；作廢還點', () => {
  const now = new Date('2026-11-01T04:00:00.000Z');
  let rows = Y.applyEarn([], { userId: 'u1', orderId: 'to_e', amount: 5000, brand: 'CAFE', at: now }).rows;
  assert.equal(Y.balance(rows, now), 50);
  assert.throws(() => Y.applyRedeem(rows, { orderId: 'to_r', points: 51, amount: 180 }), /不足/);
  assert.throws(() => Y.applyRedeem(rows, { orderId: 'to_r', points: 200, amount: 180 }), /應收/);
  const r = Y.applyRedeem(rows, { orderId: 'to_r', points: 50, amount: 180 });
  assert.equal(r.delta, -50);
  assert.equal(r.used, 50);
  assert.equal(Y.balance(r.rows, now), 0);
  assert.equal(Y.applyRedeem(r.rows, { orderId: 'to_r', points: 10, amount: 180 }).delta, 0, '同一單折抵冪等');
  const back = Y.applyVoidRedeem(r.rows, { orderId: 'to_r' });
  assert.equal(back.delta, 50);
  assert.equal(Y.balance(back.rows, now), 50);
});

test('會員卡 token claims：plan=yan-card，不依賴會籍', () => {
  const c = Y.cardClaims({ id: 'u_1', name: '阿明' });
  assert.equal(c.sub, 'u_1');
  assert.equal(c.ent, 'yan-card');
  assert.equal(c.plan, 'yan-card');
  assert.equal(c.name, '阿明');
});

test('server.js：yan_ledger 建表、lookup／card／yan 路由；避開舊購點路徑', () => {
  const server = read('server.js');
  assert.match(server, /CREATE TABLE IF NOT EXISTS yan_ledger/);
  assert.match(server, /app\.get\('\/api\/me\/yan'/);
  assert.match(server, /app\.get\('\/api\/me\/card'/);
  assert.match(server, /app\.post\('\/api\/admin\/yan\/lookup'/);
  assert.doesNotMatch(server, /\/api\/me\/points|point_ledger|grantMembershipGift|points_balance/);
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\|yan\)/);
  assert.match(server, /yan\.applyEarn|require\('\.\/lib\/yan'\)/);
});

test('POS 結帳可帶會員電話／卡，會員頁有點數與會員卡', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /yan\/lookup/);
  assert.match(ops, /MEMBER_PHONE|member_phone/);
  const pages = ['public/member.html', 'public/en/member.html', 'public/ja/member.html'];
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /\/api\/me\/yan/, f);
    assert.match(html, /\/api\/me\/card/, f);
    assert.doesNotMatch(html, /\/api\/me\/points|點數錢包|購買點數|renderPoints/, f);
  }
});

test('會員價：emo 空白＝九折；有填用 emo；現場輸入金額不打折', () => {
  const M = require('../public/menu-lib.js') && globalThis.MenuLib;
  assert.equal(M.memberPrice({ price: 320, emo: 0 }), 288);
  assert.equal(M.memberPrice({ price: 185, emo: 0 }), 167);
  assert.equal(M.memberPrice({ price: 320, emo: 250 }), 250);
  assert.equal(M.memberPrice({ price: 100, emo: 0, custom_price: true }), 100);
  const T = require('../lib/table-orders');
  const menu = new Map([['a', { id: 'a', price: 200, emo: 0 }], ['b', { id: 'b', price: 200, emo: 150 }]]);
  const out = T.applyMemberPrice([{ item_id: 'a', price: 200 }, { item_id: 'b', price: 200 }, { item_id: 'a', price: 0 }, { item_id: 'x', price: 50 }], menu);
  assert.deepEqual(out.map(l => l.price), [180, 150, 0, 50]);
  assert.equal(out[0].regular_price, 200);
});

test('POS：掃會員條碼套會員價、手機只累點', () => {
  const ops = read('public/pos-ops.js'), srv = read('server.js');
  assert.match(ops, /pos-yan-scan/);
  assert.match(ops, /body:\{token\}/);
  assert.match(ops, /member_id/);
  assert.match(srv, /member_id/);
  // 手機查會員不再自動打開會員價
  assert.doesNotMatch(ops, /balance:out\.balance\|\|0\};POS_MEMBER=true;return `\$\{out\.member\?\.name\|\|'會員'\} · \$\{out/);
});
