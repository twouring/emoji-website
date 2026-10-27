// POS 庫存：純函式（配方、製作備料、平均成本、出餐扣量、作廢回補判定）＋ 接線（送單／結帳／排程都會扣、權限、文件、分頁）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../lib/pos-inventory.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js'), html = read('public/pos.html'), ui = read('public/pos-inventory.js'), docs = read('docs/API.md'), log = read('lib/pos-log.js');

test('品項設定：備料要有每批產出量；店別、單位、名稱驗證', () => {
  assert.deepEqual(I.itemInput({ name: ' 鮮奶 ', unit: 'ml', safety_qty: '2000' }), { name: '鮮奶', kind: 'raw', unit: 'ml', venue: 'TTH', safety_qty: 2000, batch_yield: null, category: '', shelf_life: '', storage: '', supplier: '', pack_unit: '', pack_size: null, yield_rate: 1, ref_cost: null, note: '', active: true });
  const p = I.itemInput({ name: '青醬', kind: 'prep', unit: 'g', batch_yield: 500, venue: 'cafe' });
  assert.equal(p.kind, 'prep'); assert.equal(p.batch_yield, 500); assert.equal(p.venue, 'CAFE');
  assert.throws(() => I.itemInput({ name: '青醬', kind: 'prep', unit: 'g', batch_yield: 0 }), /每批產出量/);
  assert.throws(() => I.itemInput({ name: '', unit: 'g' }), /品名/);
  assert.throws(() => I.itemInput({ name: 'x', unit: '' }), /單位/);
  assert.throws(() => I.itemInput({ name: 'x', unit: 'g', venue: 'SPACE' }), /店別/);
  // 修改時沒帶的欄位沿用
  assert.equal(I.itemInput({ safety_qty: 5 }, { name: '豆', kind: 'raw', unit: 'g', venue: 'BAR' }).venue, 'BAR');
});

test('配方：合併同品項、拒絕 0 與不存在的品項、備料不能用自己', () => {
  const items = [{ id: 'a', name: '鮮奶' }, { id: 'b', name: '青醬' }];
  assert.deepEqual(I.recipeInput([{ inv_id: 'a', qty: 100 }, { inv_id: 'a', qty: 50.5 }, { inv_id: 'b', qty: '20' }], items), [{ inv_id: 'a', qty: 150.5 }, { inv_id: 'b', qty: 20 }]);
  assert.throws(() => I.recipeInput([{ inv_id: 'a', qty: 0 }], items), /用量/);
  assert.throws(() => I.recipeInput([{ inv_id: 'zz', qty: 1 }], items), /找不到/);
  assert.throws(() => I.recipeInput([{ inv_id: 'b', qty: 1 }], items, { selfId: 'b' }), /自己/);
  assert.deepEqual(I.recipeInput([], items), []);
});

test('手動異動：進貨帶金額算單價、報廢要原因、盤點記盤差、製作只限備料', () => {
  const raw = { id: 'a', kind: 'raw', qty: 300 }, prep = { id: 'b', kind: 'prep', qty: 0, batch_yield: 500 };
  assert.deepEqual(I.moveInput({ type: 'in', qty: 1000, amount: 120 }, raw), { type: 'in', delta: 1000, unit_cost: 0.12, amount: 120, note: '' });
  assert.equal(I.moveInput({ type: 'in', qty: 2 }, raw).unit_cost, null);
  assert.equal(I.moveInput({ type: 'use', qty: 50 }, raw).delta, -50);
  assert.throws(() => I.moveInput({ type: 'waste', qty: 5 }, raw), /報廢原因/);
  assert.equal(I.moveInput({ type: 'waste', qty: 5, note: '過期' }, raw).delta, -5);
  const c = I.moveInput({ type: 'count', counted: 280 }, raw); assert.equal(c.delta, -20); assert.equal(c.counted, 280);
  assert.equal(I.moveInput({ type: 'count', counted: 0 }, raw).delta, -300, '盤點可以點到 0');
  assert.throws(() => I.moveInput({ type: 'make', qty: 1 }, raw), /只有備料/);
  assert.deepEqual(I.moveInput({ type: 'make', qty: 250 }, prep), { type: 'make', delta: 250, unit_cost: null, amount: null, note: '', produced: 250 });
  assert.throws(() => I.moveInput({ type: 'in', qty: 0 }, raw), /數量/);
  assert.throws(() => I.moveInput({ type: 'sale', qty: 1 }, raw), /操作只能/, '出餐扣庫存只能由系統產生');
  assert.throws(() => I.moveInput({ type: 'in', qty: 1 }, { ...raw, active: false }), /停用/);
});

test('製作備料：依每批配方等比扣原物料（半批、兩批）', () => {
  const prep = { batch_yield: 500 }, bom = [{ inv_id: 'basil', qty: 200 }, { inv_id: 'oil', qty: 150 }, { inv_id: 'nut', qty: 30 }];
  assert.deepEqual(I.makePlan(prep, 250, bom), [{ inv_id: 'basil', qty: 100 }, { inv_id: 'oil', qty: 75 }, { inv_id: 'nut', qty: 15 }]);
  assert.deepEqual(I.makePlan(prep, 1000, bom).map(x => x.qty), [400, 300, 60]);
  assert.deepEqual(I.makePlan(prep, 100, []), []);
});

test('平均成本：加權平均；庫存為 0 或負數時直接用這批單價', () => {
  assert.equal(I.nextAvgCost({ qty: 1000, avg_cost: 0.1 }, 1000, 0.14), 0.12);
  assert.equal(I.nextAvgCost({ qty: 0, avg_cost: 0.1 }, 500, 0.2), 0.2);
  assert.equal(I.nextAvgCost({ qty: -50, avg_cost: 0.1 }, 500, 0.2), 0.2);
  assert.equal(I.nextAvgCost({ qty: 10, avg_cost: 0.5 }, -3, null), 0.5, '扣庫存不動均價');
});

test('出餐扣量：每份配方 × 份數；套餐依組成品項；取消、預收、抵扣行不扣；同一行固定 ref_key', () => {
  const recipes = new Map([['latte', [{ inv_id: 'milk', qty: 200 }, { inv_id: 'bean', qty: 18 }]], ['pasta', [{ inv_id: 'pesto', qty: 40 }, { inv_id: 'noodle', qty: 120 }]], ['combo', [{ inv_id: 'cup', qty: 1 }]]]);
  const out = I.consumptionFor([
    { line: 'L1', item_id: 'latte', qty: 2 },
    { line: 'L2', item_id: 'combo', qty: 1, parts: [{ item_id: 'pasta' }, { item_id: 'latte' }] },
    { line: 'L3', item_id: 'latte', qty: 1, cancelled: true },
    { line: 'L4', item_id: '', qty: 1, prepay: true },
    { line: 'L5', item_id: '', qty: 1, credit_of: 'to_x' },
    { line: 'L6', item_id: 'nothing', qty: 3 },
  ], recipes);
  assert.deepEqual(out, [
    { ref_key: 'line:L1', line: 'L1', inv_id: 'milk', qty: 400 }, { ref_key: 'line:L1', line: 'L1', inv_id: 'bean', qty: 36 },
    { ref_key: 'line:L2', line: 'L2', inv_id: 'cup', qty: 1 }, { ref_key: 'line:L2', line: 'L2', inv_id: 'pesto', qty: 40 }, { ref_key: 'line:L2', line: 'L2', inv_id: 'noodle', qty: 120 },
    { ref_key: 'line:L2', line: 'L2', inv_id: 'milk', qty: 200 }, { ref_key: 'line:L2', line: 'L2', inv_id: 'bean', qty: 18 },
  ]);
  assert.deepEqual(I.recipeIdsOf([{ item_id: 'combo', parts: [{ item_id: 'pasta' }] }, { item_id: 'latte' }]).sort(), ['combo', 'latte', 'pasta']);
});

test('作廢回補只限「送單後、出餐前、未結帳」被拿掉的行', () => {
  const before = [
    { line: 'a', placed_at: 't', served_at: null, order_id: null },
    { line: 'b', placed_at: 't', served_at: 't', order_id: null },
    { line: 'c', placed_at: null },
    { line: 'd', placed_at: 't', order_id: 'to_1' },
    { line: 'e', placed_at: 't' },
  ];
  assert.deepEqual(I.restorableRemoved(before, [{ line: 'e' }, { line: 'd' }]).map(l => l.line), ['a']);
});

test('可見範圍、低庫存排序、CSV', () => {
  assert.equal(I.visible({ venue: 'TTH' }, ['CAFE']), true); assert.equal(I.visible({ venue: 'BAR' }, ['CAFE']), false); assert.equal(I.visible({ venue: 'BAR' }, null), true);
  const s = I.sortItems([{ name: 'b', kind: 'prep', qty: 9, safety_qty: 1 }, { name: 'a', kind: 'raw', qty: 1, safety_qty: 2 }, { name: 'z', kind: 'raw', qty: 0, safety_qty: 0, active: false }, { name: 'c', kind: 'raw', qty: 5 }]);
  assert.deepEqual(s.map(x => x.name), ['a', 'c', 'b', 'z']);
  assert.equal(I.isLow({ qty: -1, safety_qty: 0 }), true, '負庫存要提醒'); assert.equal(I.isLow({ qty: 5, safety_qty: 0 }), false);
  const csv = I.movesCsv([{ inv_id: 'm', type: 'sale', delta: -200, qty_after: 800, created_at: new Date('2026-10-19T04:00:00Z'), operator_name: '', actor: '系統', ref_key: 'line:x' }], new Map([['m', { name: '鮮奶', unit: 'ml' }]]));
  assert.equal(csv[1][1], '鮮奶'); assert.equal(csv[1][3], '出餐扣庫存'); assert.equal(csv[1][4], -200);
});

test('接線：送單（mutateItems）、預約取餐排程、櫃檯結帳、線上付款都會扣；送單後作廢會回補', () => {
  assert.match(server, /const posInventory=require\('\.\/lib\/pos-inventory'\)/);
  const mutate = server.slice(server.indexOf('async function mutateItems('), server.indexOf("app.post('/api/orders/:id/items'"));
  assert.match(mutate, /inventoryConsume\(client\.query\.bind\(client\),newlyPlaced/);
  assert.match(mutate, /inventoryRestore\(client\.query\.bind\(client\),posInventory\.restorableRemoved\(s\.items,items\)/);
  assert.ok(mutate.indexOf('inventoryConsume') < mutate.indexOf("'COMMIT'"), '扣庫存與送單同一個交易');
  const pickup = server.slice(server.indexOf('async function placeDuePickups('), server.indexOf('async function placeDuePickups(') + 2500);
  assert.match(pickup, /inventoryConsume\(client\.query\.bind\(client\), placed\.lines/);
  const checkout = server.slice(server.indexOf("app.post('/api/admin/orders/sessions/:id/checkout'"), server.indexOf("app.post('/api/admin/orders/:id/invoice/issue'"));
  assert.match(checkout, /inventoryConsume\(client\.query\.bind\(client\),orderLines\.filter\(l=>!l\.placed_at\)/, '已送單的不重扣');
  assert.ok(checkout.indexOf('inventoryConsume') < checkout.indexOf("await client.query('COMMIT')"));
  // 扣庫存失敗不得擋點餐／收款：SAVEPOINT + 吞錯
  const fn = server.slice(server.indexOf('async function inventoryConsume('), server.indexOf('async function inventoryRestore('));
  assert.match(fn, /SAVEPOINT inv_consume/); assert.match(fn, /ROLLBACK TO SAVEPOINT inv_consume/); assert.match(fn, /return 0;\}/);
  // 去重：唯一索引 + ON CONFLICT
  assert.match(server, /CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_moves_ref_idx ON pos_inventory_moves\(ref_key,inv_id\) WHERE ref_key IS NOT NULL/);
  assert.match(server, /ON CONFLICT \(ref_key,inv_id\) WHERE ref_key IS NOT NULL DO NOTHING/);
});

test('權限：品牌子帳號可用、每筆寫入要識別碼、操作紀錄有中文動作', () => {
  assert.match(server, /FOOD_API = [^\n]*\|inventory\)\(\\\/\|\$\)\//);
  for (const r of ["app.post('/api/admin/inventory/items',", "app.patch('/api/admin/inventory/items/:id',", "app.post('/api/admin/inventory/items/:id/moves',", "app.put('/api/admin/inventory/recipes/:item_id',"]) {
    const body = server.slice(server.indexOf(r), server.indexOf(r) + 300);
    assert.match(body, /auth,adminOnly,requireDb/, r); assert.match(body, /inventoryOperator\(req,res\)/, r);
  }
  const posLog = require('../lib/pos-log.js');
  assert.equal(posLog.describe('POST', '/inventory/items/inv_1/moves'), '庫存異動（進貨／製作／耗用／報廢／盤點）');
  assert.equal(posLog.describe('PUT', '/inventory/recipes/m_1'), '修改菜單配方');
  assert.ok(log.length);
});

test('POS 分頁：/pos/inventory、載入腳本、ensureOperator 認人、文件齊全', () => {
  assert.match(html, /\{ id:'inventory', icon:'box',\s+label:'庫存', group:'settings'/);
  assert.match(html, /inventory:tabInventory/); assert.match(html, /TAB === 'inventory'\) loadInventory\(\)/);
  assert.match(html, /<script src="\/pos-inventory\.js"><\/script>/); assert.match(html, /href="\/pos-inventory\.css"/);
  assert.ok(html.indexOf('/pos-ops.js') < html.indexOf('/pos-inventory.js'), 'pos-inventory.js 依賴 pos-ops.js');
  assert.match(read('public/pos-icons.js'), /\n\s+box:'/);
  assert.match(server, /\/pos\/soldout、\/pos\/inventory/);
  for (const w of ['/admin/inventory/items/', '/admin/inventory/recipes/', '/moves']) assert.ok(ui.includes(w), w);
  assert.equal((ui.match(/ensureOperator\(/g) || []).length >= 4, true, '新增／編輯／停用／異動／配方都要認人');
  assert.match(ui, /製作/); assert.match(ui, /備料/); assert.match(ui, /進貨/); assert.match(ui, /盤點/);
  assert.doesNotMatch(ui, /localStorage/, '識別碼不落地');
  for (const h of ['GET /api/admin/inventory', 'POST /api/admin/inventory/items', 'PATCH /api/admin/inventory/items/:id', 'POST /api/admin/inventory/items/:id/moves', 'GET /api/admin/inventory/moves', 'PUT /api/admin/inventory/recipes/:item_id']) assert.ok(docs.includes('### ' + h), h);
});
