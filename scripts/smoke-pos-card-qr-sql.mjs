// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：POS 線上刷卡 QR（KK 11/17），跑真的 server.js 路由（vm 切出）＋ PGlite。
// 約書旅開桌點品項 → 建付款 QR（金額伺服器重算、存 card_qr）→ 付款中櫃檯結帳 423 → 客人付款 → /check 入帳、清桌、冪等 → webhook 重送不重複；
// 餐飲品牌 403；品項變動後付款＝review 不入帳；取消讓 Stripe 連結失效。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); const j = source.indexOf(b, i); assert.ok(j > i, b); return source.slice(i, j); };

test('線上刷卡 QR：建立→付款中擋櫃檯結帳→付款入帳清桌→冪等；餐飲 403；品項變動不入帳；取消', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),pay_requests JSONB NOT NULL DEFAULT '[]',party_votes JSONB NOT NULL DEFAULT '{}',venue TEXT,space JSONB,user_id TEXT);
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB,amount INT,payer JSONB,invoice JSONB,status TEXT,paid_at TIMESTAMPTZ DEFAULT now(),ready_at TIMESTAMPTZ,done_at TIMESTAMPTZ,user_id TEXT);
      CREATE UNIQUE INDEX table_orders_stripe_session_uidx ON table_orders((payer->>'stripe_session')) WHERE payer->>'stripe_session' IS NOT NULL;
      CREATE TABLE linepay_payments(id TEXT,session_id TEXT,state TEXT);
      CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);`);
    const q = (sql, args) => db.query(sql, args);
    let n = 0; const uid = p => p + (++n).toString(16).padStart(16, '0');
    const tableOrders = require('./lib/table-orders');
    const line = (id, venue, price, qty = 1) => ({ line: id, item_id: 'm_' + id, venue, cat: 'LOUNGE', zh: '品項' + id, price, qty });
    await q(`INSERT INTO table_sessions(id,table_no,venue,items) VALUES ('ts_rest01','Q1','REST',$1),('ts_rest02','Q2','REST',$2),('ts_cafe01','A1','CAFE',$3)`,
      [JSON.stringify([line('l1', 'REST', 450), line('l2', 'REST', 100, 2)]), JSON.stringify([line('l9', 'REST', 300)]), JSON.stringify([line('c1', 'CAFE', 120)])]);
    const SESS = {}, created = [], expired = [], staffMsgs = [], invoices = [];
    const stripe = { checkout: { sessions: {
      create: async o => { const id = 'cs_test' + created.length; created.push(o); SESS[id] = { id, url: 'https://checkout.stripe.test/' + id, status: 'open', payment_status: 'unpaid', currency: 'twd', amount_total: o.line_items[0].price_data.unit_amount * o.line_items[0].quantity, metadata: o.metadata }; return SESS[id]; },
      retrieve: async id => SESS[id], expire: async id => { expired.push(id); SESS[id].status = 'expired'; return SESS[id]; } } } };
    let BRANDS = ['REST'];
    const app = express(); app.use(express.json());
    const noop = async () => 0;
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, uid, tableOrders, stripe, console, Date, Math, JSON, Number, String, Set, Map, Promise, process: { env: {} },
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: BRANDS }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message, stack: e.stack })),
      resolveOperator: async (req, id) => (id === 's1' ? { id: 's1', name: '店員甲' } : null), actorOf: a => a.email,
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      lineService: { notifyStaff: m => staffMsgs.push(m) }, chargeAppRedeems: noop, stockConsume: noop, inventoryConsume: noop, kitchenPrint: { enqueue: noop },
      registersOpenMap: async () => ({ REST: { id: 'r1' }, CAFE: { id: 'r2' } }), posRegister: require('./lib/pos-register'),
      ezpayInvoice: { invoiceForm: b => (b && b.mode ? { requested: true, mode: b.mode } : { requested: false }) }, storeInvoiceResult: async (o, inv) => { invoices.push(o.id); return inv; },
      memberAccessFor: async () => ({ active: false }), findOrCreateMemberByPhone: noop, posPaymentMethods: { groupsOf: () => null }, activePaymentCodes: async () => [], applyYanForCheckout: noop, verifyAccessToken: () => null });
    vm.runInContext('const ORDER_ID_RE=/^[a-z0-9_]{6,32}$/;const posScope=req=>tableOrders.visibleVenues(req.auth.brands,String(req.query?.venue||req.body?.venue||"").toUpperCase());', ctx);
    vm.runInContext(slice("app.post('/api/admin/orders/sessions/:id/checkout'", "app.post('/api/admin/orders/:id/invoice/issue'"), ctx);
    vm.runInContext(slice("/* ---- POS 線上刷卡 QR", "app.post('/api/admin/orders/sessions/:id/checkout'"), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() }; };

    /* 建 QR：金額＝450＋100×2，前端金額不採信 */
    let r = await call('/api/admin/orders/sessions/ts_rest01/card-qr', { operator_id: 's1', amount: 1, source: 'ig', invoice: { mode: 'paper' } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.amount, 650); assert.match(r.body.url, /checkout\.stripe\.test/);
    assert.equal(created[0].metadata.kind, 'pos_card'); assert.equal(created[0].line_items[0].price_data.currency, 'twd'); assert.match(created[0].line_items[0].price_data.product_data.name, /約書旅/);
    /* 重送同一筆 */
    const again = await call('/api/admin/orders/sessions/ts_rest01/card-qr', {});
    assert.equal(again.body.id, r.body.id); assert.equal(again.body.reused, true); assert.equal(created.length, 1);
    /* 付款中：櫃檯一般結帳 423 */
    const co = await call('/api/admin/orders/sessions/ts_rest01/checkout', { method: 'cash' });
    assert.equal(co.status, 423, JSON.stringify(co.body));
    /* 還沒付：open */
    assert.equal((await call('/api/admin/orders/sessions/ts_rest01/card-qr/check', {})).body.state, 'open');
    /* 客人付款 → check 入帳 */
    Object.assign(SESS[r.body.id], { status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
    r = await call('/api/admin/orders/sessions/ts_rest01/card-qr/check', {});
    assert.equal(r.body.state, 'settled', JSON.stringify(r.body)); assert.equal(r.body.closed, true); assert.equal(r.body.order.amount, 650);
    const o = (await q("SELECT * FROM table_orders WHERE session_id='ts_rest01'")).rows;
    assert.equal(o.length, 1); assert.equal(o[0].payer.method, 'stripe'); assert.equal(o[0].payer.card_qr, true); assert.equal(o[0].payer.operator_name, '店員甲'); assert.equal(o[0].payer.source, 'ig'); assert.equal(o[0].invoice.mode, 'paper');
    assert.equal((await q("SELECT status FROM table_sessions WHERE id='ts_rest01'")).rows[0].status, 'closed');
    assert.equal((await q("SELECT count(*)::int n FROM site_content WHERE key='card_qr:ts_rest01'")).rows[0].n, 0);
    assert.equal(invoices.length, 1, '發票只開一次');
    /* 冪等：再查、webhook 重送都不重複入帳 */
    assert.equal((await call('/api/admin/orders/sessions/ts_rest01/card-qr/check', { id: 'cs_test0' })).body.state, 'settled');
    const w = await ctx.fulfillPosCardCheckout(SESS[created[0] && 'cs_test0']);
    assert.equal(w.already, true); assert.equal((await q("SELECT count(*)::int n FROM table_orders")).rows[0].n, 1); assert.equal(invoices.length, 1);

    /* 餐飲品牌不開放 */
    BRANDS = ['CAFE'];
    assert.equal((await call('/api/admin/orders/sessions/ts_cafe01/card-qr', {})).status, 403);
    BRANDS = ['REST'];

    /* 品項變動後才付款：不入帳、通知退款 */
    r = await call('/api/admin/orders/sessions/ts_rest02/card-qr', {});
    assert.equal(r.status, 200); assert.equal(r.body.amount, 300);
    await q("UPDATE table_sessions SET items=$1 WHERE id='ts_rest02'", [JSON.stringify([line('l9', 'REST', 300), line('l8', 'REST', 50)])]);
    Object.assign(SESS[r.body.id], { status: 'complete', payment_status: 'paid' });
    const rv = await call('/api/admin/orders/sessions/ts_rest02/card-qr/check', {});
    assert.equal(rv.body.state, 'settled', '只結原本那幾行，金額一致仍可入帳');
    assert.equal((await q("SELECT status FROM table_sessions WHERE id='ts_rest02'")).rows[0].status, 'open', '新加的品項還沒付，桌不清');

    /* 取消：Stripe 連結失效 */
    r = await call('/api/admin/orders/sessions/ts_rest02/card-qr', {});
    assert.equal(r.body.amount, 50);
    const c = await call('/api/admin/orders/sessions/ts_rest02/card-qr/cancel', {});
    assert.equal(c.body.state, 'cancelled'); assert.ok(expired.includes(r.body.id));
    assert.equal((await call('/api/admin/orders/sessions/ts_rest02/card-qr/check', {})).body.state, 'none');

    /* 金額不符（品項被作廢）：review、不入帳、通知 */
    r = await call('/api/admin/orders/sessions/ts_rest02/card-qr', {});
    await q("UPDATE table_sessions SET items=$1 WHERE id='ts_rest02'", [JSON.stringify([])]);
    Object.assign(SESS[r.body.id], { status: 'complete', payment_status: 'paid' });
    const bad = await call('/api/admin/orders/sessions/ts_rest02/card-qr/check', {});
    assert.equal(bad.body.state, 'review'); assert.ok(staffMsgs.some(m => /退款/.test(m)));
  } finally { listener?.close(); await db.close(); }
});
