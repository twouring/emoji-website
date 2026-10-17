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

test('兌換扣點：不得超餘額、同一單冪等；作廢還點', () => {
  const now = new Date('2026-11-01T04:00:00.000Z');
  let rows = Y.applyEarn([], { userId: 'u1', orderId: 'to_e', amount: 5000, brand: 'CAFE', at: now }).rows;
  assert.equal(Y.balance(rows, now), 50);
  assert.throws(() => Y.applyRedeem(rows, { orderId: 'to_r', points: 51 }), /不足/);
  assert.throws(() => Y.applyRedeem(rows, { orderId: 'to_r', points: 0 }), /正整數/);
  const r = Y.applyRedeem(rows, { orderId: 'to_r', points: 50 });
  assert.equal(r.delta, -50);
  assert.equal(r.used, 50);
  assert.equal(Y.balance(r.rows, now), 0);
  assert.equal(Y.applyRedeem(r.rows, { orderId: 'to_r', points: 10 }).delta, 0, '同一單兌換冪等');
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
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|analytics\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\|yan\)/);
  assert.match(server, /yan\.applyEarn|require\('\.\/lib\/yan'\)/);
});

test('POS 結帳可帶會員電話／卡，會員頁有點數與會員卡', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /yan\/lookup/);
  assert.match(ops, /MEMBER_PHONE|member_phone/);
  const pages = ['public/m.html'];
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

test('點數兌換品項：該行變 0 元、扣菜單點數、不折抵金額；不開放的品項擋下', () => {
  const T = require('../lib/table-orders');
  const menu = new Map([['a', { id: 'a', price: 200, emo: 0, points: 150 }], ['b', { id: 'b', price: 100, emo: 0, points: 0 }]]);
  const items = [{ line: 'l1', item_id: 'a', zh: '拿鐵', price: 200, qty: 2, venue: 'CAFE' }, { line: 'l2', item_id: 'b', zh: '吐司', price: 100, qty: 1, venue: 'CAFE' }];
  const out = T.posCheckout(items, { method: 'cash', redeem_lines: ['l1'] }, menu);
  assert.equal(out.amount, 100, '拿鐵 2 杯兌換變 0，只剩吐司 100');
  assert.equal(out.payer.yan_redeem_points, 300);
  assert.equal(out.lines[0].redeem_points, 300); assert.equal(out.lines[0].regular_price, 200);
  assert.throws(() => T.posCheckout(items, { method: 'cash', redeem_lines: ['l2'] }, menu), /不開放點數兌換/);
  assert.throws(() => T.posCheckout(items, { method: 'cash', redeem_lines: ['zzz'] }, menu), /不在這次結帳/);
  assert.equal(T.posCheckout(items, { method: 'cash' }, menu).amount, 500, '沒選兌換就照原價');
  assert.equal(T.posCheckout(items, { method: 'cash', yan_points: 50 }, menu).amount, 500, '舊的 yan_points 折抵已移除、不再折錢');
  assert.equal(T.invoiceDiscount, undefined);
  assert.match(read('public/menu-lib.js'), /zh: '聚落價'/);
  assert.equal(globalThis.MenuLib.normalizeItem({ cat: 'COFFEE', zh: 'x', price: 1, points: 80.7 }).points, 80);
});

test('兌換空間時數：扣點、單日會籍、只認掃碼確認的有效會籍', () => {
  assert.deepEqual(Y.parseSpaceRewards('{"day_4h":200,"day_12h":"500","x":9}'), { day_4h: 200, day_12h: 500 });
  assert.deepEqual(Y.parseSpaceRewards('壞掉'), { day_4h: 0, day_12h: 0 }, '沒設定＝不開放');
  assert.deepEqual(Y.parseSpaceRewards({ day_4h: -5 }), { day_4h: 0, day_12h: 0 });
  const rows = Y.applyEarn([], { userId: 'u1', orderId: 'o1', amount: 30000, brand: 'CAFE' }).rows;
  const r = Y.applyRedeem(rows, { orderId: 'en_x', points: 200, amount: 200, userId: 'u1', refType: 'space' });
  assert.equal(r.rows.at(-1).ref_type, 'space'); assert.equal(Y.balance(r.rows), 100);
  assert.throws(() => Y.applyRedeem(Y.applyEarn([], { userId: 'u1', orderId: 'o2', amount: 10000 }).rows, { orderId: 'en_y', points: 200, amount: 200, userId: 'u1' }), /點數不足/);
  const srv = read('server.js');
  assert.match(srv, /redeem-space/);
  assert.match(srv, /verified=!!\(cardTok\|\|memberIdRaw\)/);
  assert.match(srv, /memberActive=verified&&memberUser\?\(await memberAccessFor\(memberUser\.id\)\)\.active:false/);
  assert.match(srv, /點數兌換請先掃會員條碼確認身分/);
  const ops = read('public/pos-ops.js');
  assert.doesNotMatch(ops, /id="pos-member"/, '不能再手動勾選聚落價');
  assert.match(ops, /data-redeem/); assert.match(ops, /pos-yan-space/); assert.doesNotMatch(ops, /pos-yan-redeem/);
});

test('兌換列像折扣：日結／CSV 統計兌換點數與折抵；作廢還原；設定入口', () => {
  const T = require('../lib/table-orders');
  const mk = (id, items) => ({ id, status: 'paid', amount: 100, paid_at: new Date().toISOString(), payer: { method: 'cash' }, items });
  const redeemed = { line: 'l1', item_id: 'a', zh: '拿鐵', qty: 2, price: 0, regular_price: 150, redeem_points: 300, venue: 'CAFE' };
  const plain = { line: 'l2', item_id: 'b', zh: '吐司', qty: 1, price: 100, venue: 'CAFE' };
  const sum = T.salesSummary([mk('o1', [redeemed, plain]), mk('o2', [plain])], {});
  assert.equal(sum.redeem_points, 300); assert.equal(sum.redeem_count, 1); assert.equal(sum.redeem_value, 300);
  const csv = T.salesCsvRows([mk('o1', [redeemed, plain])], {});
  assert.ok(csv.some(r => String(r[3]).includes('點數兌換 300 點，折抵 NT$300')));
  const srv = read('server.js'), ops = read('public/pos-ops.js'), adm = read('public/admin.html');
  assert.match(srv, /redeem_points:undefined/, '作廢單要還原兌換行');
  assert.match(srv, /yan\.parseSpaceRewards\(await contentValue\('yan_rewards'\)\)/);
  assert.match(read('lib/security.js'), /'yan_rewards'/);
  assert.match(read('lib/pos-register.js'), /redeem_points/);
  assert.match(ops, /點數兌換 \$\{num\(rd\.points\)\} 點/, '收據另列兌換折抵');
  assert.match(adm, /id="yr-save"/); assert.match(adm, /'updates','menu'/);
});

test('手動給點：必填原因與經手人、1–1000、算入餘額且記錄留痕', () => {
  const op = { id: 'st_1', name: '小明' };
  const r = Y.applyGrant([], { userId: 'u1', points: 5, reason: '活動贈點', operator: op });
  assert.equal(Y.balance(r.rows), 5);
  assert.equal(r.rec.kind, 'grant');
  assert.equal(r.rec.reason, '活動贈點');
  assert.equal(r.rec.operator_id, 'st_1');
  assert.equal(r.rec.operator_name, '小明');
  assert.throws(() => Y.applyGrant([], { userId: 'u1', points: 5, reason: '', operator: op }), /原因/);
  assert.throws(() => Y.applyGrant([], { userId: 'u1', points: 5, reason: '補償' }), /識別碼/);
  assert.throws(() => Y.applyGrant([], { userId: 'u1', points: 0, reason: '補償', operator: op }), /整數/);
  assert.throws(() => Y.applyGrant([], { userId: 'u1', points: 1001, reason: '補償', operator: op }), /整數/);
  const spent = Y.applyRedeem(r.rows, { orderId: 'o1', points: 3, userId: 'u1' });
  assert.equal(Y.balance(spent.rows), 2);
});

test('手動給點 API 與 POS 按鈕存在，且走操作者驗證', () => {
  const srv = read('server.js'), pos = read('public/pos-ops.js');
  assert.match(srv, /\/api\/admin\/yan\/grant[\s\S]{0,400}resolveOperator/);
  assert.match(pos, /pos-yan-grant/);
  assert.match(pos, /admin\/yan\/grant[\s\S]{0,200}operator_id/);
});
