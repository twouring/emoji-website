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
