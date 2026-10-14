// scripts/test-taishin-manual.mjs — 台新手機付日結對帳：沒有查詢 API，手動填寫實收總額比對 POS 登記。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TS = require('../lib/taishin-manual');
const T = require('../lib/table-orders');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

test('manualInput：金額須為 0 以上整數；差額非 0 時差異原因必填；差額 0 可空白', () => {
  assert.deepEqual(TS.manualInput({ amount: 5000, reason: '' }, 5000), { amount: 5000, reason: '' });
  assert.throws(() => TS.manualInput({ amount: -1 }, 0), /0 以上整數/);
  assert.throws(() => TS.manualInput({ amount: 1.5 }, 0), /0 以上整數/);
  assert.throws(() => TS.manualInput({ amount: 'abc' }, 0), /0 以上整數/);
  assert.throws(() => TS.manualInput({}, 0), /0 以上整數/, '沒給金額也要擋（undefined 不是整數）');
  assert.throws(() => TS.manualInput({ amount: 5200 }, 5000), /差 \+200，請填寫差異原因/);
  const ok = TS.manualInput({ amount: 4800, reason: ' 客人自行轉帳 ' }, 5000);
  assert.deepEqual(ok, { amount: 4800, reason: '客人自行轉帳' });
});

test('reconcile：加總 POS 登記為 taishin 的成立單（排除作廢、依品牌過濾）；manual 為 null 時 diff 為 null', () => {
  const orders = [
    { status: 'paid', amount: 300, payer: { method: 'taishin' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 200, payer: { method: 'taishin' }, items: [{ venue: 'BAR' }] },
    { status: 'void', amount: 999, payer: { method: 'taishin' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 100, payer: { method: 'cash' }, items: [{ venue: 'CAFE' }] },
  ];
  const all = TS.reconcile(orders, null, { venues: null });
  assert.deepEqual(all.pos, { count: 2, amount: 500 });
  assert.equal(all.manual, null);
  assert.equal(all.diff, null);
  const cafeOnly = TS.reconcile(orders, null, { venues: ['CAFE'] });
  assert.deepEqual(cafeOnly.pos, { count: 1, amount: 300 });
  const manual = { amount: 520, reason: '多收 20', filled_by: 'a@x.com', updated_at: '2026-10-14T03:00:00.000Z' };
  const withManual = TS.reconcile(orders, manual, { venues: null });
  assert.deepEqual(withManual.manual, manual);
  assert.equal(withManual.diff, 20);
});

test('lib/table-orders：台新手機付是內建付款方式（PAY_METHODS），結帳可直接選，不必走自訂收款帳戶', () => {
  assert.equal(T.PAY_METHODS.taishin, '台新手機付');
  assert.equal(T.payMethod('taishin'), 'taishin');
});

test('收款帳戶代碼不能跟 taishin 撞（RESERVED_CODES）', () => {
  const P = require('../lib/pos-payment-methods');
  assert.ok(P.RESERVED_CODES.has('taishin'));
});

test('server.js：GET /api/admin/sales 回 taishin 對帳區，POST /api/admin/sales/taishin 存檔並檢查差異原因', () => {
  const server = read('server.js');
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_taishin_daily/);
  assert.match(server, /taishin:ts\}\)/);
  assert.match(server, /app\.post\('\/api\/admin\/sales\/taishin',auth,adminOnly,requireDb,wrap/);
  const section = server.split("app.post('/api/admin/sales/taishin'")[1].split(/\}\)\);/)[0];
  assert.match(section, /taishinManual\.manualInput/);
  assert.match(section, /ON CONFLICT \(day\) DO UPDATE/);
  assert.match(section, /filledBy/);
});

test('docs/API.md 記錄 taishin 對帳欄位與 POST /api/admin/sales/taishin', () => {
  const docs = read('docs/API.md');
  assert.match(docs, /`taishin` 為台新手機付對帳/);
  assert.match(docs, /### POST \/api\/admin\/sales\/taishin/);
});

test('pos-ops.js：日結報表新增「台新手機付對帳」區塊，表單送 POST /admin/sales/taishin', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /taishin:'台新手機付'/);
  assert.match(ops, /<h3>台新手機付對帳/);
  assert.match(ops, /id="ts-form"/);
  assert.match(ops, /api\('\/admin\/sales\/taishin',\{method:'POST',body:\{day:d\.day,amount,reason\}\}\)/);
});
