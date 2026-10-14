// scripts/test-ezpay-result.mjs — ezPay 回應 Result 是 JSON 字串（官方手冊格式）；沒號碼時用 invoice_search 補回
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const E = require('../lib/ezpay-invoice');

const cfg = { merchantId: '3622183', hashKey: 'abcdefghijklmnopqrstuvwxyzabcdef', hashIv: '1234567891234567', version: '1.5', issueUrl: 'https://ezpay.test/issue', invalidUrl: 'https://ezpay.test/invalid', searchUrl: 'https://ezpay.test/search' };
const order = { id: 'to_178ac24895494d3c', table_no: 'W01', amount: 80, items: [{ zh: '原味貝果', qty: 1, price: 80 }] };

test('Result 是 JSON 字串（手冊範例）時要解析出 InvoiceNumber', () => {
  const raw = '{"Status":"SUCCESS","Message":"\\u96fb\\u5b50\\u767c\\u7968\\u958b\\u7acb\\u6210\\u529f","Result":"{\\"CheckCode\\":\\"00E1\\",\\"MerchantID\\":\\"3502275\\",\\"MerchantOrderNo\\":\\"201511031758110280\\",\\"InvoiceNumber\\":\\"DS12223139\\",\\"TotalAmt\\":348,\\"InvoiceTransNo\\":\\"15110317583641325\\",\\"RandomNum\\":\\"4253\\",\\"CreateTime\\":\\"2015-11-03 17:58:36\\"}"}';
  const out = E.parseEzpayResponse(raw, cfg);
  assert.equal(out.Status, 'SUCCESS');
  assert.equal(out.Result.InvoiceNumber, 'DS12223139');
  assert.equal(out.Result.RandomNum, '4253');
  assert.deepEqual(E.parseResultField({ InvoiceNumber: 'X' }, cfg), { InvoiceNumber: 'X' }, '已是物件照收');
  assert.deepEqual(E.parseResultField('not json', cfg), {}, '垃圾字串回空物件，不丟錯');
  assert.deepEqual(E.parseResultField('', cfg), {});
});

test('issueInvoice：ezPay 回 JSON 字串 Result 時拿到號碼；SUCCESS 但沒號碼不丟錯（已開立、交給查詢補）', async () => {
  const invoice = E.invoiceForm({ mode: 'paper' });
  const fetcher = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ Status: 'SUCCESS', Message: '電子發票開立成功', Result: JSON.stringify({ MerchantOrderNo: 'to178ac24895494d3c', InvoiceNumber: 'AB12345678', RandomNum: '0142', InvoiceTransNo: '14061313541640927', TotalAmt: 80 }) }) });
  const out = await E.issueInvoice(cfg, order, invoice, fetcher);
  assert.equal(out.status, 'issued'); assert.equal(out.number, 'AB12345678'); assert.equal(out.random, '0142');
  const empty = await E.issueInvoice(cfg, order, invoice, async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ Status: 'SUCCESS', Message: 'ok', Result: '' }) }));
  assert.equal(empty.status, 'issued'); assert.equal(empty.number, '');
});

test('searchFields：SearchType=1 用自訂編號＋金額，Version 1.3', () => {
  const f = E.searchFields({ order, invoice: { merchant_order_no: 'to178ac24895494d3c' }, cfg, now: 1700000000000 });
  assert.equal(f.SearchType, '1'); assert.equal(f.MerchantOrderNo, 'to178ac24895494d3c'); assert.equal(f.TotalAmt, 80); assert.equal(f.Version, '1.3');
  assert.equal(E.searchFields({ order, invoice: {}, cfg }).MerchantOrderNo, 'to178ac24895494d3c', '沒存自訂編號就從訂單 id 算');
  assert.throws(() => E.searchFields({ order: { id: 'to_x', amount: 0 }, invoice: {}, cfg }), /金額/);
  assert.equal(E.config({ EZPAY_INVOICE_MERCHANT_ID: 'm', EZPAY_INVOICE_HASH_KEY: 'k'.repeat(32), EZPAY_INVOICE_HASH_IV: 'i'.repeat(16) }).searchUrl, 'https://inv.ezpay.com.tw/Api/invoice_search');
  assert.equal(E.config({ EZPAY_INVOICE_MERCHANT_ID: 'm', EZPAY_INVOICE_HASH_KEY: 'k'.repeat(32), EZPAY_INVOICE_HASH_IV: 'i'.repeat(16), EZPAY_INVOICE_ISSUE_URL: 'https://cinv.ezpay.com.tw/Api/invoice_issue' }).searchUrl, 'https://cinv.ezpay.com.tw/Api/invoice_search', '查詢跟著開立網址切測試區');
});

test('searchInvoice：補回號碼並保留原紀錄；ezPay 已作廢 → status void；查不到 → 404', async () => {
  const stale = { provider: 'ezpay', status: 'issued', requested: true, mode: 'paper', number: '', merchant_order_no: 'to178ac24895494d3c', issued_at: '2026-10-14T08:52:02.497Z', result: {} };
  let url = '';
  const reply = (r) => async (u) => { url = u; return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 'SUCCESS', Message: '查詢成功', Result: JSON.stringify(r) }) }; };
  const found = await E.searchInvoice(cfg, order, stale, reply({ MerchantOrderNo: 'to178ac24895494d3c', InvoiceNumber: 'AB00000001', RandomNum: '4234', InvoiceTransNo: '2002', TotalAmt: '80', InvoiceStatus: '1' }));
  assert.equal(url, cfg.searchUrl);
  assert.equal(found.status, 'issued'); assert.equal(found.number, 'AB00000001'); assert.equal(found.random, '4234');
  assert.equal(found.issued_at, stale.issued_at, '原開立時間保留'); assert.equal(found.mode, 'paper'); assert.ok(found.synced_at);
  const voided = await E.searchInvoice(cfg, order, stale, reply({ MerchantOrderNo: 'to178ac24895494d3c', InvoiceNumber: 'AB00000001', RandomNum: '4234', InvoiceStatus: '2' }));
  assert.equal(voided.status, 'void'); assert.equal(voided.number, 'AB00000001');
  await assert.rejects(() => E.searchInvoice(cfg, order, stale, reply({ MerchantOrderNo: 'to178ac24895494d3c' })), (e) => e.status === 404);
});

test('作廢 Version 固定 1.0（正式區帶 1.5 退「欄位資料格式錯誤-Version」）', () => {
  const f = E.invalidFields({ order, invoice: { number: 'FT29956600' }, reason: '串接測試', cfg, now: 1700000000000 });
  assert.equal(f.Version, '1.0'); assert.equal(f.InvoiceNumber, 'FT29956600'); assert.equal(f.InvalidReason, '串接測試');
  assert.equal(E.issueFields({ order, invoice: E.invoiceForm({ mode: 'paper' }), cfg }).Version, '1.5', '開立仍帶 1.5');
});

test('server：補開／作廢遇到已開立但沒號碼時走 searchInvoice，不重開', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const issue = src.slice(src.indexOf("app.post('/api/admin/orders/:id/invoice/issue'"), src.indexOf("app.post('/api/admin/orders/:id/void'"));
  assert.match(issue, /if\(o\.invoice\.number\)return res\.json\(\{ok:true,invoice:o\.invoice\}\)/);
  assert.match(issue, /ezpayInvoice\.searchInvoice\(cfg,o,o\.invoice\)/);
  const voidRoute = src.slice(src.indexOf("app.post('/api/admin/orders/:id/void'"), src.indexOf("/* 估清"));
  assert.match(voidRoute, /if\(!nextInvoice\.number\)\{try\{nextInvoice=await ezpayInvoice\.searchInvoice\(cfg,o,nextInvoice\)/);
  assert.match(voidRoute, /if\(nextInvoice\.status==='issued'\)\{try\{nextInvoice=await ezpayInvoice\.invalidInvoice\(/);
});
