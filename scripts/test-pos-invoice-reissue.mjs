// 改開發票（作廢原票→同金額開新類型）＋作廢時「回到桌上」（BOWEN 11/6）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../lib/ezpay-invoice.js');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const cfg = { merchantId: '3622183', hashKey: 'Ux7u4ZzV1j5aG3Ks9Q2mTnW8yB0cE6dF', hashIv: 'Ab3Cd5Ef7Gh9Ij1K', version: '1.5' };

test('issueFields 用 invoice.merchant_order_no（改開用新編號），沒帶照舊用訂單 id', () => {
  const order = { id: 'to_abc123', table_no: 'A1', amount: 500, items: [{ zh: '咖啡', qty: 1, price: 500 }] };
  assert.equal(E.issueFields({ order, invoice: E.invoiceForm({ mode: 'paper' }), cfg }).MerchantOrderNo, 'toabc123');
  const f = E.issueFields({ order, invoice: { ...E.invoiceForm({ mode: 'company', buyer_ubn: '93537055' }), merchant_order_no: 'toabc123R1' }, cfg });
  assert.equal(f.MerchantOrderNo, 'toabc123R1');
  assert.equal(f.BuyerUBN, '93537055');
  assert.equal(f.Category, 'B2B');
});

test('server：改開端點在列鎖內先作廢再開立，失敗留 failed＋新編號', () => {
  const i = srv.indexOf("app.post('/api/admin/orders/:id/invoice/reissue'");
  assert.ok(i > 0);
  const body = srv.slice(i, srv.indexOf('\n}));', i));
  assert.match(body, /FOR UPDATE/);
  assert.match(body, /status!=='issued'/);
  assert.match(body, /status==='void'/);
  assert.match(body, /invPeriod/);
  assert.ok(body.indexOf('invalidInvoice') < body.indexOf('issueInvoice'), '先作廢再開立');
  assert.match(body, /'R'\+replaced\.length/);
  assert.match(body, /status:'failed'/);
  assert.match(body, /COMMIT/);
  assert.doesNotMatch(body, /payer=|reverseYanForOrder/, '不動付款與點數');
});

test('server：補開時沿用改開失敗留下的新編號', () => {
  assert.match(srv, /o\.invoice\?\.merchant_order_no&&o\.invoice\?\.replaced\?\.length\)invoice=\{\.\.\.invoice,merchant_order_no:o\.invoice\.merchant_order_no/);
});

test('server：作廢 reopen 只在已清桌、非預收時重開同一場，同桌號有新桌就 409', () => {
  const i = srv.indexOf("app.post('/api/admin/orders/:id/void'");
  const body = srv.slice(i, srv.indexOf('\n}));', i));
  assert.match(body, /req\.body\?\.reopen===true&&!o\.payer\?\.prepay/);
  assert.ok(body.indexOf('已經開了新的一桌') < body.indexOf('invalidInvoice'), '先檢查桌號再作廢 ezPay 發票');
  assert.match(body, /status='open' AND id<>\$2/);
  assert.match(body, /已經開了新的一桌/);
  assert.match(body, /SET status='open',items=\$2/);
  assert.match(body, /reopened,returned/);
});

test('history 回 session_open', () => {
  assert.match(srv, /o\.session_open=sopen\.get\(o\.session_id\)\?\?false/);
});

function ctxFor(extra = {}) {
  const c = vm.createContext({ esc: String, num: String, MenuLib: { businessDay: () => 'd' }, ...extra });
  vm.runInContext(ops.match(/const invoicePrintable=[^\n]+/)[0].replace('const ', 'var '), c);
  vm.runInContext(ops.match(/const canReissueInvoice=[^\n]+/)[0].replace('const ', 'var '), c);
  return c;
}

test('canReissueInvoice：只有已開立、未作廢、非預收、有金額的單', () => {
  const c = ctxFor();
  const ok = { status: 'done', amount: 300, invoice: { status: 'issued', number: 'AB1' }, payer: {} };
  assert.equal(c.canReissueInvoice(ok), true);
  assert.equal(c.canReissueInvoice({ ...ok, status: 'void' }), false);
  assert.equal(c.canReissueInvoice({ ...ok, invoice: { status: 'failed' } }), false);
  assert.equal(c.canReissueInvoice({ ...ok, invoice: {} }), false);
  assert.equal(c.canReissueInvoice({ ...ok, payer: { prepay: true } }), false);
  assert.equal(c.canReissueInvoice({ ...ok, amount: 0 }), false);
});

test('查單與櫃檯已結帳單都有「改開發票」鈕並綁定', () => {
  assert.equal((ops.match(/data-invoice-reissue="\$\{esc\(o\.id\)\}">改開發票/g) || []).length, 2);
  assert.match(ops, /querySelectorAll\('\[data-invoice-reissue\]'\)/);
});

test('改開流程：選統編→確認→送 reissue（含 operator）→印證明聯；取消不送', async () => {
  for (const cancel of [false, true]) {
    const calls = [], prints = [], toasts = [];
    const c = vm.createContext({ esc: String, num: String, INV_LABEL: { company: '統編' }, OPERATOR: { id: 'op1' },
      askInvoice: async () => cancel ? null : { mode: 'company', buyer_ubn: '93537055' },
      posConfirm: async () => true, ensureOperator: async cb => cb(), toast: m => toasts.push(m),
      api: async (url, opt) => { calls.push({ url, ...opt }); return { invoice: { status: 'issued', mode: 'company', number: 'XY87654321' }, voided: 'AB12345678' }; },
      printInvoiceProof: async o => prints.push(o.invoice.number) });
    vm.runInContext(ops.match(/const invoicePrintable=[^\n]+/)[0].replace('const ', 'var '), c);
    vm.runInContext(ops.slice(ops.indexOf('const canReissueInvoice='), ops.indexOf('// 更正付款方式：')), c);
    let reloaded = false;
    await c.reissueInvoicePrompt({ id: 'to_1', status: 'done', amount: 500, payer: {}, invoice: { status: 'issued', number: 'AB12345678' } }, async () => { reloaded = true; });
    if (cancel) { assert.equal(calls.length, 0); continue; }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/admin/orders/to_1/invoice/reissue');
    assert.equal(calls[0].body.invoice.buyer_ubn, '93537055');
    assert.equal(calls[0].body.operator_id, 'op1');
    assert.deepEqual(prints, ['XY87654321']);
    assert.match(toasts.join(' '), /已作廢 AB12345678，改開 XY87654321/);
    assert.equal(reloaded, true);
  }
});

test('作廢：已清桌的單問「回到桌上」，選了才帶 reopen:true；桌還開著不問', async () => {
  for (const [sessionOpen, pick, expectAsk, expectReopen] of [[false, 'reopen', true, true], [false, 'only', true, false], [true, null, false, false]]) {
    const calls = [];let asked = false;
    const c = vm.createContext({ REASON_PRESETS: { void_order: [] }, OPERATOR: { id: 'op1' },
      pickReason: async () => '改開統編', pickFrom: async () => { asked = true; return pick; }, cashPaidOf: () => 0, posConfirm: async () => false,
      ensureOperator: async cb => cb(), opsThen: async (fn, msg) => { const out = await fn(); await msg(out); },
      api: async (url, opt) => { calls.push(opt.body); return { reopened: opt.body.reopen, returned: true, table_no: 'A1' }; }, autoCashDrawer: async () => true, num: String });
    vm.runInContext(ops.slice(ops.indexOf('async function voidOrderPrompt('), ops.indexOf('// 已結帳單取消單一品項')), c);
    await c.voidOrderPrompt('to_1', null, { table_no: 'A1', session_open: sessionOpen, payer: {} });
    assert.equal(asked, expectAsk);
    assert.equal(calls[0].reopen, expectReopen);
  }
});
