import assert from 'node:assert/strict';
import test from 'node:test';
import '../public/order-lib.js';

const O = globalThis.OrderLib;

test('AA 平均分帳以整數元分配，尾差不遺失', () => {
  assert.deepEqual(O.splitBill(1000, 3), { base: 333, remainder: 1, people: 3, total: 1000 });
  assert.deepEqual(O.splitBill(900, 3), { base: 300, remainder: 0, people: 3, total: 900 });
});

test('AA 人數限制為 2–20，金額不得為負數', () => {
  assert.throws(() => O.splitBill(100, 1));
  assert.throws(() => O.splitBill(100, 21));
  assert.throws(() => O.splitBill(-1, 2));
});

test('中英文字典涵蓋桌邊點餐與 AA 結帳核心文案', () => {
  assert.equal(O.text('zh', 'split_evenly'), '平均分攤');
  assert.equal(O.text('en', 'split_evenly'), 'Split evenly');
  assert.equal(O.text('en', 'checkout_title'), 'Pay at the counter after dining');
  assert.equal(O.text('en', 'my_items'), 'My items');
});


test('商品細項依品類收集糖度、冰塊、麵量、飯量並支援日文', () => {
  assert.equal(O.text('ja', 'checkout_title'), 'お食事後にカウンターで会計');
  const tea = O.optionGroups({ cat: 'TEA', zh: '紅茶' }, 'zh').map(g => g.key);
  assert.deepEqual(tea, ['sugar', 'ice']);
  const coffee = O.optionGroups({ cat: 'COFFEE', zh: '拿鐵' }, 'en').map(g => g.key);
  assert.deepEqual(coffee, ['temperature', 'sugar', 'ice']);
  const main = O.optionGroups({ cat: 'MAIN', zh: '牛肉麵飯' }, 'ja').map(g => g.key);
  assert.deepEqual(main, ['rice', 'noodle']);
});
