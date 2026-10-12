/* ezPay 電子發票：官方 API 以 AES-256-CBC 加密 PostData_，CheckCode 用 SHA256 驗證。
 * 這裡只放純函式與 fetch 包裝；MerchantID/HashKey/HashIV 一律由環境變數提供，不寫入 repo。 */
'use strict';

const crypto = require('node:crypto');

// 正式區 inv.ezpay.com.tw；測試區 cinv.ezpay.com.tw 要在後台「系統設定」填 EZPAY_INVOICE_ISSUE_URL / INVALID_URL 覆寫
const ISSUE_URL = 'https://inv.ezpay.com.tw/Api/invoice_issue';
const INVALID_URL = 'https://inv.ezpay.com.tw/Api/invoice_invalid';
const VERSION = '1.5';
const CARRIER = { mobile: '0', citizen: '1' };
const cleanText = (v, max = 80) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
const digits = (v, max) => String(v ?? '').replace(/\D/g, '').slice(0, max);

function config(env = process.env) {
  const merchantId = cleanText(env.EZPAY_INVOICE_MERCHANT_ID || env.EZPAY_MERCHANT_ID, 20);
  const hashKey = cleanText(env.EZPAY_INVOICE_HASH_KEY || env.EZPAY_HASH_KEY, 64);
  const hashIv = cleanText(env.EZPAY_INVOICE_HASH_IV || env.EZPAY_HASH_IV, 32);
  if (!merchantId || !hashKey || !hashIv) return null;
  return {
    merchantId, hashKey, hashIv,
    issueUrl: cleanText(env.EZPAY_INVOICE_ISSUE_URL, 200) || ISSUE_URL,
    invalidUrl: cleanText(env.EZPAY_INVOICE_INVALID_URL, 200) || INVALID_URL,
    version: cleanText(env.EZPAY_INVOICE_VERSION, 12) || VERSION,
  };
}
function configured(env = process.env) { return !!config(env); }

function pkcs7Pad(buf, block = 32) {
  const r = buf.length % block;
  const pad = r === 0 ? block : block - r;
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}
function pkcs7Unpad(buf) {
  if (!buf.length) return buf;
  const pad = buf[buf.length - 1];
  return pad > 0 && pad <= 32 ? buf.subarray(0, buf.length - pad) : buf;
}
function encryptPostData(text, cfg) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(cfg.hashKey), Buffer.from(cfg.hashIv));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(pkcs7Pad(Buffer.from(text, 'utf8'))), cipher.final()]).toString('hex');
}
function decryptPostData(hex, cfg) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(cfg.hashKey), Buffer.from(cfg.hashIv));
  decipher.setAutoPadding(false);
  return pkcs7Unpad(Buffer.concat([decipher.update(Buffer.from(String(hex || ''), 'hex')), decipher.final()])).toString('utf8');
}
function encodeForm(obj) {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`).join('&');
}
function decodeForm(text) {
  return Object.fromEntries(new URLSearchParams(String(text || '')).entries());
}
function postData(fields) {
  return encodeForm(fields);
}
function parseEzpayResponse(raw, cfg) {
  const body = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  const result = body.Result && typeof body.Result === 'string' && /^[0-9a-f]+$/i.test(body.Result)
    ? decodeForm(decryptPostData(body.Result, cfg))
    : (typeof body.Result === 'object' && body.Result ? body.Result : {});
  return { ...body, Result: result };
}

function invoiceForm(body = {}) {
  const mode = cleanText(body.mode || '', 20);
  const buyerUBN = digits(body.buyer_ubn || body.buyerUBN, 8);
  const loveCode = digits(body.love_code || body.LoveCode, 20);
  const carrierKind = cleanText(body.carrier || body.carrier_kind, 20);
  const carrierNum = cleanText(body.carrier_num || body.CarrierNum, 64).toUpperCase();
  const buyerName = cleanText(body.buyer_name || body.name, 60);
  const buyerEmail = cleanText(body.buyer_email || body.email, 120).toLowerCase();
  const comment = cleanText(body.comment || body.note, 80);
  if (!mode) return { requested: false };
  if (!['paper', 'company', 'mobile', 'citizen', 'donate'].includes(mode)) throw Object.assign(Error('發票類型無效。'), { status: 400 });
  if (mode === 'company' && !/^\d{8}$/.test(buyerUBN)) throw Object.assign(Error('請輸入 8 碼統一編號。'), { status: 400 });
  if (mode === 'mobile' && !/^\/[A-Z0-9.+-]{7}$/.test(carrierNum)) throw Object.assign(Error('手機條碼格式需為 / 開頭共 8 碼。'), { status: 400 });
  if (mode === 'citizen' && !/^[A-Z]{2}\d{14}$/.test(carrierNum)) throw Object.assign(Error('自然人憑證條碼格式不正確。'), { status: 400 });
  if (mode === 'donate' && !/^\d{3,20}$/.test(loveCode)) throw Object.assign(Error('請輸入愛心碼。'), { status: 400 });
  return { requested: true, provider: 'ezpay', mode, buyer_ubn: buyerUBN, love_code: loveCode, carrier: carrierKind || (mode === 'mobile' || mode === 'citizen' ? mode : ''), carrier_num: carrierNum, buyer_name: buyerName, buyer_email: buyerEmail, comment };
}
function taxIncluded(total) {
  const n = Math.max(0, Math.round(Number(total) || 0));
  const amt = Math.round(n / 1.05);
  return { Amt: amt, TaxAmt: n - amt, TotalAmt: n };
}
function safePipe(v) { return cleanText(v, 120).replace(/[|]/g, '／') || '餐飲品項'; }
function merchantOrderNo(orderId) {
  return cleanText(String(orderId || '').replace(/[^A-Za-z0-9]/g, ''), 24) || Date.now().toString(36);
}
function issueFields({ order, invoice, cfg, now = Date.now() }) {
  if (!invoice?.requested) throw Object.assign(Error('這筆訂單沒有要求開立發票。'), { status: 400 });
  const items = (Array.isArray(order.items) && order.items.length ? order.items : [{ zh: '餐飲消費', qty: 1, price: order.amount }]).slice();
  // 整單折扣：以負數品項列出，讓品項小計加總＝TotalAmt（ezPay 要求明細與總額一致）
  const disc = Number(order.discount?.amount) || 0;
  if (disc > 0) items.push({ zh: '折扣' + (order.discount.reason ? `（${cleanText(order.discount.reason, 40)}）` : ''), qty: 1, price: -disc });
  const tax = taxIncluded(order.amount);
  const category = invoice.mode === 'company' ? 'B2B' : 'B2C';
  const printFlag = invoice.mode === 'paper' || invoice.mode === 'company' ? 'Y' : 'N';
  const carrierType = invoice.mode === 'mobile' ? CARRIER.mobile : invoice.mode === 'citizen' ? CARRIER.citizen : '';
  return {
    RespondType: 'JSON', Version: cfg.version, TimeStamp: Math.floor(Number(now) / 1000), TransNum: '', MerchantOrderNo: merchantOrderNo(order.id),
    // ezPay 正式區 B2C 也要求 BuyerName 非空（回「資料不可空白BuyerName」），一般消費者填「消費者」
    BuyerName: invoice.buyer_name || (category === 'B2B' ? '買受人' : '消費者'), BuyerUBN: invoice.mode === 'company' ? invoice.buyer_ubn : '', BuyerAddress: '', BuyerEmail: invoice.buyer_email || '',
    Category: category, TaxType: '1', TaxRate: 5, Amt: tax.Amt, TaxAmt: tax.TaxAmt, TotalAmt: tax.TotalAmt,
    CarrierType: carrierType, CarrierNum: carrierType ? invoice.carrier_num : '', LoveCode: invoice.mode === 'donate' ? invoice.love_code : '', PrintFlag: printFlag,
    ItemName: items.map(l => safePipe(l.zh)).join('|'), ItemCount: items.map(l => Math.max(1, Number(l.qty) || 1)).join('|'), ItemUnit: items.map(() => '份').join('|'),
    ItemPrice: items.map(l => Math.round(Number(l.price) || 0)).join('|'), ItemAmt: items.map(l => Math.round((Number(l.price) || 0) * (Number(l.qty) || 1))).join('|'),
    Comment: invoice.comment || `桌號 ${cleanText(order.table_no, 8)}`, CreateStatusTime: '', Status: 1,
  };
}
function invalidFields({ order, invoice, reason, cfg, now = Date.now() }) {
  const no = invoice?.number || invoice?.InvoiceNumber || invoice?.result?.InvoiceNumber;
  if (!no) throw Object.assign(Error('這筆訂單沒有 ezPay 發票號碼，無法同步作廢。'), { status: 400 });
  return { RespondType: 'JSON', Version: cfg.version, TimeStamp: Math.floor(Number(now) / 1000), InvoiceNumber: no, InvalidReason: cleanText(reason, 20) || '訂單作廢' };
}
function checkCode({ result, cfg }) {
  const r = result || {};
  const raw = `HashIV=${cfg.hashIv}&InvoiceTransNo=${r.InvoiceTransNo || ''}&MerchantID=${cfg.merchantId}&MerchantOrderNo=${r.MerchantOrderNo || ''}&RandomNum=${r.RandomNum || ''}&TotalAmt=${r.TotalAmt || ''}&HashKey=${cfg.hashKey}`;
  return crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
}
async function ezpayPost(url, fields, cfg, fetcher = fetch) {
  const PostData_ = encryptPostData(postData(fields), cfg);
  const res = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: encodeForm({ MerchantID_: cfg.merchantId, PostData_ }), signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let parsed; try { parsed = parseEzpayResponse(text, cfg); } catch (e) { throw Object.assign(Error('ezPay 回應格式無法解析。'), { status: 502, raw: text.slice(0, 500) }); }
  if (!res.ok || parsed.Status !== 'SUCCESS') throw Object.assign(Error('ezPay 發票 API 失敗：' + (parsed.Message || ('HTTP ' + res.status))), { status: 502, ezpay: parsed });
  return parsed;
}
async function issueInvoice(cfg, order, invoice, fetcher) {
  const req = issueFields({ order, invoice, cfg });
  const out = await ezpayPost(cfg.issueUrl, req, cfg, fetcher);
  const result = out.Result || {};
  if (result.CheckCode && result.CheckCode !== checkCode({ result, cfg })) throw Object.assign(Error('ezPay 發票 CheckCode 驗證失敗。'), { status: 502, ezpay: out });
  return { provider: 'ezpay', status: 'issued', requested: true, mode: invoice.mode, number: result.InvoiceNumber || '', random: result.RandomNum || '', trans_no: result.InvoiceTransNo || '', merchant_order_no: result.MerchantOrderNo || req.MerchantOrderNo, issued_at: new Date().toISOString(), result };
}
async function invalidInvoice(cfg, order, invoice, reason, fetcher) {
  const req = invalidFields({ order, invoice, reason, cfg });
  const out = await ezpayPost(cfg.invalidUrl, req, cfg, fetcher);
  return { ...invoice, status: 'void', voided_at: new Date().toISOString(), void_reason: cleanText(reason, 80), invalid_result: out.Result || out };
}

module.exports = { VERSION, config, configured, encryptPostData, decryptPostData, postData, decodeForm, parseEzpayResponse, invoiceForm, taxIncluded, issueFields, invalidFields, checkCode, issueInvoice, invalidInvoice };
