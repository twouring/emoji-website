// Local-only SQL acceptance for POS 庫存（not in CI: needs PGLITE_MODULE_PATH）. Runs the real server.js schema + helpers + routes on PGlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));

test('庫存：真 SQL 跑進貨→製作備料→出餐自動扣（去重）→作廢回補→盤點；扣庫存出錯不擋交易', async () => {
  const db = new PGlite(); let listener;
  try {
    const schema = slice('// POS 庫存：原物料＋備料', '// POS 交班結算').replace(/await q\(/g, 'await db.query(');
    await new Function('db', `return (async()=>{${schema}})()`)(db);
    await new Function('db', `return (async()=>{${schema}})()`)(db); // bootstrap 可重跑
    let n = 0; const uid = p => p + (++n).toString(36).padStart(6, '0');
    const q = (sql, args) => db.query(sql, args);
    const menuDoc = JSON.stringify({ version: 1, items: [
      { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true },
      { id: 'm_pasta', venue: 'CAFE', cat: 'FOOD', zh: '青醬義大利麵', price: 280, published: true },
      { id: 'm_bar', venue: 'BAR', cat: 'SAKE', zh: '清酒', price: 300, published: true },
    ] });
    const staff = { s1: { id: 's1', name: '店員甲' } };
    const tableOrders = require('./lib/table-orders');
    const app = express(); app.use(express.json());
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, uid, posInventory: require('./lib/pos-inventory'), tableOrders,
      auth: (req, res, next) => { const b = req.headers['x-brand']; req.auth = { role: 'admin', email: 'pos@test', brands: b ? [b] : null }; next(); }, adminOnly: (r, s, n) => n(), requireDb: (r, s, n) => n(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })), actorOf: a => a.email, contentValue: async () => menuDoc,
      resolveOperator: async (req, id) => staff[id] || null, console });
    vm.runInContext(slice('/* ===== POS 庫存（lib/pos-inventory.js）', 'function tableLayoutParse(v){'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const call = async (method, path, body, brand) => { const r = await fetch(`http://127.0.0.1:${listener.address().port}/api/admin${path}`, { method, headers: { 'content-type': 'application/json', ...(brand ? { 'x-brand': brand } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
    const op = { operator_id: 's1' };
    const tx = async fn => { await q('BEGIN'); try { const v = await fn(); await q('COMMIT'); return v; } catch (e) { await q('ROLLBACK'); throw e; } };

    // 沒認人 400
    assert.equal((await call('POST', '/inventory/items', { name: '鮮奶', unit: 'ml' })).status, 400);
    const milk = (await call('POST', '/inventory/items', { name: '鮮奶', unit: 'ml', safety_qty: 2000, ...op })).body.item;
    const basil = (await call('POST', '/inventory/items', { name: '九層塔', unit: 'g', venue: 'CAFE', ...op })).body.item;
    const oil = (await call('POST', '/inventory/items', { name: '橄欖油', unit: 'ml', ...op })).body.item;
    const noodle = (await call('POST', '/inventory/items', { name: '義大利麵', unit: 'g', ...op })).body.item;
    assert.equal((await call('POST', '/inventory/items', { name: '鮮奶', unit: 'ml', ...op })).status, 409, '同名');
    assert.equal((await call('POST', '/inventory/items', { name: '冰塊', unit: 'g', venue: 'BAR', ...op }, 'CAFE')).status, 403, '子帳號不能建別店');
    const pesto = (await call('POST', '/inventory/items', { name: '青醬', kind: 'prep', unit: 'g', batch_yield: 500, venue: 'CAFE', bom: [{ inv_id: basil.id, qty: 200 }, { inv_id: oil.id, qty: 150 }], ...op })).body.item;
    assert.equal(pesto.batch_yield, 500); assert.equal(pesto.bom.length, 2);

    // 進貨：加權平均
    await call('POST', `/inventory/items/${milk.id}/moves`, { type: 'in', qty: 1000, amount: 100, ...op });
    let r = await call('POST', `/inventory/items/${milk.id}/moves`, { type: 'in', qty: 1000, amount: 140, ...op });
    assert.equal(r.body.qty, 2000);
    await call('POST', `/inventory/items/${basil.id}/moves`, { type: 'in', qty: 1000, amount: 500, ...op });
    await call('POST', `/inventory/items/${oil.id}/moves`, { type: 'in', qty: 1000, amount: 400, ...op });
    await call('POST', `/inventory/items/${noodle.id}/moves`, { type: 'in', qty: 5000, ...op });
    let inv = (await call('GET', '/inventory')).body;
    assert.equal(inv.items.find(i => i.id === milk.id).avg_cost, 0.12);
    // 製作備料半批 250g：九層塔 -100、橄欖油 -75；成本 (100*0.5+75*0.4)/250=0.32
    r = await call('POST', `/inventory/items/${pesto.id}/moves`, { type: 'make', qty: 250, ...op });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.qty, 250);
    assert.deepEqual(r.body.used.map(u => [u.name, u.qty, u.qty_after]), [['九層塔', 100, 900], ['橄欖油', 75, 925]]);
    inv = (await call('GET', '/inventory')).body; assert.equal(inv.items.find(i => i.id === pesto.id).avg_cost, 0.32);
    assert.equal((await call('POST', `/inventory/items/${milk.id}/moves`, { type: 'make', qty: 1, ...op })).status, 400);
    // 菜單配方
    assert.equal((await call('PUT', '/inventory/recipes/m_latte', { lines: [{ inv_id: milk.id, qty: 200 }], ...op })).status, 200);
    assert.equal((await call('PUT', '/inventory/recipes/m_pasta', { lines: [{ inv_id: pesto.id, qty: 40 }, { inv_id: noodle.id, qty: 120 }], ...op })).status, 200);
    assert.equal((await call('PUT', '/inventory/recipes/m_bar', { lines: [{ inv_id: milk.id, qty: 1 }], ...op }, 'CAFE')).status, 404, '子帳號不能設別店菜單');
    assert.equal((await call('PUT', '/inventory/recipes/m_nope', { lines: [], ...op })).status, 404);

    // 出餐自動扣：送單 2 杯拿鐵 + 1 份青醬麵；同一行再送一次（重送／兩台平板）不重扣
    const lines = [{ line: 'L1', item_id: 'm_latte', zh: '拿鐵', qty: 2, placed_at: 't' }, { line: 'L2', item_id: 'm_pasta', zh: '青醬義大利麵', qty: 1, placed_at: 't' }];
    assert.equal(await tx(() => ctx.inventoryConsume(q, lines, { ref_id: 'ts_1' })), 3);
    assert.equal(await tx(() => ctx.inventoryConsume(q, lines, { ref_id: 'ts_1' })), 0, '同一行只扣一次');
    inv = (await call('GET', '/inventory')).body; const qty = id => inv.items.find(i => i.id === id).qty;
    assert.equal(qty(milk.id), 1600); assert.equal(qty(pesto.id), 210); assert.equal(qty(noodle.id), 4880);
    assert.equal(inv.low, 1, '鮮奶 1600 ≤ 安全量 2000');
    // 送單後、出餐前作廢 L2 → 回補；再作廢一次不重複補
    assert.equal(await tx(() => ctx.inventoryRestore(q, [lines[1]], { actor: 'pos' })), 2);
    assert.equal(await tx(() => ctx.inventoryRestore(q, [lines[1]], { actor: 'pos' })), 0);
    inv = (await call('GET', '/inventory')).body; assert.equal(inv.items.find(i => i.id === pesto.id).qty, 250);
    // 盤點：實點 1580 → 盤差 -20
    r = await call('POST', `/inventory/items/${milk.id}/moves`, { type: 'count', counted: 1580, ...op });
    assert.equal(r.body.delta, -20); assert.equal(r.body.qty, 1580);
    assert.equal((await call('POST', `/inventory/items/${milk.id}/moves`, { type: 'waste', qty: 10, ...op })).status, 400, '報廢要原因');
    // 庫存可負：先賣後補
    await tx(() => ctx.inventoryConsume(q, [{ line: 'L9', item_id: 'm_latte', zh: '拿鐵', qty: 10 }]));
    inv = (await call('GET', '/inventory')).body; assert.equal(inv.items.find(i => i.id === milk.id).qty, -420);
    // 紀錄：結存、經手人、CSV
    const mv = (await call('GET', `/inventory/moves?inv_id=${milk.id}`)).body;
    assert.deepEqual(mv.moves.map(m => m.type), ['sale', 'count', 'sale', 'in', 'in']);
    assert.equal(mv.moves[1].operator_name, '店員甲'); assert.equal(mv.moves[0].qty_after, -420);
    assert.equal(mv.csv[0][0], '時間'); assert.equal(mv.csv.length, 6);
    // 子帳號 CAFE 看不到 BAR 專屬品項；BAR 看不到 CAFE 的九層塔與青醬
    await call('POST', '/inventory/items', { name: '冰塊', unit: 'g', venue: 'BAR', ...op });
    const cafe = (await call('GET', '/inventory', null, 'CAFE')).body.items.map(i => i.name), bar = (await call('GET', '/inventory', null, 'BAR')).body.items.map(i => i.name);
    assert.ok(!cafe.includes('冰塊') && cafe.includes('青醬')); assert.ok(bar.includes('冰塊') && !bar.includes('青醬') && bar.includes('鮮奶'));
    // 扣庫存出錯（交易中）只回 0，外層交易繼續可用
    await q('BEGIN');
    await q("CREATE TEMP TABLE outer_work(x int)"); await q('INSERT INTO outer_work VALUES (1)');
    const saved = ctx.posInventory.consumptionFor; ctx.posInventory.consumptionFor = () => { throw Error('boom'); };
    assert.equal(await ctx.inventoryConsume(q, lines), 0);
    ctx.posInventory.consumptionFor = saved;
    await q('INSERT INTO outer_work VALUES (2)'); await q('COMMIT');
    assert.equal((await q('SELECT count(*)::int AS n FROM outer_work')).rows[0].n, 2, '點餐／收款交易不受影響');
    // 停用
    r = await call('PATCH', `/inventory/items/${oil.id}`, { active: false, ...op }); assert.equal(r.body.item.active, false);
    assert.equal((await call('POST', `/inventory/items/${oil.id}/moves`, { type: 'in', qty: 1, ...op })).status, 409, '停用品項不能異動');
  } finally { listener?.close(); await db.close(); }
});
