// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：POS 開桌 → 單次 QR → 客人點餐 → 結帳清桌後 QR 失效；桌上舊 QR 停用
// 跑真的 server.js 路由（vm 切出）＋ PGlite，不碰正式站。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); return source.slice(i, source.indexOf(b, i)); };

test('開桌才有 QR；QR 綁場次，清桌即失效；桌上舊 QR 403；大組分桌各一張', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),opened_by_staff_id TEXT,opened_by_staff_name TEXT,pay_requests JSONB NOT NULL DEFAULT '[]');
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB,amount INT,status TEXT,paid_at TIMESTAMPTZ DEFAULT now(),ready_at TIMESTAMPTZ,done_at TIMESTAMPTZ);`);
    const q = (sql, args) => db.query(sql, args);
    let n = 0; const uid = p => p + (++n).toString(16).padStart(16, '0');
    const tableOrders = require('./lib/table-orders');
    const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm_x', venue: 'BAR', cat: 'FOOD', zh: '炸物', price: 200, published: true }, { id: 'm_y', venue: 'CAFE', cat: 'FOOD', zh: '三明治', price: 200, published: true }] });
    const app = express(); app.use(express.json());
    const noop = async () => 0;
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, uid, tableOrders, SECRET: 'test-secret', SITE_BASE: 'https://www.emoji.tw',
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: null }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      resolveOperator: async (req, id) => (id === 's1' ? { id: 's1', name: '店員甲' } : null),
      refundAppRedeems: noop, stockConsume: noop, stockRestore: noop, inventoryConsume: noop, inventoryRestore: noop, posInventory: { restorableRemoved: () => [] }, kitchenPrint: { enqueue: noop },
      tableLive: { createHub: () => ({ subscribe() {}, write() {} }) }, eventChannels: { pushConfig: () => null }, console, Buffer });
    // contentValue 在切片內讀 site_content：換成固定菜單
    vm.runInContext(slice('const ORDER_ID_RE=', '// 結帳需求：').replace(/const contentValue=async key=>[^\n]*\n/, 'const contentValue=async k=>k==="menu"?' + JSON.stringify(menuDoc).replace(/\$/g, '$$$$') + ':"";\n'), ctx);
    vm.runInContext(slice('/* 櫃檯開桌／外帶', 'async function issueEzpayForOrder'), ctx);
    vm.runInContext(slice("// 本桌點餐 QR（單次）", '// /menu 舊頁改版'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
    const ITEM = tableOrders.MenuLib.orderWindow().venue === 'BAR' ? 'm_x' : 'm_y';
    const qsOf = url => { const u = new URL(url); return { s: u.searchParams.get('s'), k: u.searchParams.get('k') }; };

    // 桌上舊固定 QR：停用
    const oldK = tableOrders.tableKey('A1', 'test-secret');
    let r = await call('GET', `/api/orders/table?t=A1&k=${oldK}`);
    assert.equal(r.status, 403); assert.match(r.body.error, /已停用/);
    // 客人自己開桌的舊路由不存在
    r = await call('POST', '/api/orders/table/items', { t: 'A1', k: oldK, item_id: 'm_x' });
    assert.ok(r.status === 404 || r.status === 400 || r.status === 500, '客人不能自己開桌，status=' + r.status);
    assert.equal((await q("SELECT count(*)::int n FROM table_sessions")).rows[0].n, 0, '沒有任何場被客人開出來');
    // 還沒開桌不能補印 QR
    r = await call('GET', '/api/admin/tables/qr?tables=A1');
    assert.equal(r.status, 409);

    // 外場開桌：需認人；開好回 qr_url
    assert.equal((await call('POST', '/api/admin/orders/sessions', { table_no: 'A1' })).status, 400);
    r = await call('POST', '/api/admin/orders/sessions', { table_no: 'A1', operator_id: 's1' });
    assert.equal(r.status, 201); assert.match(r.body.qr_url, /^https:\/\/www\.emoji\.tw\/order\?s=ts_[0-9a-f]{16}&k=/);
    const a1 = qsOf(r.body.qr_url);
    // 大組分桌：再開 A2、A3，各一張不同 QR
    const a2url = (await call('POST', '/api/admin/orders/sessions', { table_no: 'A2', operator_id: 's1' })).body.qr_url;
    const a3url = (await call('POST', '/api/admin/orders/sessions', { table_no: 'A3', operator_id: 's1' })).body.qr_url;
    assert.equal(new Set([r.body.qr_url, a2url, a3url]).size, 3);
    // 外帶不給 QR
    assert.equal((await call('POST', '/api/admin/orders/sessions', { takeout: true, operator_id: 's1' })).body.qr_url, undefined);
    // 補印回同一張
    r = await call('GET', '/api/admin/tables/qr?tables=A1,A2');
    assert.equal(r.status, 200); assert.equal(r.body.tables[0].url, `https://www.emoji.tw/order?s=${a1.s}&k=${a1.k}`); assert.equal(r.body.tables[1].url, a2url);

    // 客人掃 QR：看到這一場；簽章竄改 403；拿 A1 的 k 配 A2 的 s 也 403
    r = await call('GET', `/api/orders/table?s=${a1.s}&k=${a1.k}&g=guest00001`);
    assert.equal(r.status, 200); assert.equal(r.body.table, 'A1'); assert.equal(r.body.id, a1.s); assert.equal(r.body.status, 'open');
    assert.equal((await call('GET', `/api/orders/table?s=${a1.s}&k=${'x'.repeat(16)}`)).status, 403);
    assert.equal((await call('GET', `/api/orders/table?s=${qsOf(a2url).s}&k=${a1.k}`)).status, 403);

    // 點餐：直接加到這一場
    r = await call('POST', `/api/orders/${a1.s}/items`, { item_id: ITEM, qty: 1, by: '小明', guest: 'guest00001' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.items.length, 1);

    // 結帳清桌後：同一張 QR 回 closed、加點 409；同桌重新開桌是新的一場、新 QR，舊 QR 不會併進新客人
    await q("UPDATE table_sessions SET status='closed' WHERE id=$1", [a1.s]);
    r = await call('GET', `/api/orders/table?s=${a1.s}&k=${a1.k}`);
    assert.equal(r.status, 200); assert.equal(r.body.status, 'closed');
    r = await call('POST', `/api/orders/${a1.s}/items`, { item_id: ITEM, qty: 1, by: '惡意', guest: 'guest00009' });
    assert.equal(r.status, 409); assert.match(r.body.error, /已結束/);
    r = await call('POST', '/api/admin/orders/sessions', { table_no: 'A1', operator_id: 's1' });
    assert.equal(r.status, 201); assert.notEqual(qsOf(r.body.qr_url).s, a1.s);
    r = await call('GET', `/api/orders/table?s=${a1.s}&k=${a1.k}`);
    assert.equal(r.body.status, 'closed', '舊 QR 仍指向舊場，不會看到新客人的帳');
  } finally { listener?.close(); await db.close(); }
});
