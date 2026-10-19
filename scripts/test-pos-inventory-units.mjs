// POS 庫存（依 Drive 食材成本表調整）：進貨單位換算、使用率毛重、單位換算、配方成本
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../lib/pos-inventory.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js'), ui = read('public/pos-inventory.js'), docs = read('docs/API.md');

test('品項：進貨單位、使用率、保存欄位驗證', () => {
  const v = I.itemInput({ name: '牛番茄', unit: 'g', pack_unit: '斤', pack_size: 600, yield_rate: 0.9, storage: 'chill', shelf_life: '5 天', supplier: '尚太' });
  assert.equal(v.pack_size, 600); assert.equal(v.yield_rate, 0.9); assert.equal(v.storage, 'chill'); assert.equal(v.supplier, '尚太');
  assert.equal(I.itemInput({ name: 'x', unit: 'g' }).yield_rate, 1, '沒填＝無耗損');
  assert.throws(() => I.itemInput({ name: 'x', unit: 'g', pack_unit: '斤' }), /每一進貨單位/);
  assert.throws(() => I.itemInput({ name: 'x', unit: 'g', yield_rate: 1.5 }), /使用率/);
  assert.equal(I.itemInput({ name: 'x', unit: 'g', storage: 'oven' }).storage, '', '未知保存方式丟掉');
});

test('進貨用進貨單位登記：3.125 斤 → 1875 g，單價到小數 4 位', () => {
  const tomato = { kind: 'raw', qty: 0, pack_unit: '斤', pack_size: 600 };
  const m = I.moveInput({ type: 'in', packs: 3.125, amount: 406.25 }, tomato);
  assert.equal(m.delta, 1875); assert.equal(m.unit_cost, 0.2167); assert.equal(m.packs, 3.125); assert.equal(m.amount, 406.25);
  assert.throws(() => I.moveInput({ type: 'in', packs: 2 }, { kind: 'raw', qty: 0 }), /沒有設定進貨單位/);
  assert.equal(I.moveInput({ type: 'in', qty: 500 }, tomato).delta, 500, '仍可直接填庫存單位');
  assert.equal(I.nextAvgCost({ qty: 0, avg_cost: null }, 1170, 0.0147), 0.0147, '0.0147 元/g 不被捨成 0.01');
});

test('使用率：配方是淨用量，扣毛重（÷使用率）；出餐與製作備料都適用', () => {
  const byId = new Map([['tomato', { yield_rate: 0.9 }], ['salt', { yield_rate: 1 }]]);
  const out = I.consumptionFor([{ line: 'L1', item_id: 'm', qty: 2 }], new Map([['m', [{ inv_id: 'tomato', qty: 135 }, { inv_id: 'salt', qty: 1 }]]]), byId);
  assert.deepEqual(out.map(x => [x.inv_id, x.qty]), [['tomato', 300], ['salt', 2]]);
  assert.deepEqual(I.consumptionFor([{ line: 'L1', item_id: 'm', qty: 1 }], new Map([['m', [{ inv_id: 'tomato', qty: 90 }]]])).map(x => x.qty), [90], '沒帶品項資料＝不放大（舊行為）');
  assert.deepEqual(I.makePlan({ batch_yield: 500 }, 500, [{ inv_id: 'tomato', qty: 450 }], byId), [{ inv_id: 'tomato', qty: 500 }]);
});

test('換算單位：斤→g，庫存、安全量、均價、包裝、配方用量一起換', () => {
  const c = I.convertInput({ unit: 'g', factor: 600 }, { qty: 14.375, safety_qty: 2, avg_cost: 133.91, batch_yield: null, pack_size: null });
  assert.deepEqual(c, { unit: 'g', factor: 600, qty: 8625, safety_qty: 1200, avg_cost: 0.2232, batch_yield: null, pack_size: null });
  assert.deepEqual(I.scaleLines([{ inv_id: 'a', qty: 0.2 }, { inv_id: 'b', qty: 3 }], 'a', 600), [{ inv_id: 'a', qty: 120 }, { inv_id: 'b', qty: 3 }]);
  assert.throws(() => I.convertInput({ unit: 'g', factor: 0 }, {}), /換算倍數/);
});

test('成本：備料每 g 成本由每批配方遞迴算出；菜單成本率；缺均價會列出', () => {
  const byId = new Map([
    ['tomato', { id: 'tomato', name: '牛番茄', kind: 'raw', avg_cost: 0.15, yield_rate: 0.9 }],
    ['plum', { id: 'plum', name: '白話梅', kind: 'raw', avg_cost: 0.26 }],
    ['sugar', { id: 'sugar', name: '特砂糖', kind: 'raw', avg_cost: 0.035 }],
    ['water', { id: 'water', name: '水', kind: 'raw', avg_cost: 0 }],
    ['liquid', { id: 'liquid', name: '梅漬番茄液', kind: 'prep', batch_yield: 1170, bom: [{ inv_id: 'plum', qty: 50 }, { inv_id: 'water', qty: 1000 }, { inv_id: 'sugar', qty: 120 }] }],
    ['tea', { id: 'tea', name: '焙茶粉', kind: 'raw', avg_cost: null }],
  ]);
  assert.equal(I.unitCostOf('liquid', byId), 0.0147, 'Drive 表：梅漬番茄液 0.0147 元/g');
  const c = I.menuCost([{ inv_id: 'tomato', qty: 126 }, { inv_id: 'liquid', qty: 100 }, { inv_id: 'tea', qty: 1 }], byId, 120);
  assert.equal(c.cost, 22.47); assert.equal(c.ratio, 0.187); assert.deepEqual(c.missing, ['焙茶粉']);
  // 循環配方不當機
  const loop = new Map([['a', { id: 'a', kind: 'prep', batch_yield: 1, bom: [{ inv_id: 'b', qty: 1 }], avg_cost: 2 }], ['b', { id: 'b', kind: 'prep', batch_yield: 1, bom: [{ inv_id: 'a', qty: 1 }] }]]);
  assert.equal(I.unitCostOf('a', loop), 2);
});

test('接線：新欄位進 schema／SQL、換算端點、出餐與製作讀使用率、GET 回成本', () => {
  assert.match(server, /ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS pack_unit[^`]*yield_rate[^`]*shelf_life/);
  assert.match(server, /INV_SEL='[^']*pack_size::float AS pack_size,yield_rate::float AS yield_rate,supplier,storage,shelf_life/);
  assert.match(server, /app\.post\('\/api\/admin\/inventory\/items\/:id\/convert',auth,adminOnly,requireDb/);
  assert.match(server, /posInventory\.consumptionFor\(use,[^;]*,invById\)/);
  assert.match(server, /posInventory\.makePlan\(item,m\.produced,item\.bom,src\)/);
  assert.match(server, /costs\[id\]=posInventory\.menuCost\(/);
  assert.match(server, /已有庫存，改單位請用「換算單位」/);
  assert.ok(docs.includes('### POST /api/admin/inventory/items/:id/convert'));
  assert.match(ui, /function invConvertDialog/); assert.match(ui, /packs:qn/); assert.match(ui, /成本／成本率/);
  assert.match(ui, /id="inv-yield-rate"/); assert.match(ui, /id="inv-pack-size"/);
});
