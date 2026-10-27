// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：打賞全流程，跑真的 server.js 路由（vm 切出）＋PGlite
// 關閉時 423 → 開啟設定 → 客人打賞（掛桌上、寫事件）→ 壞金額 400 → 結帳後統計 → 現金支付（無開帳 409／有開帳記錢櫃支出）→ 未付餘額歸零
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); return source.slice(i, source.indexOf(b, i)); };

test('打賞：客人打賞、POS 統計、支付給表演者', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB NOT NULL,amount INT NOT NULL,payer JSONB DEFAULT '{}',status TEXT NOT NULL DEFAULT 'paid',paid_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE pos_registers(id TEXT PRIMARY KEY,venue TEXT,opened_at TIMESTAMPTZ DEFAULT now(),closed_at TIMESTAMPTZ);
      CREATE TABLE pos_cash_moves(id TEXT PRIMARY KEY,register_id TEXT,type TEXT,amount INT,reason TEXT,staff TEXT,created_at TIMESTAMPTZ DEFAULT now());
      INSERT INTO table_sessions(id,table_no) VALUES('ts_00000000000000a1','A1');`);
    const q = (sql, args) => db.query(sql, args);
    const tableOrders = require('./lib/table-orders'), tips = require('./lib/tips');
    // 營業時段固定在三點水（晚上），不受跑測試的時間影響
    const MenuLib = { ...tableOrders.MenuLib, orderWindow: () => ({ venue: 'BAR' }) };
    const app = express(); app.use(express.json());
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders: { ...tableOrders, MenuLib }, tips, SECRET: 'test-secret',
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: null, super: true }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      superOrManagerPin: (r, s, nx) => nx(), assertNotPaused: async () => {},
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      uid: (p = '') => p + Math.random().toString(36).slice(2, 12), actorOf: a => a.email,
      console, Date, JSON, Math, Object, Array, Number, String, Error, Map, Set, Promise });
    vm.runInContext(slice('async function songGuestSession', 'async function songPlayable'), ctx);
    vm.runInContext(slice('/* ---- 打賞（lib/tips.js）', '/* ---- 打賞 end ---- */'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const S1 = 'ts_00000000000000a1', K1 = tableOrders.sessionKey(S1, 'test-secret'), G = 'guest1234';

    let r = await call('GET', `/api/tips?s=${S1}&k=${K1}`);
    assert.equal(r.status, 200); assert.equal(r.body.enabled, false); assert.equal(r.body.sounds.length, 10);
    assert.equal((await call('POST', '/api/tips', { s: S1, k: K1, guest: G, amount: 100, sfx: 'cheer' })).status, 423);

    r = await call('POST', '/api/admin/orders/tips/settings', { enabled: true, performer: '小安', presets: '100,200,500', max: 3000 });
    assert.equal(r.status, 200); assert.equal(r.body.settings.performer, '小安');

    assert.equal((await call('POST', '/api/tips', { s: S1, k: K1, guest: G, amount: 3001, sfx: 'cheer' })).status, 400);
    assert.equal((await call('POST', '/api/tips', { s: S1, k: K1, guest: G, amount: 12.5 })).status, 400);
    assert.equal((await call('POST', '/api/tips', { s: S1, k: '0000000000000000', guest: G, amount: 100 })).status, 403);

    r = await call('POST', '/api/tips', { s: S1, k: K1, guest: G, by: '阿明', amount: 168, sfx: 'kiss' });
    assert.equal(r.status, 201); assert.equal(r.body.amount, 168); assert.equal(r.body.sfx, 'kiss');
    const items = (await q('SELECT items FROM table_sessions WHERE id=$1', [S1])).rows[0].items;
    assert.equal(items.length, 1); assert.equal(items[0].cat, 'TIP'); assert.equal(items[0].zh, '打賞｜小安'); assert.ok(items[0].served_at);

    r = await call('GET', '/api/admin/orders/tips/events');
    assert.deepEqual(r.body.events.map(e => [e.table, e.by, e.amount, e.sfx, e.performer]), [['A1', '阿明', 168, 'kiss', '小安']]);

    r = await call('GET', '/api/admin/orders/tips');
    assert.equal(r.body.pending_unpaid_bills, 168); assert.equal(r.body.total, 0);

    // 櫃檯結帳（模擬）：品項搬進 table_orders
    await q(`INSERT INTO table_orders(id,session_id,table_no,items,amount) VALUES('o1',$1,'A1',$2,168)`, [S1, JSON.stringify(items.map(l => ({ ...l, order_id: 'o1' })))]);
    await q(`UPDATE table_sessions SET items=$2 WHERE id=$1`, [S1, JSON.stringify(items.map(l => ({ ...l, order_id: 'o1' })))]);
    r = await call('GET', '/api/admin/orders/tips');
    assert.equal(r.body.total, 168); assert.equal(r.body.unpaid, 168); assert.equal(r.body.pending_unpaid_bills, 0);
    assert.deepEqual(r.body.by_performer.map(x => [x.performer, x.amount, x.unpaid]), [['小安', 168, 168]]);

    // 現金支付：沒開帳 409；開帳後記錢櫃支出
    assert.equal((await call('POST', '/api/admin/orders/tips/payouts', { performer: '小安', amount: 100, method: 'cash' })).status, 409);
    await q(`INSERT INTO pos_registers(id,venue) VALUES('rg1','BAR')`);
    r = await call('POST', '/api/admin/orders/tips/payouts', { performer: '小安', amount: 100, method: 'cash', note: '萬聖節' });
    assert.equal(r.status, 201); assert.ok(r.body.payout.cash_move);
    const mv = (await q('SELECT type,amount,reason FROM pos_cash_moves')).rows;
    assert.deepEqual(mv.map(m => [m.type, m.amount]), [['out', 100]]); assert.match(mv[0].reason, /支付打賞給 小安/);
    r = await call('POST', '/api/admin/orders/tips/payouts', { performer: '小安', amount: 68, method: 'transfer' });
    assert.equal(r.status, 201); assert.equal(r.body.payout.cash_move, null);

    r = await call('GET', '/api/admin/orders/tips');
    assert.equal(r.body.paid, 168); assert.equal(r.body.unpaid, 0); assert.equal(r.body.payouts.length, 2);

    // 作廢那張單：已收歸零，未付變成 −168（已多付，要追回）
    await q(`UPDATE table_orders SET status='void' WHERE id='o1'`);
    r = await call('GET', '/api/admin/orders/tips');
    assert.equal(r.body.total, 0); assert.equal(r.body.unpaid, -168);

    // 清桌後不能再打賞
    await q(`UPDATE table_sessions SET status='closed' WHERE id=$1`, [S1]);
    assert.equal((await call('POST', '/api/tips', { s: S1, k: K1, guest: G, amount: 100 })).status, 409);
  } finally { if (listener) listener.close(); await db.close(); }
});
