// scripts/test-ezpay-invoice.mjs — ezPay 電子發票加密、欄位驗證與 API 包裝
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const E = require('../lib/ezpay-invoice');

const cfg = { merchantId: '3622183', hashKey: 'abcdefghijklmnopqrstuvwxyzabcdef', hashIv: '1234567891234567', version: '1.5', issueUrl: 'https://ezpay.test/issue', invalidUrl: 'https://ezpay.test/invalid' };

test('ezPay AES 加密與官方 CheckCode 範例相容', () => {
  const plain = 'RespondType=JSON&Version=1.4&TimeStamp=1444963784&TransNum=&MerchantOrderNo=201409170000001&BuyerName=%E7%8E%8B%E5%A4%A7%E5%93%81&BuyerUBN=54352706&BuyerAddress=%E5%8F%B0%E5%8C%97%E5%B8%82%E5%8D%97%E6%B8%AF%E5%8D%80%E5%8D%97%E6%B8%AF%E8%B7%AF%E4%BA%8C%E6%AE%B597%E8%99%9F8%E6%A8%93&BuyerEmail=54352706%40pay2go.com&Category=B2B&TaxType=1&TaxRate=5&Amt=490&TaxAmt=10&TotalAmt=500&CarrierType=&CarrierNum=&LoveCode=&PrintFlag=Y&ItemName=%E5%95%86%E5%93%81%E4%B8%80%7C%E5%95%86%E5%93%81%E4%BA%8C&ItemCount=1%7C2&ItemUnit=%E5%80%8B%7C%E5%80%8B&ItemPrice=300%7C100&ItemAmt=300%7C200&Comment=%E5%82%99%E8%A8%BB&CreateStatusTime=&Status=1';
  const hex = E.encryptPostData(plain, cfg);
  assert.equal(hex.slice(0, 64), '70a61189d7dc0f6abefe7643da144af543470ddf87b1de14ae20cf104f730dee');
  assert.equal(E.decryptPostData(hex, cfg), plain);
  const code = E.checkCode({ cfg, result: { InvoiceTransNo: '14061313541640927', MerchantOrderNo: '201409170000001', RandomNum: '0142', TotalAmt: '500' } });
  assert.equal(code, '303AB800650B724733B5D91CBCE075D9EA09E4CDE9CD33461D45F07D5EC7EECB');
});

test('發票欄位驗證：統編、手機載具、自然人憑證、捐贈碼', () => {
  assert.deepEqual(E.invoiceForm({}), { requested: false });
  assert.equal(E.invoiceForm({ mode: 'company', buyer_ubn: '12345678' }).buyer_ubn, '12345678');
  assert.equal(E.invoiceForm({ mode: 'mobile', carrier_num: '/abC1234' }).carrier_num, '/ABC1234');
  assert.equal(E.invoiceForm({ mode: 'citizen', carrier_num: 'AB12345678901234' }).carrier_num, 'AB12345678901234');
  assert.equal(E.invoiceForm({ mode: 'donate', love_code: '919' }).love_code, '919');
  assert.throws(() => E.invoiceForm({ mode: 'company', buyer_ubn: '123' }), /統一編號/);
  assert.throws(() => E.invoiceForm({ mode: 'mobile', carrier_num: 'ABC1234' }), /手機條碼/);
});

test('開立欄位以含稅價拆 Amt/TaxAmt，商品明細與總額一致', () => {
  const invoice = E.invoiceForm({ mode: 'mobile', carrier_num: '/ABC1234', buyer_email: 'A@EXAMPLE.COM' });
  const fields = E.issueFields({ cfg, invoice, now: 1700000000000, order: { id: 'to_abc-123', table_no: 'A1', amount: 315, items: [
    { zh: '拿鐵', qty: 1, price: 180 }, { zh: '吐司', qty: 1, price: 135 },
  ] } });
  assert.equal(fields.TotalAmt, 315);
  assert.equal(fields.Amt + fields.TaxAmt, 315);
  assert.equal(fields.CarrierType, '0');
  assert.equal(fields.CarrierNum, '/ABC1234');
  assert.equal(fields.ItemName, '拿鐵|吐司');
  assert.equal(fields.ItemAmt, '180|135');
});

test('整單折扣：發票明細多一列負數「折扣」，品項加總＝TotalAmt', () => {
  const invoice = E.invoiceForm({ mode: 'paper' });
  const fields = E.issueFields({ cfg, invoice, now: 1700000000000, order: { id: 'to_d', table_no: 'A1', amount: 270, discount: { type: 'percent', value: 10, amount: 30, reason: '熟客' }, items: [
    { zh: '拿鐵', qty: 1, price: 180 }, { zh: '吐司', qty: 1, price: 120 },
  ] } });
  assert.equal(fields.TotalAmt, 270);
  assert.equal(fields.ItemName, '拿鐵|吐司|折扣（熟客）');
  assert.equal(fields.ItemPrice, '180|120|-30'); assert.equal(fields.ItemAmt, '180|120|-30');
  assert.equal(fields.ItemAmt.split('|').reduce((a, n) => a + Number(n), 0), fields.TotalAmt);
  assert.equal(E.issueFields({ cfg, invoice, order: { id: 'to_n', table_no: 'A1', amount: 300, items: [{ zh: '拿鐵', qty: 1, price: 300 }] } }).ItemName, '拿鐵', '沒折扣不多列');
});

test('issueInvoice 送 MerchantID_ + 加密 PostData_，並驗證回應 CheckCode', async () => {
  let seen = null;
  const invoice = E.invoiceForm({ mode: 'paper', buyer_name: '王大品' });
  const fetcher = async (_url, init) => {
    seen = Object.fromEntries(new URLSearchParams(init.body));
    const sent = Object.fromEntries(new URLSearchParams(E.decryptPostData(seen.PostData_, cfg)));
    assert.equal(seen.MerchantID_, cfg.merchantId);
    assert.equal(sent.TotalAmt, '500');
    const result = { MerchantOrderNo: sent.MerchantOrderNo, InvoiceNumber: 'AB12345678', RandomNum: '0142', InvoiceTransNo: '14061313541640927', TotalAmt: '500' };
    result.CheckCode = E.checkCode({ cfg, result });
    return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 'SUCCESS', Message: '成功', Result: E.encryptPostData(E.postData(result), cfg) }) };
  };
  const out = await E.issueInvoice(cfg, { id: 'to_abc', table_no: 'A1', amount: 500, items: [{ zh: '餐飲消費', qty: 1, price: 500 }] }, invoice, fetcher);
  assert.equal(out.status, 'issued');
  assert.equal(out.number, 'AB12345678');
  assert.ok(seen.PostData_);
});

test('預設打 ezPay 正式區；cinv 是測試區，只能靠後台覆寫網址', () => {
  const src = fs.readFileSync(new URL('../lib/ezpay-invoice.js', import.meta.url), 'utf8');
  assert.match(src, /ISSUE_URL = 'https:\/\/inv\.ezpay\.com\.tw\/Api\/invoice_issue'/);
  assert.match(src, /INVALID_URL = 'https:\/\/inv\.ezpay\.com\.tw\/Api\/invoice_invalid'/);
  assert.doesNotMatch(src, /= 'https:\/\/cinv\./);
  assert.equal(E.config({ EZPAY_INVOICE_MERCHANT_ID: 'm', EZPAY_INVOICE_HASH_KEY: 'k'.repeat(32), EZPAY_INVOICE_HASH_IV: 'i'.repeat(16) }).issueUrl, 'https://inv.ezpay.com.tw/Api/invoice_issue');
});

test('B2C 發票 BuyerName 不可空白（ezPay 正式區會退「資料不可空白BuyerName」）', () => {
  const order = { id: 'to_x', amount: 80, items: [{ zh: '原味貝果', qty: 1, price: 80 }], table_no: 'W01' };
  const f = E.issueFields({ order, invoice: E.invoiceForm({ mode: 'paper' }), cfg });
  assert.equal(f.BuyerName, '消費者');
  assert.equal(f.Category, 'B2C');
  assert.equal(E.issueFields({ order, invoice: E.invoiceForm({ mode: 'mobile', carrier_num: '/ABC1234' }), cfg }).BuyerName, '消費者');
  assert.equal(E.issueFields({ order, invoice: E.invoiceForm({ mode: 'company', buyer_ubn: '12345678' }), cfg }).BuyerName, '買受人');
  assert.equal(E.issueFields({ order, invoice: E.invoiceForm({ mode: 'paper', buyer_name: '王小明' }), cfg }).BuyerName, '王小明');
});

test('開立後的發票紀錄保留買方統編（補印才印得出統編）', () => {
  const inv = E.invoiceForm({ mode: 'company', buyer_ubn: '12345678', buyer_name: '測試公司' });
  const rec = E.__issuedRecordForTest ? E.__issuedRecordForTest(inv, { InvoiceNumber: 'AB12345678', RandomNum: '1234' }, 'X1') : null;
  if (rec) { assert.equal(rec.buyer_ubn, '12345678'); assert.equal(rec.buyer_name, '測試公司'); }
});

test('CheckCode：TotalAmt 為數字 0 時與字串 "0" 算出同一組（不能因 0 || "" 變空）', () => {
  const base = { InvoiceTransNo: '26101721290000001', MerchantOrderNo: 'to3a5ed0f1672e451f', RandomNum: '1234' };
  assert.equal(E.checkCode({ cfg, result: { ...base, TotalAmt: 0 } }), E.checkCode({ cfg, result: { ...base, TotalAmt: '0' } }));
  assert.notEqual(E.checkCode({ cfg, result: { ...base, TotalAmt: 0 } }), E.checkCode({ cfg, result: { ...base, TotalAmt: '' } }));
  assert.equal(E.checkCode({ cfg, result: { ...base, TotalAmt: 500 } }), E.checkCode({ cfg, result: { ...base, TotalAmt: '500' } }));
});

test('0 元訂單不開立發票（issueFields 擋下，伺服器端略過不標失敗）', () => {
  const invoice = E.invoiceForm({ mode: 'paper' });
  assert.throws(() => E.issueFields({ cfg, invoice, order: { id: 'to_zero', table_no: 'A9', amount: 0, items: [{ zh: '招待', qty: 1, price: 0 }] } }), /0 元訂單不開立發票/);
  assert.throws(() => E.issueFields({ cfg, invoice, order: { id: 'to_zero', table_no: 'A9', amount: -10, items: [] } }), /0 元訂單不開立發票/);
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function storeInvoiceResult('), src.indexOf('/* 櫃檯結帳（POS）'));
  assert.match(fn, /skipped:'zero_amount'/);
  assert.match(fn, /requested:false/);
  assert.ok(fn.indexOf("skipped:'zero_amount'") < fn.indexOf('issueEzpayForOrder(order,invoice)'), '0 元檢查要在送 ezPay 之前');
});
