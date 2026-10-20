// scripts/test-bar-service-charge.mjs — 三點水 10% 服務費與低消（10/19 員工大會 K3，11/1 起實施）
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');
const M = T.MenuLib;
const E = require('../lib/ezpay-invoice');

const at = s => new Date(s + '+08:00').getTime();
const NOV_WED = at('2026-11-04T20:00:00'), NOV_SAT = at('2026-11-07T20:00:00'), NOV_SAT_LATE = at('2026-11-08T01:30:00'), OCT = at('2026-10-31T20:00:00');
const bar = (price, qty = 1, extra = {}) => ({ line: 'l' + Math.random().toString(36).slice(2, 8), venue: 'BAR', cat: 'MAIN', zh: '烏龍麵', price, qty, ...extra });
const cafe = (price, qty = 1) => ({ line: 'c' + Math.random().toString(36).slice(2, 8), venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price, qty });

test('服務費：11/1 起三點水內用外加 10%，四捨五入；10/31 前、外帶、在咖啡不收', () => {
  assert.deepEqual(M.serviceCharge([bar(320), bar(185)], { now: NOV_WED }), { rate: 0.1, base: 505, amount: 51 });
  assert.equal(M.serviceCharge([bar(320)], { now: OCT }), null, '10/31 還沒實施');
  assert.equal(M.serviceCharge([bar(320)], { now: NOV_WED, takeout: true }), null, '外帶不收');
  assert.equal(M.serviceCharge([cafe(180)], { now: NOV_WED }), null, '在咖啡不收');
  assert.deepEqual(M.serviceCharge([bar(300), cafe(200)], { now: NOV_WED }), { rate: 0.1, base: 300, amount: 30 }, '混桌只算三點水品項');
  assert.deepEqual(M.serviceCharge([bar(300), cafe(200)], { now: NOV_WED, discount: 100 }), { rate: 0.1, base: 240, amount: 24 }, '整單折扣依比例攤到三點水');
  assert.equal(M.serviceCharge([bar(300, 1, { cancelled: true })], { now: NOV_WED }), null, '取消的品項不算');
});

test('低消：平日每人 300、假日（營業日週六日）600；凌晨的單算前一天；10/31 前不檢查', () => {
  assert.deepEqual(M.minSpendOf(2, NOV_WED), { per: 300, people: 2, total: 600, weekend: false });
  assert.deepEqual(M.minSpendOf(3, NOV_SAT), { per: 600, people: 3, total: 1800, weekend: true });
  assert.equal(M.minSpendOf(1, NOV_SAT_LATE).per, 600, '週日凌晨 01:30 仍算週六營業日');
  assert.equal(M.minSpendOf(2, OCT), null);
  assert.equal(M.minSpendOf(0, NOV_WED), null, '沒設人數＝無法判斷');
});

test('櫃檯結帳：金額含服務費並記在 payer；客訴免收要原因、記原本該收多少', () => {
  const items = [bar(320), bar(180)];
  const out = T.posCheckout(items, { method: 'cash' }, new Map(), undefined, { table: 'A1', now: NOV_WED });
  assert.equal(out.subtotal, 500); assert.equal(out.amount, 550);
  assert.deepEqual(out.payer.service_charge, { rate: 0.1, base: 500, amount: 50 });
  const w = T.posCheckout(items, { method: 'cash', service_waive: { reason: '客訴：上菜太慢' } }, new Map(), undefined, { table: 'A1', now: NOV_WED });
  assert.equal(w.amount, 500); assert.equal(w.payer.service_charge.waived, true); assert.equal(w.payer.service_charge.would, 50);
  assert.throws(() => T.posCheckout(items, { method: 'cash', service_waive: { reason: ' ' } }, new Map(), undefined, { table: 'A1', now: NOV_WED }), /原因/);
  assert.equal(T.posCheckout(items, { method: 'cash' }, new Map(), undefined, { table: 'W01', now: NOV_WED }).amount, 500, '外帶單號不收');
  assert.equal(T.posCheckout(items, { method: 'cash' }, new Map(), undefined, { table: 'A1', now: OCT }).amount, 500, '10/31 前不收');
});

test('日結與 CSV：服務費另列、免收單數；作廢品項時服務費一起重算退回', () => {
  const o = { id: 'to_1', table_no: 'A1', status: 'paid', paid_at: new Date(NOV_WED).toISOString(), amount: 550, items: [bar(320), bar(180)], payer: { method: 'cash', service_charge: { rate: 0.1, base: 500, amount: 50 } } };
  const sum = T.salesSummary([o, { ...o, id: 'to_2', amount: 500, payer: { method: 'cash', service_charge: { amount: 0, would: 50, waived: true, reason: '客訴' } } }], { now: NOV_WED });
  assert.equal(sum.service_amount, 50); assert.equal(sum.service_waived, 1);
  const rows = T.salesCsvRows([o]);
  assert.ok(rows.some(r => r[3] === '服務費 10%' && r[6] === 50));
  const v = T.voidOrderLine(o, o.items[1].line, '做不出來', NOV_WED);
  assert.equal(v.service.amount, 32); assert.equal(v.refund, 180 + 18); assert.equal(v.amount, 352);
});

test('電子發票：服務費另列一行，明細加總等於總額', () => {
  const f = E.issueFields({ order: { id: 'to_1', table_no: 'A1', amount: 550, items: [{ zh: '烏龍麵', qty: 1, price: 500 }], service_charge: { amount: 50 } }, invoice: { requested: true, mode: 'paper' }, cfg: { version: '1.5' } });
  assert.match(f.ItemName, /服務費 10%/);
  assert.equal(f.ItemAmt.split('|').map(Number).reduce((a, b) => a + b, 0), f.TotalAmt);
});

test('POS 畫面：結帳列顯示服務費與免收鍵、低消提醒，送出時帶 service_waive', () => {
  const src = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  for (const s of ['pos-sum-svc', 'pos-svc-open', 'pos-svc-apply', 'service_waive:POS_SVC_WAIVE', 'minSpendHtml(ms)', '請先按「設定人數」']) assert.ok(src.includes(s), s);
});
