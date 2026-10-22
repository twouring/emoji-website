// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：合作夥伴與徽章，跑真的 server.js 路由（vm 切出）＋PGlite
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

test('合作夥伴：後台 CRUD、主辦標註權限、徽章累積、刪除自動取消標註', async () => {
  const db = new PGlite(); let listener;
  try {
    const ddl = source.match(/CREATE TABLE IF NOT EXISTS partners \([\s\S]*?\)`/)[0].slice(0, -1);
    const alter = source.match(/ALTER TABLE events ADD COLUMN IF NOT EXISTS partner_id[^`]*/)[0];
    await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT);
      CREATE TABLE events(id TEXT PRIMARY KEY,owner_id TEXT,status TEXT);
      CREATE TABLE event_regs(id TEXT PRIMARY KEY,event_id TEXT,user_id TEXT,status TEXT,checked_in_at TIMESTAMPTZ);
      CREATE TABLE event_attendees(id TEXT PRIMARY KEY,registration_id TEXT,checked_in_at TIMESTAMPTZ);
      CREATE TABLE event_activity(event_id TEXT,action TEXT);
      ${ddl}; ${alter};
      INSERT INTO users VALUES('u_host','主辦','host@dna.org.tw'),('u_out','外人','x@gmail.com'),('u_m','會員','m@gmail.com');
      INSERT INTO events VALUES('e1','u_host','已結束'),('e2','u_host','報名中'),('e3','u_out','報名中');
      INSERT INTO event_regs VALUES('r1','e1','u_m','registered',NULL),('r2','e2','u_m','registered',now()),('r3','e3','u_m','registered',now());`);
    const q = (sql, args) => db.query(sql, args);
    const partnersLib = require('./lib/partners');
    const app = express(); app.use(express.json());
    let AUTH = {};
    const ctx = vm.createContext({ app, require, q, partnersLib, snapshotCache: { at: 1 },
      auth: (r, s, nx) => { r.auth = AUTH; nx(); }, adminOnly: (r, s, nx) => AUTH.role === 'admin' ? nx() : s.status(403).json({}),
      requireDb: (r, s, nx) => nx(), eventEditor: (r, s, nx) => nx(), eventAdmin: ({ auth }) => auth.role === 'admin',
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      uid: (p = '') => p + Math.random().toString(36).slice(2, 12), console, Date, JSON, Math, Object, Array, Number, String, Error, Promise, Map });
    vm.runInContext(slice('/* ---- 合作夥伴與徽章 ---- */', "app.get('/api/organizer/state'"), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

    AUTH = { role: 'admin', sub: null };
    assert.equal((await call('POST', '/api/admin/partners', { name: '' })).status, 400);
    let r = await call('POST', '/api/admin/partners', { name: '台灣數位遊牧者協會', emails: 'dna.org.tw', url: 'https://dna.org.tw', sort: 1 });
    assert.equal(r.status, 200); const pid = r.body.id;
    r = await call('POST', '/api/admin/partners', { name: '隱藏夥伴', visible: false });
    const hid = r.body.id;
    r = await call('GET', '/api/partners');
    assert.deepEqual(r.body.partners.map(p => p.name), ['台灣數位遊牧者協會'], '公開只列 visible');
    assert.equal(r.body.partners[0].emails, undefined, '公開不外露信箱');
    r = await call('GET', '/api/admin/partners');
    assert.deepEqual(r.body.partners.find(p => p.id === pid).emails, ['@dna.org.tw']);

    // 主辦人：信箱屬於 @dna.org.tw 才能標註
    AUTH = { role: 'organizer', sub: 'u_host', email: 'host@dna.org.tw' };
    assert.equal((await call('POST', '/api/admin/events/e1/partner', { partner_id: pid })).status, 200);
    assert.equal((await call('POST', '/api/admin/events/e2/partner', { partner_id: pid })).status, 200);
    assert.equal((await call('POST', '/api/admin/events/e1/partner', { partner_id: hid })).status, 403);
    AUTH = { role: 'organizer', sub: 'u_out', email: 'x@gmail.com' };
    assert.equal((await call('POST', '/api/admin/events/e3/partner', { partner_id: pid })).status, 403);
    assert.equal((await call('POST', '/api/admin/events/nope/partner', { partner_id: pid })).status, 404);

    // 徽章：e1 已結束＋e2 已簽到＝2 場，Lv.1；e3 未標註不算
    AUTH = { role: 'member', sub: 'u_m', email: 'm@gmail.com' };
    r = await call('GET', '/api/me/badges');
    assert.equal(r.status, 200); assert.equal(r.body.badges.length, 1);
    assert.equal(r.body.badges[0].count, 2); assert.equal(r.body.badges[0].level, 1); assert.equal(r.body.badges[0].to_next, 1);
    AUTH = { role: 'admin', sub: null };
    assert.equal((await call('POST', '/api/admin/events/e3/partner', { partner_id: pid })).status, 200, '管理員可標註任何活動');
    AUTH = { role: 'member', sub: 'u_m' };
    r = await call('GET', '/api/me/badges'); assert.equal(r.body.badges[0].level, 2, '3 場升 Lv.2');
    AUTH = { role: 'admin', sub: null };
    assert.equal((await call('GET', '/api/admin/partners')).body.partners.find(p => p.id === pid).event_count, 3);

    // 刪除：活動自動取消標註，徽章消失
    assert.equal((await call('DELETE', '/api/admin/partners/' + pid)).status, 200);
    assert.equal((await q(`SELECT count(*)::int n FROM events WHERE partner_id IS NOT NULL`)).rows[0].n, 0);
    AUTH = { role: 'member', sub: 'u_m' };
    assert.equal((await call('GET', '/api/me/badges')).body.badges.length, 0);
    assert.equal(ctx.snapshotCache.at, 0, '異動會清公開快取');
  } finally { listener?.close(); await db.close(); }
});
