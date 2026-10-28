// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：意見回饋，跑真的 server.js 路由（vm 切出）＋PGlite
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

test('意見回饋：客人送出、上限、POS 依日期／平均查看', async () => {
  const db = new PGlite(); let listener;
  try {
    const ddl = source.match(/CREATE TABLE IF NOT EXISTS order_feedback \([\s\S]*?\)`/)[0].slice(0, -1);
    await db.exec(`CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open');
      INSERT INTO table_sessions(id,table_no,status) VALUES('ts_00000000000000a1','A1','open'),('ts_00000000000000a2','A2','closed');
      ${ddl};`);
    const q = (sql, args) => db.query(sql, args);
    const tableOrders = require('./lib/table-orders'), orderFeedback = require('./lib/order-feedback');
    const app = express(); app.use(express.json());
    const ctx = vm.createContext({ app, require, q, tableOrders, orderFeedback, SECRET: 'test-secret',
      auth: (r, s, nx) => nx(), adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      uid: (p = '') => p + Math.random().toString(36).slice(2, 12), console, Date, JSON, Math, Object, Array, Number, String, Error, Promise });
    vm.runInContext(slice('async function songGuestSession', 'async function songPlayable'), ctx);
    vm.runInContext(slice('/* ---- 意見回饋（lib/order-feedback.js）', '/* ---- 意見回饋 end ---- */'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const S1 = 'ts_00000000000000a1', K1 = tableOrders.sessionKey(S1, 'test-secret');
    const S2 = 'ts_00000000000000a2', K2 = tableOrders.sessionKey(S2, 'test-secret');

    assert.equal((await call('POST', '/api/order-feedback', { s: S1, k: '0000000000000000', kind: 'food', text: '好吃' })).status, 403);
    assert.equal((await call('POST', '/api/order-feedback', { s: S2, k: K2, kind: 'food', text: '好吃' })).status, 409);
    assert.equal((await call('POST', '/api/order-feedback', { s: S1, k: K1, kind: 'nope', text: '好吃' })).status, 400);
    let r = await call('POST', '/api/order-feedback', { s: S1, k: K1, kind: 'app', text: '按鈕字太小', rating: 3, name: '小明', lang: 'zh' });
    assert.equal(r.status, 201); assert.match(r.body.id, /^fb_/);
    for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/order-feedback', { s: S1, k: K1, kind: 'food', text: 'great ' + i, rating: 5, lang: 'en' })).status, 201);
    assert.equal((await call('POST', '/api/order-feedback', { s: S1, k: K1, kind: 'food', text: '第六筆' })).status, 429);

    r = await call('GET', '/api/admin/orders/feedback');
    assert.equal(r.status, 200); assert.equal(r.body.count, 5); assert.equal(r.body.avg_rating, 4.6);
    const app1 = r.body.feedback.find(x => x.kind === 'app');
    assert.deepEqual([app1.table_no, app1.text, app1.rating, app1.name], ['A1', '按鈕字太小', 3, '小明']);
    assert.ok(r.body.kinds.food.zh);
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    assert.equal((await call('GET', `/api/admin/orders/feedback?from=${today}&to=${today}`)).body.count, 5);
    assert.equal((await call('GET', '/api/admin/orders/feedback?from=2020-01-01&to=2020-01-02')).body.count, 0);
  } finally { if (listener) await new Promise(r => listener.close(r)); await db.close(); }
});
