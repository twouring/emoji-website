/* 桌邊 QR 點餐：桌號簽章、共桌購物車、TapPay pay-by-prime。
 * 資料模型：table_sessions（一桌一場，多人共用 items）＋ table_orders（每次付款一張出餐單）。
 * 未信任任何前端金額：付款金額一律由伺服器端 items 快照重算。 */
'use strict';

const crypto = require('node:crypto');
require('../public/menu-lib.js'); // 無 window 時掛到 globalThis.MenuLib
const MenuLib = globalThis.MenuLib;

const TABLE_RE = /^[A-Za-z0-9-]{1,8}$/;
const TAPPAY_API = { sandbox: 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime', production: 'https://prod.tappaysdk.com/tpc/payment/pay-by-prime' };

/* 桌號簽章：QR 內含 t=桌號&k=簽章，避免任何人在家亂點。撤銷＝換 APP_SECRET（ponytail：不做逐桌撤銷）。 */
function tableKey(table, secret) {
  return crypto.createHmac('sha256', secret).update('table:' + String(table).toUpperCase()).digest('base64url').slice(0, 16);
}
function verifyTable(table, key, secret) {
  if (!TABLE_RE.test(String(table || '')) || typeof key !== 'string' || key.length !== 16) return null;
  const expect = tableKey(table, secret);
  return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(key)) ? String(table).toUpperCase() : null;
}
function tableUrl(origin, table, secret) {
  return `${origin}/order?t=${encodeURIComponent(String(table).toUpperCase())}&k=${tableKey(table, secret)}`;
}

function tappayConfig(env = process.env) {
  const { TAPPAY_APP_ID, TAPPAY_APP_KEY, TAPPAY_PARTNER_KEY, TAPPAY_MERCHANT_ID } = env;
  if (!TAPPAY_APP_ID || !TAPPAY_APP_KEY || !TAPPAY_PARTNER_KEY || !TAPPAY_MERCHANT_ID) return null;
  const mode = env.TAPPAY_ENV === 'production' ? 'production' : 'sandbox';
  return { appId: TAPPAY_APP_ID, appKey: TAPPAY_APP_KEY, partnerKey: TAPPAY_PARTNER_KEY, merchantId: TAPPAY_MERCHANT_ID, mode };
}

/* 由 site_content.menu 取可點品項（已發布），以 id 為 key；給 venue 則只留該品牌（null＝非營業時段，無品項） */
function menuIndex(menuJson, venue) {
  const items = MenuLib.publishedOnly(MenuLib.parseMenuDoc(menuJson || '')).filter(it => venue === undefined || it.venue === venue);
  return new Map(items.map(it => [it.id, it]));
}

const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);

/* 新增一行：價格以菜單當下售價快照（ponytail：不套會員價，桌邊點餐不登入） */
function addLine(items, menu, { item_id, qty, by, guest, note: note0 }) {
  const it = menu.get(String(item_id || ''));
  if (!it) throw Object.assign(Error('品項不存在或已下架。'), { status: 400 });
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw Object.assign(Error('數量須為 1–20。'), { status: 400 });
  if (!/^[a-z0-9]{8,32}$/.test(String(guest || ''))) throw Object.assign(Error('缺少來賓識別。'), { status: 400 });
  if (items.filter(l => !l.order_id).length >= 60) throw Object.assign(Error('本桌未結帳品項過多，請先結帳。'), { status: 400 });
  // 同人同品項無備註：合併數量而非另開一行
  const note = cleanText(note0, 60);
  const same = items.find(l => !l.order_id && l.guest === String(guest) && l.item_id === it.id && !l.note && !note);
  if (same) return items.map(l => l === same ? { ...l, qty: Math.min(20, l.qty + n) } : l);
  const line = {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: it.id, zh: it.zh, en: it.en, price: it.price, qty: n,
    by: cleanText(by, 20) || '客人', guest: String(guest), note, order_id: null, added_at: new Date().toISOString(),
  };
  return items.concat([line]);
}
function removeLine(items, line, guest) {
  const target = items.find(l => l.line === line);
  if (!target) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (target.order_id) throw Object.assign(Error('已付款品項不可移除。'), { status: 409 });
  if (target.guest !== guest) throw Object.assign(Error('只能移除自己點的品項。'), { status: 403 });
  return items.filter(l => l.line !== line);
}
const lineTotal = l => l.price * l.qty;
const unpaid = items => items.filter(l => !l.order_id);
const sum = lines => lines.reduce((a, l) => a + lineTotal(l), 0);

/* 選要付的行：未指定＝全桌未付；指定＝只付那些（可只付自己的） */
function selectLines(items, lines) {
  const open = unpaid(items);
  if (!Array.isArray(lines) || !lines.length) return open;
  const set = new Set(lines.map(String));
  const picked = open.filter(l => set.has(l.line));
  if (picked.length !== set.size) throw Object.assign(Error('部分品項已付款或已被移除，請重新整理。'), { status: 409 });
  return picked;
}

function payer(body) {
  const name = cleanText(body?.name, 40), phone = cleanText(body?.phone, 20), email = cleanText(body?.email, 120).toLowerCase();
  if (!name) throw Object.assign(Error('請填寫持卡人姓名。'), { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(Error('Email 格式不正確。'), { status: 400 });
  if (phone && !/^\+?[0-9-]{8,20}$/.test(phone)) throw Object.assign(Error('電話格式不正確。'), { status: 400 });
  return { name, phone, email };
}

/* TapPay Pay by Prime；status 0 才算成功。回 TapPay 原始回應（含 rec_trade_id）。 */
async function payByPrime(config, { prime, amount, orderNumber, details, cardholder }, fetcher = fetch) {
  if (typeof prime !== 'string' || !/^[A-Za-z0-9]{20,128}$/.test(prime)) throw Object.assign(Error('付款資料無效，請重新輸入卡號。'), { status: 400 });
  const res = await fetcher(TAPPAY_API[config.mode], {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.partnerKey },
    body: JSON.stringify({
      prime, partner_key: config.partnerKey, merchant_id: config.merchantId, amount, currency: 'TWD', details: details.slice(0, 100),
      order_number: orderNumber, remember: false,
      cardholder: { phone_number: cardholder.phone || '+886900000000', name: cardholder.name, email: cardholder.email || 'noreply@emoji.tw' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status !== 0) throw Object.assign(Error('付款未成功：' + (out.msg || ('HTTP ' + res.status))), { status: 402, tappay: out });
  return out;
}

/* 每桌一場：沒有未付品項且所有出餐單都完成＝這桌結束，下一組客人掃碼開新場 */
function sessionFinished(items, orders) {
  return unpaid(items).length === 0 && orders.every(o => o.status === 'done') && (items.length > 0 || orders.length > 0);
}

module.exports = { TABLE_RE, TAPPAY_API, tableKey, verifyTable, tableUrl, tappayConfig, menuIndex, addLine, removeLine, selectLines, unpaid, sum, payer, payByPrime, sessionFinished, cleanText };
