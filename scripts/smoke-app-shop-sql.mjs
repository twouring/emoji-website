// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：會員 App 商店
// 跑真的 server.js 路由（vm 切出 /* ---- 會員 App 商店 區塊）＋ PGlite，不碰正式站。
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

const MENU = JSON.stringify({ version: 1, items: [
  { id: 'brush', zh: '牙刷牙膏組', venue: 'CAFE', cat: 'SHOP', price: 60, published: true },
  { id: 'towel', zh: '浴巾', venue: 'CAFE', cat: 'SHOP', price: 350, published: true },
  { id: 'ear', zh: '耳機', venue: 'CAFE', cat: 'SHOP', price: 490, published: true, stock_day: '', stock_left: null },
  { id: 'latte', zh: '拿鐵', venue: 'CAFE', cat: 'COFFEE', price: 140, published: true },
] });

test('商店下單開外帶單、限 3 張、只收 SHOP、取消、48 小時未付自動取消', async () => {
  const db = new PGlite(); let listener; const notes = [];
  try {
    await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);
      INSERT INTO users VALUES('u_a','小明'),('u_b','小華');
      CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',
        user_id TEXT,shop_at TIMESTAMPTZ,pickup_note TEXT NOT NULL DEFAULT '',opened_by_staff_name TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      INSERT INTO table_sessions(id,table_no) VALUES('ts_busy000000000001','W01');`);
    const q = (sql, args) => db.query(sql, args);
    const tableOrders = require('./lib/table-orders');
    const app = express(); app.use(express.json());
    let who = 'u_a', n = 0;
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders,
      auth: (req, res, next) => { req.auth = { role: 'invited', sub: who }; next(); },
      requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      contentValue: async () => MENU, pickup: require('./lib/pickup'), uid: p => p + String(++n).padStart(16, '0'),
      ORDER_ID_RE: /^ts_[A-Za-z0-9]{8,40}$/, lineService: { notifyStaff: t => notes.push(t) }, console });
    vm.runInContext(slice('/* ---- 會員 App 商店', '/* 會員卡「可兌換」清單'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (path, body, method = 'POST') => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };

    // 非 SHOP 品項（拿鐵）不能從商店買
    assert.equal((await call('/api/me/shop', { items: [{ item_id: 'latte', qty: 1 }] })).status, 400);
    // 正常下單：W01 被占，拿 W02；金額伺服器算；行已 served；記營業品牌
    let r = await call('/api/me/shop', { items: [{ item_id: 'brush', qty: 2 }, { item_id: 'towel', qty: 1 }], note: '晚上拿' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.order.table, 'W02'); assert.equal(r.body.order.amount, 470); assert.equal(r.body.order.note, '晚上拿');
    const row = (await q("SELECT * FROM table_sessions WHERE table_no='W02'")).rows[0];
    assert.equal(row.user_id, 'u_a'); assert.ok(row.shop_at); assert.equal(row.opened_by_staff_name, '會員 App 商店');
    assert.ok(row.items.every(l => l.served_at && l.cat === 'SHOP' && ['CAFE', 'BAR'].includes(l.venue)));
    assert.match(notes.at(-1), /商店訂單 W02/);
    // 第 2、3 張 OK，第 4 張 409
    assert.equal((await call('/api/me/shop', { items: [{ item_id: 'ear', qty: 1 }] })).status, 201);
    assert.equal((await call('/api/me/shop', { items: [{ item_id: 'ear', qty: 1 }] })).status, 201);
    assert.equal((await call('/api/me/shop', { items: [{ item_id: 'ear', qty: 1 }] })).status, 409);
    // 列表只看自己
    r = await call('/api/me/shop', null, 'GET'); assert.equal(r.body.orders.length, 3);
    who = 'u_b'; r = await call('/api/me/shop', null, 'GET'); assert.equal(r.body.orders.length, 0);
    // 別人的單取消不了；自己的可以；已結帳的不行
    assert.equal((await call('/api/me/shop/' + row.id, null, 'DELETE')).status, 409);
    who = 'u_a';
    assert.equal((await call('/api/me/shop/' + row.id, null, 'DELETE')).status, 200);
    assert.equal((await q('SELECT status FROM table_sessions WHERE id=$1', [row.id])).rows[0].status, 'closed');
    const paid = (await q("SELECT id FROM table_sessions WHERE user_id='u_a' AND status='open' ORDER BY table_no LIMIT 1")).rows[0].id;
    await q(`UPDATE table_sessions SET items=jsonb_set(items,'{0,order_id}','"to_x"') WHERE id=$1`, [paid]);
    assert.equal((await call('/api/me/shop/' + paid, null, 'DELETE')).status, 409);
    // 過期：49 小時前、未結帳的收掉；已結帳的不動
    await q("UPDATE table_sessions SET shop_at=now()-interval '49 hours' WHERE user_id='u_a'");
    assert.equal(await ctx.expireShopOrders(), 1);
    assert.equal((await q("SELECT status FROM table_sessions WHERE id=$1", [paid])).rows[0].status, 'open');
  } finally { listener?.close(); await db.close(); }
});
