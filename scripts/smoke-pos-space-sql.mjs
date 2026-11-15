// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：POS 空間情境（KK 11/15）完整流程，跑真的 server.js 路由（vm 切出）＋ PGlite。
// 等等空間：入場 2 位 4h → 收款開始計時 → 延長 → 不能清桌 → 超時離場自動加超時品項（每人計）→ 補收結清清單；
// 約書旅：靜讀室要指定席號、席位使用中擋、8 小時上限擋；會員 0 元入場不限時；情境切換有人在場擋。
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

test('空間情境：入場→收款計時→延長→超時離場→補收結清；席位、上限、會員、切換', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),opened_by_staff_id TEXT,opened_by_staff_name TEXT,pay_requests JSONB NOT NULL DEFAULT '[]',party_votes JSONB NOT NULL DEFAULT '{}',members JSONB NOT NULL DEFAULT '[]',notices JSONB NOT NULL DEFAULT '[]',venue TEXT,space JSONB);
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB,amount INT,payer JSONB,invoice JSONB,status TEXT,paid_at TIMESTAMPTZ DEFAULT now(),ready_at TIMESTAMPTZ,done_at TIMESTAMPTZ,user_id TEXT);
      CREATE TABLE linepay_payments(id TEXT,session_id TEXT,state TEXT);
      CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);`);
    const q = (sql, args) => db.query(sql, args);
    let n = 0; const uid = p => p + (++n).toString(16).padStart(16, '0');
    const tableOrders = require('./lib/table-orders'), posSpace = require('./lib/pos-space');
    const items = posSpace.STAY_ITEMS.map(x => ({ ...x }));
    posSpace.planBackfill(items);
    items.push({ id: 'm_rest_space_quiet_room_4_hours', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室 4 小時', price: 750, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
      { id: 'm_rest_space_quiet_room_8_hours', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室 8 小時', price: 1200, published: true, pos_only: true, space_role: 'plan', space_minutes: 480 },
      { id: 'm_rest_space_quiet_room_overtime_1_hour', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室超時 1 小時', price: 150, published: true, pos_only: true, space_role: 'overtime' });
    const menuDoc = JSON.stringify({ version: 1, items });
    await q("INSERT INTO site_content VALUES ('menu',$1,now())", [menuDoc]);
    const app = express(); app.use(express.json());
    const noop = async () => 0;
    let BRANDS = ['STAY'];
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, uid, tableOrders, posSpace, SECRET: 'test-secret', console, Buffer, Date,
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: BRANDS, pos_device: 'dev1' }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      superOrManagerPin: async (req, res, next) => { if (req.get('x-manager-pin') === '9999') { req.managerPin = { id: 'm1', name: '店長' }; return next(); } res.status(403).json({ error: '請輸入店長識別碼。', need_manager_pin: true }); },
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message, stack: e.stack })),
      resolveOperator: async (req, id) => (id === 's1' ? { id: 's1', name: '店員甲' } : null),
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      refundAppRedeems: noop, chargeAppRedeems: noop, stockConsume: noop, stockRestore: noop, inventoryConsume: noop, inventoryRestore: noop, posInventory: { restorableRemoved: () => [] }, kitchenPrint: { enqueue: noop },
      loadSession: async id => (await q('SELECT * FROM table_sessions WHERE id=$1', [id])).rows[0], publicSession: s => ({ id: s.id, items: s.items }),
      verifyAccessToken: () => null, findOrCreateMemberByPhone: noop, memberAccessFor: async () => ({ active: false }), applyYanForCheckout: noop,
      posPaymentMethods: { groupsOf: () => null }, activePaymentCodes: async () => [], registersOpenMap: async () => ({}), posRegister: { ...require('./lib/pos-register'), checkoutAllowed: () => ({ warning: '' }) },
      ezpayInvoice: { invoiceForm: () => ({}) }, storeInvoiceResult: async (o, inv) => inv, actorOf: a => a.email, posStaff: require('./lib/pos-staff') });
    vm.runInContext('const ORDER_ID_RE=/^[a-z0-9_]{6,32}$/;', ctx);
    vm.runInContext(slice('async function mutateItems(', "app.post('/api/orders/:id/items'"), ctx);
    vm.runInContext(slice('async function counterDevice(req) {', "app.post('/api/admin/orders/sessions/:id/items'"), ctx);
    vm.runInContext(slice("app.post('/api/admin/orders/sessions/:id/checkout'", "app.post('/api/admin/orders/:id/invoice/issue'"), ctx);
    vm.runInContext(slice("app.post('/api/admin/orders/sessions/:id/close'", '// 本桌點餐 QR（單次）'), ctx);
    vm.runInContext(slice('function pinVenue(req,requested){', 'async function staffByPin'), ctx);
    // counterDevice 查 pos_devices：換成固定裝置
    ctx.counterDevice = async () => ({ id: 'dev1', label: '櫃檯 iPad' });
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const call = async (method, path, body, headers = {}) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
    const shift = async (id, min) => q(`UPDATE table_sessions SET space=jsonb_set(space,'{in_at}',to_jsonb((now()-interval '${min} minutes')::text)) WHERE id=$1`, [id]);

    // 預設：等等空間＝空間情境
    let r = await call('GET', '/api/admin/orders/space/settings');
    assert.equal(r.status, 200); assert.equal(r.body.settings.mode, 'space');
    // 入場要識別碼、要計時方案
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_4_hours' })).status, 400);
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_overtime_1_hour', operator_id: 's1' })).status, 400, '超時品項不能當入場方案');
    r = await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_4_hours', headcount: 2, operator_id: 's1' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.table, 'E01'); assert.equal(r.body.amount, 400);
    const e1 = r.body.id;
    // 未收款：不能離場；不能延長以外的清桌（有未付）
    assert.equal((await call('POST', `/api/admin/orders/sessions/${e1}/space/leave`, {})).status, 409);
    // 收款＝開始計時，且不清單
    r = await call('POST', `/api/admin/orders/sessions/${e1}/checkout`, { method: 'cash', received: 400 });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.closed, false, '客人在場內不清單');
    assert.ok(r.body.space_started?.in_at); assert.equal(Date.parse(r.body.space_started.due_at) - Date.parse(r.body.space_started.in_at), 240 * 60000);
    let row = (await q('SELECT status,space FROM table_sessions WHERE id=$1', [e1])).rows[0];
    assert.equal(row.status, 'open'); assert.ok(row.space.in_at);
    // 在場不能清桌
    r = await call('POST', `/api/admin/orders/sessions/${e1}/close`, {});
    assert.equal(r.status, 409); assert.match(r.body.error, /離場/);
    // 延長 4h（每人一份）→ 收款
    r = await call('POST', `/api/admin/orders/sessions/${e1}/space/extend`, { item_id: 'm_stay_space_entry_4_hours' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ext = r.body.items.find(l => !l.order_id); assert.equal(ext.qty, 2); assert.equal(ext.space_minutes, 240);
    r = await call('POST', `/api/admin/orders/sessions/${e1}/checkout`, { method: 'card' });
    assert.equal(r.status, 200); assert.equal(r.body.closed, false); assert.equal(r.body.space_started, undefined, '延長不重設入場時間');
    // 模擬已用 8 小時 20 分（方案 8h）→ 超時 20 分 > 寬限 15 → 1 小時 × 2 人 = 100
    await shift(e1, 500);
    r = await call('POST', `/api/admin/orders/sessions/${e1}/space/leave`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.plan_minutes, 480); assert.equal(r.body.overtime_units, 1); assert.equal(r.body.headcount, 2); assert.equal(r.body.due, 100); assert.equal(r.body.closed, false);
    // 取消離場再離場（移除自動超時行）
    r = await call('POST', `/api/admin/orders/sessions/${e1}/space/resume`, {});
    assert.equal(r.status, 200);
    row = (await q('SELECT items,space FROM table_sessions WHERE id=$1', [e1])).rows[0];
    assert.equal(row.space.out_at, null); assert.ok(!row.items.some(l => l.space_role === 'overtime'));
    r = await call('POST', `/api/admin/orders/sessions/${e1}/space/leave`, {});
    assert.equal(r.body.due, 100);
    // 補收結清 → 清單
    r = await call('POST', `/api/admin/orders/sessions/${e1}/checkout`, { method: 'cash', received: 100 });
    assert.equal(r.status, 200); assert.equal(r.body.closed, true, '離場補收結清即清單');
    assert.equal((await q('SELECT status FROM table_sessions WHERE id=$1', [e1])).rows[0].status, 'closed');
    const paid = (await q('SELECT sum(amount)::int s FROM table_orders WHERE session_id=$1', [e1])).rows[0].s;
    assert.equal(paid, 400 + 400 + 100, '入場 400＋延長 400＋超時 100');

    // 寬限內離場：沒超時直接清單
    r = await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_12_hours', operator_id: 's1' });
    assert.equal(r.body.table, 'E01', '前一張已清，號碼釋出'); const e2 = r.body.id;
    await call('POST', `/api/admin/orders/sessions/${e2}/checkout`, { method: 'cash', received: 500 });
    await shift(e2, 720 + 14);
    r = await call('POST', `/api/admin/orders/sessions/${e2}/space/leave`, {});
    assert.equal(r.body.overtime_units, 0); assert.equal(r.body.closed, true);

    // 會員 0 元入場：0 元結帳也開始計時、不限時、不算超時
    r = await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_member_entry', operator_id: 's1' });
    const e3 = r.body.id; assert.equal(r.body.amount, 0);
    r = await call('POST', `/api/admin/orders/sessions/${e3}/checkout`, { method: 'cash' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.space_started.due_at, null);
    // 情境切換：有人在場不能切回餐飲；要店長識別碼
    assert.equal((await call('POST', '/api/admin/orders/space/settings', { mode: 'dining' })).status, 403);
    r = await call('POST', '/api/admin/orders/space/settings', { mode: 'dining' }, { 'x-manager-pin': '9999' });
    assert.equal(r.status, 409); assert.match(r.body.error, /未離場/);
    await shift(e3, 900);
    r = await call('POST', `/api/admin/orders/sessions/${e3}/space/leave`, {});
    assert.equal(r.body.overtime_units, 0); assert.equal(r.body.closed, true);
    // 容量
    r = await call('POST', '/api/admin/orders/space/settings', { capacity: 2 }, { 'x-manager-pin': '9999' });
    assert.equal(r.status, 200); assert.equal(r.body.settings.capacity, 2);
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_4_hours', headcount: 3, operator_id: 's1' })).status, 409);
    // 補登離場時間需店長
    r = await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_4_hours', operator_id: 's1' }); const e4 = r.body.id;
    await call('POST', `/api/admin/orders/sessions/${e4}/checkout`, { method: 'cash', received: 200 });
    await shift(e4, 600);
    const outAt = new Date(Date.now() - 300 * 60000).toISOString();
    assert.equal((await call('POST', `/api/admin/orders/sessions/${e4}/space/leave`, { out_at: outAt })).status, 403);
    r = await call('POST', `/api/admin/orders/sessions/${e4}/space/leave`, { out_at: outAt }, { 'x-manager-pin': '9999' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.used_minutes, 300); assert.equal(r.body.overtime_units, 1, '補登 5 小時：超 60 分 → 1 小時');
    // 切回餐飲（沒人在場了，除了 e4 還沒補收）→ 仍擋；結清後可切
    await call('POST', `/api/admin/orders/sessions/${e4}/checkout`, { method: 'cash', received: 50 });
    r = await call('POST', '/api/admin/orders/space/settings', { mode: 'dining' }, { 'x-manager-pin': '9999' });
    assert.equal(r.status, 200); assert.equal(r.body.settings.mode, 'dining');
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_stay_space_entry_4_hours', operator_id: 's1' })).status, 409, '餐飲情境不能開入場單');

    // 約書旅：靜讀室要席號、一席一人、使用中擋、8 小時上限擋
    BRANDS = ['REST'];
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_rest_space_quiet_room_4_hours', operator_id: 's1' })).status, 400, '要指定席號');
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_rest_space_quiet_room_4_hours', seat: 'Q3', headcount: 2, operator_id: 's1' })).status, 400, '一席一人');
    r = await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_rest_space_quiet_room_4_hours', seat: 'q3', operator_id: 's1' });
    assert.equal(r.status, 201); assert.equal(r.body.table, 'Q3'); const q3 = r.body.id;
    assert.equal((await call('POST', '/api/admin/orders/space/entries', { item_id: 'm_rest_space_quiet_room_4_hours', seat: 'Q3', operator_id: 's1' })).status, 409, '席位使用中');
    await call('POST', `/api/admin/orders/sessions/${q3}/checkout`, { method: 'cash', received: 750 });
    r = await call('POST', `/api/admin/orders/sessions/${q3}/space/extend`, { item_id: 'm_rest_space_quiet_room_8_hours' });
    assert.equal(r.status, 400); assert.match(r.body.error, /上限 8 小時/);
    assert.equal((await call('POST', `/api/admin/orders/sessions/${q3}/space/extend`, { item_id: 'm_rest_space_quiet_room_4_hours' })).status, 200, '4+4=8 小時可以');
    // 跨品牌：等等空間不能動約書旅的單
    BRANDS = ['STAY'];
    assert.equal((await call('POST', `/api/admin/orders/sessions/${q3}/space/leave`, {})).status, 403);
  } finally { listener?.close(); await db.close(); }
});
