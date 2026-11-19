// 線上預付日結與自動開發票（KK 11/18）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../lib/ezpay-invoice.js');
const R = require('../lib/pos-register.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('線上付款發票：沿用手機條碼 → 會員載具（Email）→ 紙本', () => {
  const m = E.onlineInvoice({ id: 'u_abc', email: 'A@B.com', name: '王' }, null);
  assert.equal(m.mode, 'member'); assert.equal(m.carrier_num, 'u_abc'); assert.equal(m.buyer_email, 'a@b.com');
  const f = E.issueFields({ order: { id: 'to_x', table_no: 'E02', items: [{ zh: '4 小時', qty: 1, price: 200 }], amount: 200 }, invoice: m, cfg: { version: '1.5' } });
  assert.equal(f.CarrierType, '2'); assert.equal(f.CarrierNum, 'u_abc'); assert.equal(f.BuyerEmail, 'a@b.com'); assert.equal(f.PrintFlag, 'N');
  assert.equal(E.onlineInvoice({ id: 'u1', email: 'x@y.tw' }, { mode: 'mobile', carrier_num: '/ABC1234' }).mode, 'mobile');
  assert.equal(E.onlineInvoice({ id: 'u1', email: '' }, null).mode, 'paper');
  assert.throws(() => E.invoiceForm({ mode: 'member', carrier_num: 'u1' }), /Email/);
  // 既有手機條碼仍轉大寫、代碼 0
  assert.equal(E.invoiceForm({ mode: 'mobile', carrier_num: '/abc1234' }).carrier_num, '/ABC1234');
});

test('線上預付判斷：官網／App 付款算，櫃檯刷卡 QR 不算', () => {
  assert.equal(R.isOnlinePrepaid({ payer: { method: 'stripe', online: true } }), true);
  assert.equal(R.isOnlinePrepaid({ payer: { method: 'stripe', online: true, card_qr: true } }), false);
  assert.equal(R.isOnlinePrepaid({ payer: { method: 'stripe', stripe_manual: true } }), false);
  assert.equal(R.isOnlinePrepaid({ payer: { method: 'cash' } }), false);
});

test('未到場預付：天數與逾期', () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  const w = R.prepaidWaiting([
    { table_no: 'E02', space: { member_name: 'A' }, items: [{ space_role: 'plan', zh: '4h', price: 200, qty: 1 }], paid_at: '2026-10-10T00:00:00Z' },
    { table_no: 'E04', space: {}, items: [{ space_role: 'plan', zh: '4h', price: 200, qty: 1 }, { space_role: 'plan', zh: 'x', price: 99, qty: 1, cancelled: true }], paid_at: '2026-11-16T00:00:00Z' },
  ], now);
  assert.equal(w.count, 2); assert.equal(w.amount, 400); assert.equal(w.expired, 1); assert.equal(w.valid_days, R.PREPAID_VALID_DAYS);
  assert.equal(w.list[0].table_no, 'E02'); assert.equal(w.list[0].days, 39); assert.equal(w.list[1].expired, false);
});

test('接線：三條線上付款入帳後自動開票、排程補開、日結拆出線上預付', () => {
  assert.equal((server.match(/issueOnlineInvoiceLater\((pos\.order_id|orderId)\)/g) || []).length, 4); // 方案、進駐方案每月扣款、貴賓室、商店
  assert.match(server, /online_invoices: await sweepOnlineInvoices\(\)/);
  assert.match(server, /if\(!o\|\|o\.status==='void'\|\|!o\.payer\?\.online\|\|o\.payer\?\.card_qr/);
  assert.match(server, /accounts\.stripe=\(accounts\.stripe\|\|0\)-onlineAmt/);
  assert.match(server, /order_total:s\.sales\.collected==null\?undefined:s\.sales\.collected-\(s\.summary\.online_prepaid\?\.amount\|\|0\)/);
  assert.match(ops, /\$\{done\?'':shiftRevenueHtml\(r\)\}\$\{prepaidHtml\(r\)\}/);
  assert.match(ops, /actual-\(\(r\.sales\.collected\?\?r\.sales\.amount\)-\(r\.online_prepaid\?\.amount\|\|0\)\)/);
});

test('關帳：扣掉線上預付後帳戶總額對得上', () => {
  const summary = { expected: 3200, opening_cash: 3000, cash_in: 0, cash_out: 0, cash_sales: 200, petty_split: true };
  const c = R.closeRegister({ counted_cash: 3200, cash_confirmed: true, accounts: { linepay: { actual: 0, confirmed: true }, ctbc: { actual: 0, confirmed: true }, transfer: { actual: 0, confirmed: true } } },
    summary, { accounts: { linepay: 0, ctbc: 0, transfer: 0 }, order_total: 600 - 400 });
  assert.equal(c.total_diff, 0);
});
