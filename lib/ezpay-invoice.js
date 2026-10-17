/* ezPay 電子發票：官方 API 以 AES-256-CBC 加密 PostData_，CheckCode 用 SHA256 驗證。
 * 這裡只放純函式與 fetch 包裝；MerchantID/HashKey/HashIV 一律由環境變數提供，不寫入 repo。 */
'use strict';

const crypto = require('node:crypto');

// 正式區 inv.ezpay.com.tw；測試區 cinv.ezpay.com.tw 要在後台「系統設定」填 EZPAY_INVOICE_ISSUE_URL / INVALID_URL 覆寫
const ISSUE_URL = 'https://inv.ezpay.com.tw/Api/invoice_issue';
const INVALID_URL = 'https://inv.ezpay.com.tw/Api/invoice_invalid';
const SEARCH_URL = 'https://inv.ezpay.com.tw/Api/invoice_search';
const VERSION = '1.5';
const SEARCH_VERSION = '1.3';
// 手冊 EZP_INVI_1.2.1：開立 Version 1.5、查詢 1.3、作廢固定 1.0；作廢帶 1.5 正式區退「欄位資料格式錯誤-Version」
const INVALID_VERSION = '1.0';
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
    // 查詢網址跟開立同主機：後台只覆寫 ISSUE_URL 切到測試區時，查詢也要跟著走
    searchUrl: cleanText(env.EZPAY_INVOICE_SEARCH_URL, 200) || (cleanText(env.EZPAY_INVOICE_ISSUE_URL, 200) || ISSUE_URL).replace(/invoice_issue$/, 'invoice_search'),
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
/* 官方手冊（EZP_INVI_1.2.1 四-(二)）：RespondType=JSON 時 Result 是「JSON 字串」，
 * 例 {"Status":"SUCCESS","Result":"{\"InvoiceNumber\":\"DS12223139\",...}"}；
 * 這裡三種都收：JSON 字串、已是物件、以及 hex 加密（保險）。解析不到就回空物件，呼叫端會視為沒拿到號碼。 */
function parseResultField(value, cfg) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  const s = String(value).trim();
  if (/^[\[{]/.test(s)) { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) { try { return parseResultField(decryptPostData(s, cfg), cfg) || decodeForm(decryptPostData(s, cfg)); } catch { return {}; } }
  if (s.includes('=')) return decodeForm(s);
  return {};
}
function parseEzpayResponse(raw, cfg) {
  const body = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  let result = parseResultField(body.Result, cfg);
  // hex 解密後是 form 字串（測試桩）：parseResultField 對 form 字串回 decodeForm，對 JSON 字串回物件
  if (Object.keys(result).length === 0 && typeof body.Result === 'string' && /^[0-9a-f]+$/i.test(body.Result)) {
    try { result = decodeForm(decryptPostData(body.Result, cfg)); } catch { result = {}; }
  }
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
  if (!(Math.round(Number(order.amount) || 0) > 0)) throw Object.assign(Error('0 元訂單不開立發票。'), { status: 400 });
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
  return { RespondType: 'JSON', Version: INVALID_VERSION, TimeStamp: Math.floor(Number(now) / 1000), InvoiceNumber: no, InvalidReason: cleanText(reason, 20) || '訂單作廢' };
}
/* 查詢發票（八-(一)）：SearchType=1 用自訂編號＋發票金額查，拿回 InvoiceNumber/RandomNum；
 * 用途：開立成功但回應沒解析到號碼（或連線中斷沒收到回應）時，補回號碼才能作廢。 */
function searchFields({ order, invoice, cfg, now = Date.now() }) {
  const no = cleanText(invoice?.merchant_order_no, 24) || merchantOrderNo(order.id);
  const total = Math.max(0, Math.round(Number(order.amount) || 0));
  if (!no || !total) throw Object.assign(Error('沒有自訂編號或金額，無法查詢 ezPay 發票。'), { status: 400 });
  return { RespondType: 'JSON', Version: SEARCH_VERSION, TimeStamp: Math.floor(Number(now) / 1000), SearchType: '1', MerchantOrderNo: no, TotalAmt: total, InvoiceNumber: '', RandomNum: '' };
}
function checkCode({ result, cfg }) {
  const r = result || {};
  // 用 ?? 不用 ||：TotalAmt 為數字 0 時 `0 || ''` 會變空字串，雜湊對不上（0 元單曾因此回「CheckCode 驗證失敗」）
  const raw = `HashIV=${cfg.hashIv}&InvoiceTransNo=${r.InvoiceTransNo ?? ''}&MerchantID=${cfg.merchantId}&MerchantOrderNo=${r.MerchantOrderNo ?? ''}&RandomNum=${r.RandomNum ?? ''}&TotalAmt=${r.TotalAmt ?? ''}&HashKey=${cfg.hashKey}`;
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
function issuedRecord(invoice, result, merchantOrderNo, extra = {}) {
  return { provider: 'ezpay', status: 'issued', requested: true, mode: invoice.mode, buyer_ubn: invoice.buyer_ubn || '', buyer_name: invoice.buyer_name || '', carrier_num: invoice.carrier_num || '', love_code: invoice.love_code || '', number: result.InvoiceNumber || '', random: result.RandomNum || '', trans_no: result.InvoiceTransNo || '', merchant_order_no: result.MerchantOrderNo || merchantOrderNo, issued_at: new Date().toISOString(), result, ...extra };
}
async function issueInvoice(cfg, order, invoice, fetcher) {
  const req = issueFields({ order, invoice, cfg });
  const out = await ezpayPost(cfg.issueUrl, req, cfg, fetcher);
  const result = out.Result || {};
  if (result.CheckCode && result.CheckCode !== checkCode({ result, cfg })) throw Object.assign(Error('ezPay 發票 CheckCode 驗證失敗。'), { status: 502, ezpay: out });
  // ezPay 回 SUCCESS 但沒號碼＝已開立、我們解析不到；不丟錯（發票已存在，重開會重複），交給 searchInvoice 補查
  return issuedRecord(invoice, result, req.MerchantOrderNo);
}
async function searchInvoice(cfg, order, invoice, fetcher) {
  const req = searchFields({ order, invoice, cfg });
  const out = await ezpayPost(cfg.searchUrl, req, cfg, fetcher);
  const result = out.Result || {};
  if (result.CheckCode && result.CheckCode !== checkCode({ result, cfg })) throw Object.assign(Error('ezPay 發票 CheckCode 驗證失敗。'), { status: 502, ezpay: out });
  if (!result.InvoiceNumber) throw Object.assign(Error('ezPay 查不到這筆訂單的發票。'), { status: 404, ezpay: out });
  const base = { ...(invoice || {}), ...issuedRecord(invoice || {}, result, req.MerchantOrderNo, { issued_at: invoice?.issued_at || new Date().toISOString(), synced_at: new Date().toISOString() }) };
  // InvoiceStatus 2＝ezPay 端已作廢
  return String(result.InvoiceStatus) === '2' ? { ...base, status: 'void', voided_at: base.voided_at || new Date().toISOString() } : base;
}
async function invalidInvoice(cfg, order, invoice, reason, fetcher) {
  const req = invalidFields({ order, invoice, reason, cfg });
  const out = await ezpayPost(cfg.invalidUrl, req, cfg, fetcher);
  return { ...invoice, status: 'void', voided_at: new Date().toISOString(), void_reason: cleanText(reason, 80), invalid_result: out.Result || out };
}

module.exports = { __issuedRecordForTest: issuedRecord, VERSION, SEARCH_VERSION, INVALID_VERSION, config, configured, encryptPostData, decryptPostData, postData, decodeForm, parseEzpayResponse, parseResultField, invoiceForm, taxIncluded, issueFields, invalidFields, searchFields, checkCode, issueInvoice, invalidInvoice, searchInvoice };
