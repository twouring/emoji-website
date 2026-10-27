// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：呼叫服務全流程，跑真的 server.js 路由（vm 切出）＋PGlite
// 客人呼叫 → 冷卻 429 → POS 看到 → 處理 → 客人看到已處理；清桌後未處理的自動結案；QR 無效 403、已結束 409
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

test('呼叫服務：客人呼叫、POS 處理、清桌自動結案', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ DEFAULT now());
      INSERT INTO table_sessions(id,table_no) VALUES('ts_00000000000000a1','A1'),('ts_00000000000000a2','A2');`);
    const q = (sql, args) => db.query(sql, args);
    const tableOrders = require('./lib/table-orders'), serviceCalls = require('./lib/service-calls');
    const app = express(); app.use(express.json());
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders, serviceCalls, SECRET: 'test-secret',
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: null }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      uid: (p = '') => p + Math.random().toString(36).slice(2, 12), actorOf: a => a.email,
      console, Date, JSON, Math, Object, Array, Number, String, Error, Map, Set, Promise });
    // songGuestSession 在點歌區塊；只取這個函式
    vm.runInContext(slice('async function songGuestSession', 'async function songPlayable'), ctx);
    vm.runInContext(slice('/* ---- 呼叫服務（lib/service-calls.js）', '/* ---- 呼叫服務 end ---- */'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const S1 = 'ts_00000000000000a1', K1 = tableOrders.sessionKey(S1, 'test-secret');
    const S2 = 'ts_00000000000000a2', K2 = tableOrders.sessionKey(S2, 'test-secret');

    let r = await call('GET', `/api/service-calls?s=${S1}&k=${K1}`);
    assert.equal(r.status, 200); assert.equal(r.body.kinds.length, 5); assert.deepEqual(r.body.open, []);
    assert.equal((await call('GET', `/api/service-calls?s=${S1}&k=0000000000000000`)).status, 403);
    assert.equal((await call('POST', '/api/service-calls', { s: S1, k: K1, kind: 'bogus' })).status, 400);

    r = await call('POST', '/api/service-calls', { s: S1, k: K1, kind: 'water', name: '小明' });
    assert.equal(r.status, 201); const id1 = r.body.call.id;
    r = await call('POST', '/api/service-calls', { s: S1, k: K1, kind: 'pack' });
    assert.equal(r.status, 429); assert.ok(r.body.wait > 0 && r.body.wait <= 60);
    r = await call('POST', '/api/service-calls', { s: S2, k: K2, kind: 'other', note: '兒童椅' });
    assert.equal(r.status, 201);

    r = await call('GET', '/api/admin/orders/service-calls');
    assert.deepEqual(r.body.pending.map(c => [c.table, c.kind, c.note, c.by]), [['A1', 'water', '', '小明'], ['A2', 'other', '兒童椅', '']]);

    r = await call('POST', `/api/admin/orders/service-calls/${id1}/done`, {});
    assert.equal(r.status, 200); assert.equal(r.body.call.done_by, 'pos@test');
    assert.equal((await call('POST', `/api/admin/orders/service-calls/${id1}/done`, {})).status, 200);   // 兩台同時按
    assert.equal((await call('POST', '/api/admin/orders/service-calls/nope/done', {})).status, 404);
    r = await call('GET', `/api/service-calls?s=${S1}&k=${K1}`);
    assert.equal(r.body.open.length, 0); assert.equal(r.body.recent_done.length, 1);

    // A2 清桌：POS 下一輪讀取時自動結案；客人再呼叫 409
    await q(`UPDATE table_sessions SET status='closed' WHERE id=$1`, [S2]);
    r = await call('GET', '/api/admin/orders/service-calls');
    assert.equal(r.body.pending.length, 0);
    const stored = JSON.parse((await q(`SELECT value FROM site_content WHERE key='service_calls'`)).rows[0].value);
    assert.equal(stored.calls.find(c => c.session_id === S2).done_by, '清桌');
    assert.equal((await call('POST', '/api/service-calls', { s: S2, k: K2, kind: 'water' })).status, 409);
  } finally { listener?.close(); await db.close(); }
});
