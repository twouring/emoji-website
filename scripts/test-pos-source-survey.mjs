// 結帳來源調查（KK 11/8）：「怎麼知道我們店」選填一項，存 payer.source，分析 → 客群統計
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const js = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const items = [{ line: 1, item_id: 'x', zh: '拿鐵', cat: 'COFFEE', venue: 'CAFE', price: 150, qty: 1 }];
test('posCheckout 只收白名單來源，預收不記', () => {
  assert.equal(T.posCheckout(items, { method: 'cash', source: 'ig' }, new Map(), [], {}).payer.source, 'ig');
  assert.equal(T.posCheckout(items, { method: 'cash', source: 'hack' }, new Map(), [], {}).payer.source, undefined);
  assert.equal(T.posCheckout(items, { method: 'cash' }, new Map(), [], {}).payer.source, undefined);
});
test('analyticsSummary 依來源統計單數與營收，沒填歸 none', () => {
  const o = (id, source, amount) => ({ id, status: 'paid', amount, paid_at: '2026-11-08T06:00:00Z', table_no: 'A1', items, payer: source ? { method: 'cash', source } : { method: 'cash' } });
  const d = T.analyticsSummary([o('a', 'ig', 100), o('b', 'ig', 50), o('c', 'friend', 80), o('d', '', 30)]);
  assert.deepEqual(d.sources.ig, { orders: 2, amount: 150 });
  assert.deepEqual(d.sources.friend, { orders: 1, amount: 80 });
  assert.deepEqual(d.sources.none, { orders: 1, amount: 30 });
});
test('前端選項與後端一致、結帳送 source、換桌重置、分析有表', () => {
  const m = js.match(/const SOURCE_OPTIONS=(\[.*?\]\]);/);
  assert.ok(m); assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), T.SOURCE_OPTIONS);
  assert.match(js, /source:POS_SOURCE\|\|undefined/);
  assert.match(js.slice(js.indexOf('function posSelectTable(t){'), js.indexOf('paintPos();}', js.indexOf('function posSelectTable(t){'))), /POS_SOURCE=''/);
  assert.match(js, /data-source=/);
  assert.match(js, /怎麼知道我們（結帳調查）/);
  const a = js.indexOf('<div class="pos-pay">'), z = js.indexOf('<div class="pos-dock">', a), pay = js.slice(a, z);
  assert.ok(pay.indexOf('pos-blk--source') > pay.indexOf('<b>支付方式</b>') && pay.indexOf('pos-blk--source') < pay.indexOf('<b>結帳內容</b>'));
});
