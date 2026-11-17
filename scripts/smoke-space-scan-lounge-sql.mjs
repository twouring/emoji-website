// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：會員 App 共享空間／貴賓室 × POS 掃碼進出（KK 11/17），跑真的 server.js 路由（vm 切出）＋ PGlite。
// 貴賓室：Stripe 付款完成 → 約書旅開「線上已付・未入場」單（冪等）→ 不佔容量、不能清單 → POS 掃會員卡＝checkin → 靜讀室選席 → 開始計時 → 再掃＝inside → 離場。
// 等等空間：App 買的會籍 POS 會員清單看得到（待首次進場）→ 掃會員卡＝會員入場、啟用會籍、寫 access_scans → 再掃＝inside；沒會籍 403；假 QR 400。
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

test('貴賓室線上購買→掃碼入場→離場；等等空間會員掃碼入場與會員清單', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),opened_by_staff_id TEXT,opened_by_staff_name TEXT,pay_requests JSONB NOT NULL DEFAULT '[]',party_votes JSONB NOT NULL DEFAULT '{}',members JSONB NOT NULL DEFAULT '[]',notices JSONB NOT NULL DEFAULT '[]',venue TEXT,space JSONB,user_id TEXT);
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB,amount INT,payer JSONB,invoice JSONB,status TEXT,paid_at TIMESTAMPTZ DEFAULT now(),ready_at TIMESTAMPTZ,done_at TIMESTAMPTZ,user_id TEXT);
      CREATE UNIQUE INDEX table_orders_stripe_session_uidx ON table_orders((payer->>'stripe_session')) WHERE payer->>'stripe_session' IS NOT NULL;
      CREATE TABLE linepay_payments(id TEXT,session_id TEXT,state TEXT);
      CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);
      CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,phone TEXT,phone_e164 TEXT);
      CREATE TABLE entitlements(id TEXT PRIMARY KEY,user_id TEXT,plan TEXT,source TEXT,source_id TEXT,purchased_at TIMESTAMPTZ DEFAULT now(),activated_at TIMESTAMPTZ,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,UNIQUE(source,source_id));
      CREATE TABLE access_scans(id TEXT PRIMARY KEY,entitlement_id TEXT,user_id TEXT,token_iat BIGINT,scanned_at TIMESTAMPTZ,UNIQUE(entitlement_id,token_iat));
      INSERT INTO users VALUES ('u_amy','小美','amy@x.tw','0912345678','+886912345678'),('u_bob','阿寶','bob@x.tw',NULL,NULL);`);
    const q = (sql, args) => db.query(sql, args);
    let n = 0; const uid = p => p + (++n).toString(16).padStart(16, '0');
    const tableOrders = require('./lib/table-orders'), posSpace = require('./lib/pos-space'), tok = require('./lib/access-token'), ent = require('./lib/entitlements');
    const items = posSpace.STAY_ITEMS.map(x => ({ ...x }));
    items.push({ id: 'm_rest_space_lounge_entry_4_hours', venue: 'REST', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 4 小時', price: 450, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
      { id: 'm_rest_space_quiet_room_4_hours', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室 4 小時', price: 750, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
      { id: 'm_rest_space_lounge_overtime_1_hour', venue: 'REST', cat: 'LOUNGE', zh: '空間使用費｜貴賓室超時 1 小時', price: 100, published: true, pos_only: true, space_role: 'overtime' },
      { id: 'm_rest_space_lounge_private_hire_2_hours', venue: 'REST', cat: 'LOUNGE', zh: '交誼廳包場 2 小時', price: 3000, published: true, pos_only: true });
    await q("INSERT INTO site_content VALUES ('menu',$1,now())", [JSON.stringify({ version: 1, items })]);
    const SECRET = 'test-secret', ACCESS = 'access-secret';
    const staffMsgs = [];
    const app = express(); app.use(express.json());
    const noop = async () => 0;
    let BRANDS = ['REST'], me = 'u_amy';
    const loadEntitlements = async id => (await q('SELECT * FROM entitlements WHERE user_id=$1', [id])).rows;
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, uid, tableOrders, posSpace, SECRET, ACCESS_QR_SECRET: ACCESS, process: { env: { ACCESS_QR_SECRET: ACCESS } }, APP_BASE: 'https://app.test', console, Buffer, Date, Math, JSON, Number, String, Set, Map, Promise,
      auth: (req, res, next) => { req.auth = req.path.startsWith('/api/me/') ? { role: 'member', sub: me } : { role: 'admin', email: 'pos@test', brands: BRANDS, pos_device: 'dev1' }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      superOrManagerPin: async (req, res) => res.status(403).json({ error: 'pin' }),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message, stack: e.stack })),
      resolveOperator: async (req, id) => (id === 's1' ? { id: 's1', name: '店員甲' } : null), counterDevice: async () => ({ id: 'dev1', label: '櫃檯 iPad' }), actorOf: a => a.email,
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      verifyAccessToken: tok.verifyAccessToken, pickEntitlementForQr: ent.pickEntitlementForQr, endsAtAfterActivation: ent.endsAtAfterActivation, applyLazyAutoActivate: ent.applyLazyAutoActivate,
      loadEntitlements, persistLazyActivations: async e => e, rowToEnt: r => r, PLAN_LABEL: { month: '月會員', day_4h: '單日 4 小時' },
      applyYanForCheckout: async () => ({ earned: 45 }), lineService: { notifyStaff: m => staffMsgs.push(m) },
      stripe: { checkout: { sessions: { create: async o => ({ url: 'https://stripe.test/' + o.metadata.item_id, o }), retrieve: async id => SESS[id] } } },
      refundAppRedeems: noop, chargeAppRedeems: noop, stockConsume: noop, stockRestore: noop, inventoryConsume: noop, inventoryRestore: noop, posInventory: { restorableRemoved: () => [] }, kitchenPrint: { enqueue: noop },
      loadSession: async id => (await q('SELECT * FROM table_sessions WHERE id=$1', [id])).rows[0], publicSession: s => ({ id: s.id, items: s.items }),
      findOrCreateMemberByPhone: noop, memberAccessFor: async () => ({ active: false }), posPaymentMethods: { groupsOf: () => null }, activePaymentCodes: async () => [], registersOpenMap: async () => ({}),
      posRegister: { ...require('./lib/pos-register'), checkoutAllowed: () => ({ warning: '' }) }, ezpayInvoice: { invoiceForm: () => ({}) }, storeInvoiceResult: async (o, inv) => inv, posStaff: require('./lib/pos-staff') });
    const SESS = {};
    vm.runInContext('const ORDER_ID_RE=/^[a-z0-9_]{6,32}$/;', ctx);
    vm.runInContext(slice('async function mutateItems(', "app.post('/api/orders/:id/items'"), ctx);
    vm.runInContext(slice("app.post('/api/admin/orders/sessions/:id/checkout'", "app.post('/api/admin/orders/:id/invoice/issue'"), ctx);
    vm.runInContext(slice("app.post('/api/admin/orders/sessions/:id/close'", '// 本桌點餐 QR（單次）'), ctx);
    vm.runInContext(slice('function pinVenue(req,requested){', 'async function staffByPin'), ctx);
    vm.runInContext(slice('const CARD_SECRET = ', "app.post('/api/access/verify'"), ctx);
    vm.runInContext(slice('/* ---- 會員 App「貴賓室」（KK 11/17）', '// 公開：未來 90 天已排定的場地時段'), ctx);
    ctx.counterDevice = async () => ({ id: 'dev1', label: '櫃檯 iPad' });
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
    const card = sub => tok.signAccessToken(require('./lib/yan').cardClaims({ id: sub, name: 'x' }), ACCESS, { ttlSec: 120 });

    /* ---- 貴賓室：可購買清單只有有價格的限時方案（超時、包場不賣） ---- */
    let r = await call('GET', '/api/lounge/plans');
    assert.deepEqual(r.body.plans.map(p => p.id).sort(), ['m_rest_space_lounge_entry_4_hours', 'm_rest_space_quiet_room_4_hours']);
    assert.equal((await call('POST', '/api/me/lounge/checkout', { item_id: 'm_rest_space_lounge_overtime_1_hour' })).status, 400, '超時品項不能線上買');
    r = await call('POST', '/api/me/lounge/checkout', { item_id: 'm_rest_space_lounge_entry_4_hours' });
    assert.equal(r.status, 200); assert.match(r.body.url, /stripe\.test/);
    // Stripe 回跳：付款完成
    SESS.cs_lounge1 = { id: 'cs_lounge1', payment_status: 'paid', currency: 'twd', amount_total: 45000, payment_intent: 'pi_1', metadata: { kind: 'lounge', item_id: 'm_rest_space_lounge_entry_4_hours', price: '450', user_id: 'u_amy' } };
    r = await call('POST', '/api/me/lounge/verify', { session_id: 'cs_lounge1' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.table, 'E01'); assert.equal(r.body.already, false);
    assert.equal((await call('POST', '/api/me/lounge/verify', { session_id: 'cs_lounge1' })).body.already, true, 'webhook／回跳重複不重開單');
    assert.equal(Number((await q("SELECT count(*) FROM table_sessions WHERE venue='REST'")).rows[0].count), 1);
    const ord = (await q("SELECT amount,payer,status,user_id FROM table_orders WHERE payer->>'stripe_session'='cs_lounge1'")).rows[0];
    assert.equal(ord.amount, 450); assert.equal(ord.payer.method, 'stripe'); assert.equal(ord.user_id, 'u_amy');
    assert.ok(staffMsgs.some(m => /貴賓室線上購買 E01/.test(m)), '通知員工');
    // 改價後回跳＝不入帳、通知退款
    SESS.cs_bad = { id: 'cs_bad', payment_status: 'paid', currency: 'twd', amount_total: 40000, metadata: { kind: 'lounge', item_id: 'm_rest_space_lounge_entry_4_hours', price: '400', user_id: 'u_amy' } };
    assert.equal((await call('POST', '/api/me/lounge/verify', { session_id: 'cs_bad' })).status, 409);
    // App：我的方案＝ready
    r = await call('GET', '/api/me/lounge');
    assert.equal(r.body.passes[0].state, 'ready'); assert.match(r.body.passes[0].name, /貴賓室入場 4 小時/);
    // POS 看板：線上已付、不佔容量；不能清單
    const pass = (await q("SELECT id,space FROM table_sessions WHERE venue='REST'")).rows[0];
    assert.equal(posSpace.view({ ...pass, items: (await q('SELECT items FROM table_sessions WHERE id=$1', [pass.id])).rows[0].items }, posSpace.normalizeSettings({}, 'REST')).state, 'ready');
    assert.equal(posSpace.occupancy([{ ...pass, items: [] }]), 0, '還沒到的不算在場人數');
    r = await call('POST', `/api/admin/orders/sessions/${pass.id}/close`, {});
    assert.equal(r.status, 409); assert.match(r.body.error, /線上已付款/);
    // 假 QR、別人的 QR
    { const x = await call('POST', '/api/admin/orders/space/scan', { token: 'abc.def' }); assert.equal(x.status, 400, JSON.stringify(x.body).slice(0,300)); }
    { const x = await call('POST', '/api/admin/orders/space/scan', { token: card('u_bob') }); assert.equal(x.status, 404, '阿寶沒買貴賓室 ' + JSON.stringify(x.body)); }
    // 掃小美會員卡 → checkin
    r = await call('POST', '/api/admin/orders/space/scan', { token: card('u_amy'), operator_id: 's1' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.action, 'checkin'); assert.equal(r.body.need_seat, false, '交誼廳不用選席');
    r = await call('POST', `/api/admin/orders/sessions/${pass.id}/space/checkin`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(Date.parse(r.body.space_started.due_at) - Date.parse(r.body.space_started.in_at), 240 * 60000);
    assert.equal((await call('POST', `/api/admin/orders/sessions/${pass.id}/space/checkin`, {})).status, 404, '不能重複入場');
    // 再掃＝在場內
    r = await call('POST', '/api/admin/orders/space/scan', { token: card('u_amy') });
    assert.equal(r.body.action, 'inside'); assert.equal(r.body.id, pass.id);
    assert.equal((await call('GET', '/api/me/lounge')).body.passes[0].state, 'inside');
    // 靜讀室：要選席、席號換掉入場單號
    SESS.cs_q = { id: 'cs_q', payment_status: 'paid', currency: 'twd', amount_total: 75000, metadata: { kind: 'lounge', item_id: 'm_rest_space_quiet_room_4_hours', price: '750', user_id: 'u_bob' } };
    me = 'u_bob'; r = await call('POST', '/api/me/lounge/verify', { session_id: 'cs_q' }); assert.equal(r.body.table, 'E02');
    r = await call('POST', '/api/admin/orders/space/scan', { token: card('u_bob') });
    assert.equal(r.body.action, 'checkin'); assert.equal(r.body.need_seat, true);
    assert.equal((await call('POST', `/api/admin/orders/sessions/${r.body.id}/space/checkin`, {})).status, 400, '靜讀室沒選席');
    r = await call('POST', `/api/admin/orders/sessions/${r.body.id}/space/checkin`, { seat: 'Q3' });
    assert.equal(r.status, 200); assert.equal(r.body.table, 'Q3');
    assert.equal((await q("SELECT table_no FROM table_orders WHERE payer->>'stripe_session'='cs_q'")).rows[0].table_no, 'Q3', '訂單桌號同步');
    // 小美離場（模擬 4h20m → 超時 1 小時 100）
    await q(`UPDATE table_sessions SET space=jsonb_set(space,'{in_at}',to_jsonb((now()-interval '260 minutes')::text)) WHERE id=$1`, [pass.id]);
    r = await call('POST', `/api/admin/orders/sessions/${pass.id}/space/leave`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.overtime_units, 1); assert.equal(r.body.due, 100);

    /* ---- 等等空間：App 買的會籍 → POS 會員清單 → 掃會員卡會員入場 ---- */
    BRANDS = ['STAY'];
    await q("INSERT INTO entitlements(id,user_id,plan,source,source_id) VALUES ('en_1','u_amy','month','stripe','cs_plan1')");
    r = await call('GET', '/api/admin/orders/space/members');
    assert.equal(r.status, 200); assert.equal(r.body.members.length, 1);
    assert.deepEqual([r.body.members[0].name, r.body.members[0].state, r.body.members[0].source, r.body.members[0].phone, r.body.members[0].inside], ['小美', 'pending', 'stripe', '0912***678', false]);
    assert.equal((await call('POST', '/api/admin/orders/space/scan', { token: card('u_bob') })).status, 403, '阿寶沒有等等空間方案');
    const oldAccess = tok.signAccessToken({ sub: 'u_amy', ent: 'en_1', plan: 'month', floors: ['2', '3'] }, ACCESS, { ttlSec: 45 });
    assert.equal((await call('POST', '/api/admin/orders/space/scan', { token: oldAccess })).status, 400, '舊的獨立進出 QR 不再接受');
    r = await call('POST', '/api/admin/orders/space/scan', { token: card('u_amy'), operator_id: 's1' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.action, 'entered'); assert.equal(r.body.activated, true); assert.equal(r.body.space_started.due_at, null, '會員入場不限時');
    const e = (await q("SELECT activated_at,ends_at FROM entitlements WHERE id='en_1'")).rows[0];
    assert.ok(e.activated_at && e.ends_at, '首次進場啟用會籍');
    assert.equal(Number((await q('SELECT count(*) FROM access_scans')).rows[0].count), 1);
    const st = (await q("SELECT table_no,status,space,opened_by_staff_name FROM table_sessions WHERE venue='STAY'")).rows[0];
    assert.equal(st.status, 'open'); assert.ok(st.space.in_at); assert.equal(st.space.member_id, 'u_amy'); assert.equal(st.opened_by_staff_name, '店員甲');
    assert.equal(Number((await q("SELECT amount FROM table_orders WHERE table_no=$1 AND user_id='u_amy' AND payer->>'member_entry'='true'", [st.table_no])).rows[0].amount), 0);
    r = await call('GET', '/api/admin/orders/space/members');
    assert.equal(r.body.members[0].state, 'active'); assert.equal(r.body.members[0].inside, true);
    r = await call('POST', '/api/admin/orders/space/scan', { token: card('u_amy') });
    assert.equal(r.body.action, 'inside', '再掃＝離場流程');
    r = await call('POST', `/api/admin/orders/sessions/${r.body.id}/space/leave`, {});
    assert.equal(r.status, 200); assert.equal(r.body.closed, true, '會員入場離場直接結清');
    // 約書旅 POS 看不到等等空間會員清單
    BRANDS = ['REST'];
    assert.deepEqual((await call('GET', '/api/admin/orders/space/members')).body.members, []);
  } finally { if (listener) listener.close(); await db.close(); }
});
