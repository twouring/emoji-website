// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：大家來找碴，跑真的 server.js 路由（vm 切出）＋PGlite
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const multer = require('multer');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); return source.slice(i, source.indexOf(b, i)); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('大家來找碴：會員送出（含照片）、驗證、後台審核與排行', async () => {
  const db = new PGlite(); let listener; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-'));
  try {
    const ddl = source.match(/CREATE TABLE IF NOT EXISTS bug_reports \([\s\S]*?\)`/)[0].slice(0, -1);
    const yanDdl = source.match(/CREATE TABLE IF NOT EXISTS yan_ledger \([\s\S]*?\)`/)[0].slice(0, -1);
    await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT); INSERT INTO users VALUES('u1','小言'),('u2','阿字'); ${ddl}; ${yanDdl};
      ALTER TABLE yan_ledger ADD COLUMN reason TEXT NOT NULL DEFAULT '', ADD COLUMN operator_id TEXT, ADD COLUMN operator_name TEXT NOT NULL DEFAULT '', ADD COLUMN actor TEXT NOT NULL DEFAULT '';
      ALTER TABLE yan_ledger DROP CONSTRAINT IF EXISTS yan_ledger_kind_check; CREATE UNIQUE INDEX yan_ledger_kind_ref_uidx ON yan_ledger(kind, ref_id);`);
    const q = (sql, args) => db.query(sql, args);
    const pool = { connect: async () => ({ query: (sql, args) => db.query(sql, args), release() {} }) };
    const yan = require('./lib/yan');
    let who = 'u1';
    const app = express(); app.use(express.json());
    const uploaded = [];
    const ctx = vm.createContext({ app, require, q, pool, yan, multer, path, fs, crypto, __dirname: dir, bugReports: require('./lib/bug-reports'),
      sniffImageType: require('./lib/social-upload').sniffImageType,
      igPublisher: { uploadAsset: async (buf, name) => { uploaded.push(name); return '/ig-media/assets/' + name; } },
      auth: (r, s, nx) => { r.auth = r.headers['x-admin'] ? { role: 'admin', email: 'staff@emoji.tw' } : { sub: who }; nx(); },
      adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      actorOf: a => a.email || a.sub,
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      uid: (p = '') => p + Math.random().toString(36).slice(2, 14), console, Date, JSON, Math, Object, Array, Number, String, Error, Promise, Buffer });
    vm.runInContext(slice('async function yanRowsFor(', 'async function findOrCreateMemberByPhone('), ctx);
    vm.runInContext(slice('/* ---- 大家來找碴（lib/bug-reports.js）', '/* ---- 大家來找碴 end ---- */'), ctx);
    app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const send = async (fields, files = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); files.forEach((b, i) => fd.append('photos', new Blob([b]), 'p' + i + '.png')); const r = await fetch(base + '/api/me/bug-reports', { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
    const call = async (m, p, body, admin) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };

    let r = await send({ kind: 'ux', location: '2F 淋浴間' });
    assert.equal(r.status, 400); assert.match(r.body.error, /拍照或寫/);
    r = await send({ kind: 'ux', location: '2F 淋浴間' }, [Buffer.from('not an image at all')]);
    assert.equal(r.status, 400); assert.match(r.body.error, /JPEG/);
    r = await send({ kind: 'ux', location: '2F 淋浴間', text: '門關不緊' }, [PNG, PNG]);
    assert.equal(r.status, 201); assert.equal(r.body.photos.length, 2); assert.equal(uploaded.length, 2);
    const id1 = r.body.id;
    r = await send({ kind: 'better', location: '3F 茶水間', text: '水槽太低' });
    assert.equal(r.status, 201); const id2 = r.body.id;
    who = 'u2';
    r = await send({ kind: 'unfinished', location: '1F 廁所', text: '缺標示' }); const id3 = r.body.id;

    who = 'u1';
    r = await call('GET', '/api/me/bug-reports');
    assert.equal(r.body.reports.length, 2); assert.equal(r.body.points, 0); assert.equal(r.body.pending, 2);
    assert.deepEqual(r.body.reports.find(x => x.id === id1).photos.length, 2);

    assert.equal((await call('POST', `/api/admin/bug-reports/${id1}/review`, { status: 'nope' }, true)).status, 400);
    assert.equal((await call('POST', `/api/admin/bug-reports/bug_missing/review`, { status: 'accepted' }, true)).status, 404);
    r = await call('POST', `/api/admin/bug-reports/${id1}/review`, { status: 'accepted', note: '已叫師傅' }, true);
    assert.equal(r.body.user_points, 1); assert.equal(r.body.report.reviewed_by, 'staff@emoji.tw');
    await call('POST', `/api/admin/bug-reports/${id2}/review`, { status: 'accepted' }, true);
    await call('POST', `/api/admin/bug-reports/${id3}/review`, { status: 'duplicate' }, true);

    r = await call('GET', '/api/admin/bug-reports', null, true);
    assert.equal(r.body.count, 3); assert.equal(r.body.counts.accepted, 2); assert.equal(r.body.counts.duplicate, 1);
    assert.deepEqual(r.body.leaderboard.map(x => [x.name, x.points]), [['小言', 2]]);
    r = await call('GET', '/api/me/bug-reports');
    assert.equal(r.body.points, 2); assert.equal(r.body.reports.find(x => x.id === id1).review_note, '已叫師傅');
    r = await call('POST', `/api/admin/bug-reports/${id2}/review`, { status: 'pending' }, true);
    assert.equal(r.body.user_points, 1); assert.equal(r.body.report.reviewed_at, null);

    // 會員點數帳本：認可 +1、重複送同狀態不重複加、取消認可沖回、再認可重新給點
    const bal = async u => yan.balance((await db.query('SELECT * FROM yan_ledger WHERE user_id=$1', [u])).rows);
    assert.equal(await bal('u1'), 1); assert.equal(r.body.balance, 1);
    r = await call('POST', `/api/admin/bug-reports/${id1}/review`, { status: 'accepted', note: '改回覆' }, true);
    assert.equal(r.body.balance, 1); assert.equal(await bal('u1'), 1);
    r = await call('POST', `/api/admin/bug-reports/${id1}/review`, { status: 'rejected' }, true);
    assert.equal(r.body.balance, 0); assert.equal(r.body.user_points, 0);
    r = await call('POST', `/api/admin/bug-reports/${id1}/review`, { status: 'accepted' }, true);
    assert.equal(r.body.balance, 1);
    r = await call('POST', `/api/admin/bug-reports/${id2}/review`, { status: 'accepted' }, true);
    assert.equal(r.body.balance, 2); assert.equal(await bal('u2'), 0);
    const led = (await db.query(`SELECT kind,delta,ref_type,ref_id,reason,actor FROM yan_ledger WHERE user_id='u1' ORDER BY created_at,ref_id`)).rows;
    assert.ok(led.every(x => x.ref_type === 'bug' && x.actor === 'staff@emoji.tw'));
    assert.equal(led.filter(x => x.kind === 'grant').length, 4); assert.equal(led.filter(x => x.kind === 'void_earn').length, 2);
    assert.match(led.find(x => x.kind === 'grant').reason, /大家來找碴認可：2F 淋浴間/);
  } finally { if (listener) listener.close(); await db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
