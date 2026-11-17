import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { changePayMethod } = createRequire(import.meta.url)('../lib/table-orders.js');
const base = () => ({ status: 'paid', amount: 300, paid_at: new Date(), payer: { method: 'cash', received: 500, change: 200 } });
test('現金改 LINE Pay：清掉實收／找零並留紀錄', () => {
  const p = changePayMethod(base(), 'linepay', { by: 'a@b' });
  assert.equal(p.method, 'linepay'); assert.equal(p.received, undefined); assert.equal(p.method_changes[0].from[0].method, 'cash');
});
test('改成現金：視為收足額', () => {
  const p = changePayMethod({ ...base(), payer: { method: 'card' } }, 'cash');
  assert.equal(p.received, 300); assert.equal(p.change, 0);
});
test('混合付款改單一', () => {
  const p = changePayMethod({ ...base(), payer: { method: 'mixed', payments: [{ method: 'cash', amount: 100 }, { method: 'card', amount: 200 }] } }, 'transfer');
  assert.equal(p.payments, undefined); assert.equal(p.method, 'transfer');
});
test('擋：相同、作廢、跨營業日、預收、線上刷卡、非法方式', () => {
  assert.throws(() => changePayMethod(base(), 'cash'), /沒有變更/);
  assert.throws(() => changePayMethod({ ...base(), status: 'void' }, 'card'), /已作廢/);
  assert.throws(() => changePayMethod({ ...base(), paid_at: new Date(Date.now() - 3 * 864e5) }, 'card'), /當個營業日/);
  assert.throws(() => changePayMethod({ ...base(), payer: { method: 'cash', prepay: true } }, 'card'), /預收/);
  assert.throws(() => changePayMethod({ ...base(), tappay: { rec_trade_id: 'x' } }, 'card'), /線上刷卡/);
  assert.throws(() => changePayMethod(base(), 'bogus'), /付款方式/);
});
test('補登線上刷卡（KK 11/18）：其他→stripe 標 stripe_manual，可再改回', () => {
  const p = changePayMethod({ ...base(), payer: { method: 'other' } }, 'stripe');
  assert.equal(p.method, 'stripe'); assert.equal(p.stripe_manual, true);
  const back = changePayMethod({ ...base(), payer: p }, 'cash');
  assert.equal(back.method, 'cash'); assert.equal(back.stripe_manual, undefined);
});
test('真正經 Stripe 入帳的單不能改', () => {
  assert.throws(() => changePayMethod({ ...base(), payer: { method: 'stripe', stripe_session: 'cs_x', payment_intent: 'pi_x' } }, 'cash'), /線上刷卡/);
});
test('補登的線上刷卡作廢不走自動退款', () => {
  const { target } = createRequire(import.meta.url)('../lib/online-refund.js');
  assert.equal(target({ payer: { method: 'stripe', stripe_manual: true } }), null);
  assert.deepEqual(target({ payer: { method: 'stripe', payment_intent: 'pi_1' } }), { provider: 'stripe', id: 'pi_1' });
});
test('POS 更正付款方式選單含線上刷卡', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(src, /\[\.\.\.payMethodsActive\(\),\{code:'stripe',label:'線上刷卡'\}\]/);
  assert.match(src, /const canChangePay=/);
});
