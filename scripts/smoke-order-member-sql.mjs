// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：桌邊點餐整合會員
// 客人在 /order 登入 → POST /api/orders/table/member 掛到這一場 → POS /api/admin/yan/lookup {member_id,session_id} 帶入
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
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); return source.slice(i, source.indexOf(b, i)); };

test('桌邊登入會員掛到場次；POS 只能帶入這桌名單內的會員；結束的場次 409', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,phone TEXT,phone_e164 TEXT);
      INSERT INTO users VALUES('u_a','小明',NULL,NULL,'+886912000001'),('u_b','小華',NULL,NULL,NULL),('u_c','路人',NULL,NULL,NULL);
      CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',members JSONB NOT NULL DEFAULT '[]');
      INSERT INTO table_sessions(id,table_no) VALUES('ts_00000000000000a1','A1'),('ts_00000000000000b2','B2');
      INSERT INTO table_sessions(id,table_no,status) VALUES('ts_00000000000000c3','C3','closed');`);
    const q = (sql, args) => db.query(sql, args);
    const tableOrders = require('./lib/table-orders');
    const app = express(); app.use(express.json());
    let who = 'u_a';
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders, SECRET: 'test-secret',
      auth: (req, res, next) => { req.auth = req.path.startsWith('/api/admin') ? { role: 'admin', brands: null } : { role: 'invited', sub: who }; next(); },
      adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      yanRowsFor: async () => [], yan: { balance: () => 42 }, memberAccessFor: async id => ({ active: id === 'u_a' }),
      verifyAccessToken: () => null, process, findOrCreateMemberByPhone: async () => { throw Error('不該走手機'); }, console });
    vm.runInContext(slice('/* 桌邊點餐整合會員', "app.get('/api/me/yan'"), ctx);
    vm.runInContext(slice("app.post('/api/admin/yan/lookup'", '/* POS 合併會員'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
    const qr = id => ({ s: id, k: tableOrders.sessionKey(id, 'test-secret') });

    // 簽章錯 403；已結束的場 409
    assert.equal((await call('/api/orders/table/member', { s: 'ts_00000000000000a1', k: 'x'.repeat(16) })).status, 403);
    assert.equal((await call('/api/orders/table/member', qr('ts_00000000000000c3'))).status, 409);

    // 小明、小華登入 A1；小明重登不重複
    let r = await call('/api/orders/table/member', qr('ts_00000000000000a1'));
    assert.equal(r.status, 200); assert.equal(r.body.table, 'A1'); assert.equal(r.body.balance, 42); assert.equal(r.body.active, true);
    await call('/api/orders/table/member', qr('ts_00000000000000a1'));
    who = 'u_b'; await call('/api/orders/table/member', qr('ts_00000000000000a1'));
    const ms = (await q("SELECT members FROM table_sessions WHERE id='ts_00000000000000a1'")).rows[0].members;
    assert.deepEqual(ms.map(m => m.id), ['u_a', 'u_b']);
    assert.equal(ms[0].name, '小明');

    // POS 帶入：名單內 OK（視同驗證、回會籍）；別桌、名單外、已結束都 404
    r = await call('/api/admin/yan/lookup', { member_id: 'u_a', session_id: 'ts_00000000000000a1' });
    assert.equal(r.status, 200); assert.equal(r.body.member.name, '小明'); assert.equal(r.body.active, true); assert.equal(r.body.verified, true);
    assert.equal((await call('/api/admin/yan/lookup', { member_id: 'u_c', session_id: 'ts_00000000000000a1' })).status, 404);
    assert.equal((await call('/api/admin/yan/lookup', { member_id: 'u_a', session_id: 'ts_00000000000000b2' })).status, 404);
    await q("UPDATE table_sessions SET status='closed' WHERE id='ts_00000000000000a1'");
    assert.equal((await call('/api/admin/yan/lookup', { member_id: 'u_a', session_id: 'ts_00000000000000a1' })).status, 404);
  } finally { listener?.close(); await db.close(); }
});

test('joinMember：正規化、去重、上限 12', async () => {
  const { joinMember } = require('./lib/table-orders');
  assert.deepEqual(joinMember(null), []);
  assert.deepEqual(joinMember([{ id: '' }, null, { id: 'a', name: 'x' }]).map(m => m.id), ['a']);
  let l = [];
  for (let i = 0; i < 15; i++) l = joinMember(l, { id: 'u' + i, name: 'n' });
  assert.equal(l.length, 12); assert.equal(l[11].id, 'u14');
  l = joinMember(l, { id: 'u5', name: 'again' });
  assert.equal(l.filter(m => m.id === 'u5').length, 1); assert.equal(l.at(-1).name, 'again');
});
