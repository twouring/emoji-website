'use strict';
/* POS 線上刷卡 QR（KK 11/17）：等等空間／約書旅櫃檯選「線上刷卡」→ 伺服器以未付品項重算金額、建 Stripe Checkout → mPOP 印付款 QR，
   客人手機掃碼刷卡；webhook 或 POS 輪詢 /check 入帳（以 Stripe session id 冪等）。只收整桌原價（不套折扣／會員價／分帳），金額不信任前端。
   不開新表：進行中的付款意圖存 site_content `card_qr:<桌次 id>`，重整／換平板仍可查回。 */
const VENUES = ['STAY', 'REST'];
const KIND = 'pos_card';
const EXPIRE_MIN = 30;   // Stripe Checkout 最短 30 分鐘
const LABEL = '線上刷卡';
const enabledFor = venues => Array.isArray(venues) && venues.length > 0 && venues.every(v => VENUES.includes(v));
const key = sessionId => 'card_qr:' + sessionId;

/* 這桌可以線上刷卡的品項：未付、非抵扣行、全部屬於等等空間／約書旅；金額＝原價合計 */
function quote(unpaidLines, venues) {
  const lines = (unpaidLines || []).filter(l => !l.cancelled && !l.credit_of);
  if (!lines.length) throw Object.assign(Error('這桌沒有未付款的品項。'), { status: 400 });
  if (!lines.every(l => VENUES.includes(l.venue) && (!venues || venues.includes(l.venue))))
    throw Object.assign(Error('線上刷卡 QR 只適用等等空間、約書旅的品項。'), { status: 403 });
  const amount = lines.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  if (!(amount >= 1)) throw Object.assign(Error('金額為 0，不需要線上刷卡。'), { status: 400 });
  return { lines, amount, venue: lines[0].venue };
}

/* 入帳前核對：桌次還開著、要結的品項仍未付且一行不少、幣別與金額一致 */
function matches(session, meta, unpaidLines, stripeSession) {
  const wanted = String(meta?.lines || '').split(',').filter(Boolean);
  const set = new Set(wanted);
  const lines = (unpaidLines || []).filter(l => set.has(l.line));
  const amountPaid = Math.round(Number(stripeSession?.amount_total) / 100);
  const sum = lines.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const ok = !!session && session.status === 'open' && stripeSession?.currency === 'twd' && wanted.length > 0 && lines.length === wanted.length && sum === amountPaid && String(amountPaid) === String(meta?.amount);
  return { ok, lines, amountPaid };
}

const productName = (venue, table) => `${venue === 'REST' ? '約書旅 Rest Book' : '等等空間 Stay Square'}｜${table || ''} 消費`;

module.exports = { VENUES, KIND, EXPIRE_MIN, LABEL, enabledFor, key, quote, matches, productName };
