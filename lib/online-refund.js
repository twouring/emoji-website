'use strict';
/* POS 作廢／取消品項的線上刷卡自動退款（KK 11/17「都要自動退」）：
   - 桌邊 TapPay（table_orders.tappay.rec_trade_id）→ TapPay Refund API
   - 等等空間／約書旅櫃檯「線上刷卡 QR」、App 商店（payer.method='stripe'，payer.payment_intent）→ Stripe refunds
   作廢整張＝退剩餘全額（記 payer.online_refund，已退過不再退）；取消單一品項＝部分退款（記 payer.online_refunds[key]）。
   路由一律先退款、成功才改帳；Stripe 帶 idempotencyKey、TapPay 帶 bank_refund_id，重試不會重複退。 */
const TAPPAY_REFUND_API = { sandbox: 'https://sandbox.tappaysdk.com/tpc/transaction/refund', production: 'https://prod.tappaysdk.com/tpc/transaction/refund' };
const LABEL = { tappay: 'TapPay', stripe: 'Stripe' };

/* 這張單要退到哪裡；null＝不是線上刷卡 */
function target(order) {
  if (!order) return null;
  if (order.tappay?.rec_trade_id) return { provider: 'tappay', id: String(order.tappay.rec_trade_id) };
  if (order.payer?.method === 'stripe') {
    if (!order.payer.payment_intent) throw Object.assign(Error('這張 Stripe 單沒有付款編號，無法自動退款，請聯絡言文字管理員到 Stripe 後台處理。'), { status: 409 });
    return { provider: 'stripe', id: String(order.payer.payment_intent) };
  }
  return null;
}
const partialSum = order => Object.values(order?.payer?.online_refunds || {}).reduce((a, r) => a + (Number(r?.amount) || 0), 0);
/* bank_refund_id：半形英數、≤20 字、不可重複 */
const tappayRefundId = key => ('V' + require('crypto').createHash('sha1').update(key).digest('hex')).slice(0, 20);

async function tappayRefund(config, recTradeId, { amount, key }, fetcher = fetch) {
  if (!config) throw Object.assign(Error('TapPay 未設定，無法自動退款。'), { status: 503 });
  const body = { partner_key: config.partnerKey, rec_trade_id: recTradeId, bank_refund_id: tappayRefundId(key) };
  if (amount != null) body.amount = amount;
  const res = await fetcher(TAPPAY_REFUND_API[config.mode] || TAPPAY_REFUND_API.sandbox, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.partnerKey },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status !== 0) throw Object.assign(Error('TapPay 退款失敗：' + (out.msg || ('HTTP ' + res.status))), { status: 502 });
  return { refund_id: out.refund_id || '', amount: Number(out.refund_amount) };
}

async function stripeRefund(stripe, intent, { amount, key, orderId }) {
  if (!stripe) throw Object.assign(Error('Stripe 未設定，無法自動退款。'), { status: 503 });
  try {
    const r = await stripe.refunds.create({ payment_intent: intent, ...(amount != null ? { amount: Math.round(amount * 100) } : {}), metadata: { kind: 'pos-void', order_id: orderId } }, { idempotencyKey: 'pos-' + key });
    return { refund_id: r.id, amount: Math.round(Number(r.amount) / 100), status: r.status };
  } catch (e) {
    throw Object.assign(Error('Stripe 退款失敗：' + (e.message || e)), { status: 502 });
  }
}

/* 作廢整張：退剩餘全額。回 null＝不用退（非線上刷卡、已退過、金額 0） */
async function refundOrder(order, { tappay, stripe, fetcher, by = '' } = {}) {
  const t = target(order);
  if (!t || order.payer?.online_refund) return null;
  const amount = Math.max(0, Math.round(Number(order.amount) || 0));
  if (amount <= 0) return null;
  const key = 'void-' + order.id, partial = partialSum(order) > 0;
  try {
    // 沒取消過品項：不帶金額＝全額退；退過部分：只退剩下的 order.amount
    const out = t.provider === 'tappay' ? await tappayRefund(tappay, t.id, { amount: partial ? amount : undefined, key }, fetcher)
      : await stripeRefund(stripe, t.id, { amount: partial ? amount : undefined, key, orderId: order.id });
    return { provider: t.provider, ref: t.id, refund_id: out.refund_id, amount: Number.isFinite(out.amount) && out.amount > 0 ? out.amount : amount, status: out.status || 'submitted', at: new Date().toISOString(), by };
  } catch (e) { throw Object.assign(Error(e.message + '；單據未作廢，請稍後再試，或請言文字管理員到 ' + LABEL[t.provider] + ' 後台處理。'), { status: e.status || 502 }); }
}

/* 取消單一品項：部分退款 amount 元，key 唯一（單號＋行號） */
async function refundPart(order, amount, key, { tappay, stripe, fetcher, by = '' } = {}) {
  const t = target(order);
  amount = Math.max(0, Math.round(Number(amount) || 0));
  if (!t || amount <= 0) return null;
  if (order.payer?.online_refunds?.[key]) return order.payer.online_refunds[key];
  try {
    const out = t.provider === 'tappay' ? await tappayRefund(tappay, t.id, { amount, key }, fetcher)
      : await stripeRefund(stripe, t.id, { amount, key, orderId: order.id });
    return { provider: t.provider, ref: t.id, refund_id: out.refund_id, amount, status: out.status || 'submitted', at: new Date().toISOString(), by };
  } catch (e) { throw Object.assign(Error(e.message + '；品項未取消，請稍後再試，或請言文字管理員到 ' + LABEL[t.provider] + ' 後台處理。'), { status: e.status || 502 }); }
}

/* 現場人員手動退完款後登記（KK 11/17「現場人員完成退款要可以更新」）：只能登記作廢單；
   系統已自動退過（online_refund）或已退現金（drawer_refunds）就不用登記；同一張只登記一次，登錯由言文字管理員處理 */
const MANUAL_METHODS = { card: '刷卡機退刷', linepay: 'LINE Pay 退款', transfer: '匯款／轉帳退回', cash: '現金退還', stripe: 'Stripe 後台退款', tappay: 'TapPay 後台退款', other: '其他' };
function manualRefund(order, body, { by = '', operator = null, now = Date.now() } = {}) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.status !== 'void') throw Object.assign(Error('只有作廢單可以登記退款。'), { status: 409 });
  const p = order.payer || {};
  if (p.online_refund && Number(p.online_refund.amount) > 0) throw Object.assign(Error('這張單系統已自動退款，不需登記。'), { status: 409 });
  if (p.manual_refund) throw Object.assign(Error('這張單已登記過退款。'), { status: 409 });
  const method = String(body?.method || '');
  if (!MANUAL_METHODS[method]) throw Object.assign(Error('請選退款方式。'), { status: 400 });
  const total = Math.max(0, Math.round(Number(order.amount) || 0));
  const amount = body?.amount == null || body.amount === '' ? total : Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > total) throw Object.assign(Error(`退款金額須為 1–${total} 元的整數。`), { status: 400 });
  const note = String(body?.note || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (method === 'other' && !note) throw Object.assign(Error('選「其他」請寫明怎麼退的。'), { status: 400 });
  return { method, label: MANUAL_METHODS[method], amount, note, at: new Date(now).toISOString(), by: String(by).slice(0, 120), operator: operator ? String(operator.name || operator.id).slice(0, 40) : '' };
}

module.exports = { MANUAL_METHODS, manualRefund, TAPPAY_REFUND_API, LABEL, target, partialSum, tappayRefundId, tappayRefund, stripeRefund, refundOrder, refundPart };
