// scripts/test-ezpay-invoice.mjs — ezPay 電子發票加密、欄位驗證與 API 包裝
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
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
