import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const items = [
  { line: 'a1', item_id: 'x', zh: '拿鐵', price: 100, qty: 3 },
  { line: 'b2', item_id: 'y', zh: '司康', price: 50, qty: 1 },
];
test('quantities 只結指定份數並拆出新行', () => {
  const out = T.posCheckout(items, { method: 'cash', lines: ['a1'], quantities: { a1: 1 } }, new Map(), []);
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].qty, 1);
  assert.equal(out.lines[0].part_of, 'a1');
  assert.notEqual(out.lines[0].line, 'a1');
  assert.equal(out.amount, 100);
});
test('settleItems 原行扣份數、已結行標 order_id', () => {
  const out = T.posCheckout(items, { method: 'cash', quantities: { a1: 2 } }, new Map(), []);
  const next = T.settleItems(items, out.lines, 'to_1');
  assert.equal(next.find(l => l.line === 'a1').qty, 1);
  assert.ok(!next.find(l => l.line === 'a1').order_id);
  assert.equal(next.find(l => l.line === 'b2').order_id, 'to_1');
  const paid = next.filter(l => l.order_id === 'to_1' && l.part_of === 'a1');
  assert.equal(paid.length, 1); assert.equal(paid[0].qty, 2);
  assert.equal(T.sum(T.unpaid(next)), 100);
  assert.equal(out.amount, 250);
});
test('份數等於全量＝整行結；超過或非整數 400', () => {
  const full = T.posCheckout(items, { method: 'cash', quantities: { a1: 3 } }, new Map(), []);
  assert.equal(full.lines[0].line, 'a1');
  for (const bad of [0, 4, 1.5, 'x']) assert.throws(() => T.posCheckout(items, { method: 'cash', quantities: { a1: bad } }, new Map(), []), e => e.status === 400);
});
test('前端與伺服器都接上 quantities', () => {
  assert.match(fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8'), /data-part=.*quantities:/s);
  assert.match(fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8'), /settleItems\(s\.items,out\.lines,orderId,out\.credit\)/);
});
