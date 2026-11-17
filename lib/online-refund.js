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

module.exports = { TAPPAY_REFUND_API, LABEL, target, partialSum, tappayRefundId, tappayRefund, stripeRefund, refundOrder, refundPart };
