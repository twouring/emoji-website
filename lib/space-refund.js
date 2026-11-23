'use strict';
/* 空間情境線上預付入場單退單（KK 11/23「pos 也要可以退單」）：
   會員 App 線上買的等等空間會籍／約書旅入場，還沒入場（space.prepaid 且沒 in_at）時，POS 一鍵退單：
   Stripe 退款（已在 Stripe 後台退過就沿用那筆，不重複退）→ 作廢發票 → 沖回累點 → 作廢訂單、收掉入場單 → 收回未啟用的會籍。
   入場後或會籍已啟用的不在這裡退（要走一般作廢或請言文字管理員處理）。 */

const err = (status, message) => Object.assign(Error(message), { status });

/* 能不能退：s＝table_sessions 列、order＝這張入場單的訂單、ent＝對應的會籍（約書旅沒有）、now 用來判斷會籍是否已自動啟用 */
function check(s, order, ent, { autoActivateAt, now = new Date() } = {}) {
  if (!s || s.status !== 'open' || !s.space) throw err(404, '找不到這張入場單。');
  if (s.space.in_at) throw err(409, '客人已經入場，不能用退單；請先離場結清，再到查單作廢。');
  if (s.space.prepaid !== true) throw err(409, '這張不是線上已付的入場單，請用一般作廢。');
  if (!order) throw err(404, '找不到這張入場單的付款紀錄。');
  if (order.status === 'void') throw err(409, '這張單已作廢。');
  const p = order.payer || {};
  if (p.method !== 'stripe' || !p.payment_intent) throw err(409, '這張單沒有 Stripe 付款編號，無法自動退款，請聯絡言文字管理員。');
  if (ent) {
    if (ent.activated_at) throw err(409, '這筆會籍已啟用，不能退單；請聯絡言文字管理員處理。');
    if (autoActivateAt && ent.purchased_at && now >= autoActivateAt(ent.purchased_at)) throw err(409, '這筆會籍購買已超過 7 天、已自動啟用，不能退單；請聯絡言文字管理員處理。');
  }
  const amount = Math.max(0, Math.round(Number(order.amount) || 0));
  if (amount <= 0) throw err(409, '這張單金額是 0，不用退款。');
  return { amount, intent: String(p.payment_intent) };
}

/* Stripe 退款：先看這筆付款已退多少（可能已在 Stripe 後台手動退過），只退剩下的；全部退過就回既有那筆，不再建立新的 */
async function stripeRefundRemaining(stripe, intent, amountTwd, key) {
  if (!stripe) throw err(503, 'Stripe 未設定，無法自動退款。');
  let list;
  try { list = await stripe.refunds.list({ payment_intent: intent, limit: 20 }); }
  catch (e) { throw err(502, 'Stripe 查詢退款失敗：' + (e.message || e)); }
  const live = (list?.data || []).filter(r => r.status !== 'failed' && r.status !== 'canceled');
  const done = live.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const remaining = amountTwd * 100 - done;
  if (remaining <= 0) return { refund_id: live.map(r => r.id).join(','), amount: amountTwd, status: live.every(r => r.status === 'succeeded') ? 'succeeded' : 'pending', existing: true };
  let r;
  try { r = await stripe.refunds.create({ payment_intent: intent, amount: remaining, reason: 'requested_by_customer', metadata: { kind: 'pos-space-refund' } }, { idempotencyKey: 'pos-space-refund-' + key }); }
  catch (e) { throw err(502, 'Stripe 退款失敗：' + (e.message || e) + '；入場單未退，請稍後再試，或請言文字管理員到 Stripe 後台處理。'); }
  return { refund_id: [...live.map(x => x.id), r.id].join(','), amount: amountTwd, status: r.status, existing: live.length > 0 };
}

module.exports = { check, stripeRefundRemaining };
