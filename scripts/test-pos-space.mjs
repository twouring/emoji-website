// POS 空間情境（KK 11/15，lib/pos-space.js）：超時計算、設定預設與合併、狀態、統計；菜單欄位保留；前後端接線。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-space.js');
const T = require('../lib/table-orders.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('超時：寬限 15 分內不收，之後每小時以 15 分為界（4h 方案）', () => {
  const c = { grace_min: 15, unit_min: 60 };
  const cases = [[240, 0], [255, 0], [256, 1], [314, 1], [315, 1], [316, 2], [376, 3], [100, 0]];
  for (const [used, units] of cases) assert.equal(S.overtimeUnits(used, 240, c), units, `用 ${used} 分`);
  assert.equal(S.overtimeUnits(9999, 0, c), 0, '不限時（會員入場）不算超時');
  assert.equal(S.overtimeUnits(270, 240, { grace_min: 0, unit_min: 30 }), 1, '自訂寬限 0、30 分一單位');
});

test('設定預設：在咖啡／三點水＝餐飲；等等空間／約書旅＝空間；約書旅 10 席、8 小時上限', () => {
  assert.equal(S.normalizeSettings('', 'CAFE').mode, 'dining');
  assert.equal(S.normalizeSettings('', 'BAR').mode, 'dining');
  const stay = S.normalizeSettings('', 'STAY'), rest = S.normalizeSettings(null, 'REST');
  assert.equal(stay.mode, 'space'); assert.equal(stay.max_hours, 0); assert.deepEqual(stay.seats, []);
  assert.equal(rest.mode, 'space'); assert.equal(rest.max_hours, 8); assert.equal(rest.seats.length, 10); assert.deepEqual(rest.seat_cats, ['QUIET']);
  assert.equal(rest.grace_min, 15); assert.equal(rest.unit_min, 60);
  const m = S.mergeSettings(rest, { mode: 'dining', seats: 'q1, Q2、E05,座位!,TOOLONGSEAT9', grace_min: 999 }, 'REST');
  assert.equal(m.mode, 'dining'); assert.deepEqual(m.seats, ['Q1', 'Q2'], 'E 開頭保留給入場單、非法字元剔除'); assert.equal(m.grace_min, 120, '夾在範圍內');
  assert.equal(S.contentKey('STAY'), 'pos_mode:STAY');
  assert.equal(stay.wifi_ssid, 'emoji'); assert.equal(stay.wifi_pass, 'meetfriends');
  const w = S.mergeSettings(stay, { wifi_ssid: ' stay-3F\n', wifi_pass: '' }, 'STAY');
  assert.equal(w.wifi_ssid, 'stay-3F'); assert.equal(w.wifi_pass, '', '密碼可清空');
});

const plan = (min, extra = {}) => ({ line: 'p' + min + (extra.line || ''), item_id: 'x', venue: 'STAY', cat: 'SPACE', zh: '等等空間 ' + min, price: 200, qty: 1, space_role: 'plan', space_minutes: min, ...extra });

test('延長上限：方案總時數超過 max_hours 擋下；0＝不限', () => {
  assert.equal(S.checkLimit([plan(240), plan(240, { line: 'b' })], { max_hours: 8 }), null);
  assert.match(S.checkLimit([plan(480), plan(60, { line: 'b' })], { max_hours: 8 }), /上限 8 小時/);
  assert.equal(S.checkLimit([plan(720), plan(720, { line: 'b' })], { max_hours: 0 }), null);
  assert.equal(S.planMinutes([plan(240), { ...plan(60, { line: 'c' }), cancelled: true }]), 240, '取消的不算');
});

test('狀態：使用中→快到時→寬限→超時→待確認離場；已離場；未收款', () => {
  const inAt = Date.parse('2026-11-15T10:00:00Z'), cfg = S.normalizeSettings('', 'STAY');
  const s = { table_no: 'E01', items: [plan(240, { order_id: 'to_1' })], space: { seat: '', headcount: 2, in_at: new Date(inAt).toISOString() } };
  const at = m => S.view(s, cfg, inAt + m * 60000);
  assert.equal(at(100).state, 'ok'); assert.equal(at(235).state, 'soon'); assert.equal(at(250).state, 'grace');
  assert.equal(at(260).state, 'over'); assert.equal(at(260).overtime_units, 1); assert.equal(at(240 + 15 + 121).state, 'stale');
  assert.equal(at(0).due_at, '2026-11-15T14:00:00.000Z'); assert.equal(at(0).seat, 'E01'); assert.equal(at(0).headcount, 2); assert.equal(at(0).paid_total, 200);
  assert.equal(S.view({ ...s, space: { headcount: 1, in_at: null } }, cfg).state, 'unpaid');
  assert.equal(S.view({ ...s, space: { ...s.space, out_at: new Date(inAt + 300 * 60000).toISOString() } }, cfg, inAt + 999 * 60000).used_minutes, 300, '離場後時間凍結');
  const rest = S.normalizeSettings('', 'REST');
  assert.equal(S.view(s, rest, inAt + 8 * 3600000).limit_hit, true, '約書旅滿 8 小時須離場');
  assert.equal(S.view({ ...s, items: [plan(0)] }, cfg, inAt + 600 * 60000).state, 'open', '會員入場不限時');
});

test('入場單號、在場人數、今日統計', () => {
  assert.equal(S.nextEntryNo(new Set(['E01', 'E02', 'Q1'])), 'E03');
  const day = '2026-11-15T05:00:00Z';
  const rows = [
    { items: [plan(240, { order_id: 'a' })], space: { headcount: 2, in_at: day, out_at: '2026-11-15T09:30:00Z' } },
    { items: [plan(240, { order_id: 'b' }), { line: 'o', space_role: 'overtime', price: 50, qty: 2, order_id: 'c' }], space: { headcount: 2, in_at: day, out_at: '2026-11-15T10:00:00Z' } },
    { items: [plan(720)], space: { headcount: 1, in_at: null } },
  ];
  assert.equal(S.occupancy(rows), 1);
  const sum = S.summary(rows, () => true);
  assert.equal(sum.entries, 2); assert.equal(sum.people, 4); assert.equal(sum.avg_stay_min, 285); assert.equal(sum.overtime_amount, 100); assert.equal(sum.plan_amount, 400);
});

test('菜單：等等空間方案（KK 11/15：4h 200、12h 500、超時 50、會員 0 元不限時），約書旅既有方案補時數', () => {
  const by = Object.fromEntries(S.STAY_ITEMS.map(it => [it.id, it]));
  assert.equal(by.m_stay_space_entry_4_hours.price, 200); assert.equal(by.m_stay_space_entry_4_hours.space_minutes, 240);
  assert.equal(by.m_stay_space_entry_12_hours.price, 500); assert.equal(by.m_stay_space_entry_12_hours.space_minutes, 720);
  assert.equal(by.m_stay_space_overtime_1_hour.price, 50); assert.equal(by.m_stay_space_overtime_1_hour.space_role, 'overtime');
  assert.equal(by.m_stay_space_member_entry.price, 0); assert.equal(by.m_stay_space_member_entry.space_minutes, 0);
  const items = [{ id: 'm_rest_space_quiet_room_4_hours', venue: 'REST', cat: 'QUIET', price: 750 }, { id: 'm_rest_space_quiet_room_overtime_1_hour', venue: 'REST', cat: 'QUIET', price: 150 }, { id: 'm_stay_space_entry_4_hours', venue: 'STAY', cat: 'SPACE', price: 180 }];
  const n = S.planBackfill(items, T.MenuLib.normalizeItem || (x => x));
  assert.equal(items[0].space_minutes, 240); assert.equal(items[0].price, 750, '價格不動'); assert.equal(items[1].space_role, 'overtime');
  assert.equal(items.find(x => x.id === 'm_stay_space_entry_4_hours').price, 180, '已存在的等等空間品項不覆寫');
  assert.equal(n, 2 + 3); assert.equal(S.planBackfill(items), 0, '再跑一次不重複');
});

test('MenuLib：STAY 是有效店別；空間分類保留 space_role／space_minutes，非空間分類剔除；行快照分鐘數', () => {
  const M = T.MenuLib;
  assert.ok(M.VENUES.includes('STAY')); assert.equal(M.VENUE_LABEL.STAY.zh, '等等空間');
  const doc = M.parseMenuDoc(JSON.stringify({ version: 1, items: [
    { id: 'a', venue: 'STAY', cat: 'SPACE', zh: '4h', price: 200, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
    { id: 'b', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 100, published: true, space_role: 'plan', space_minutes: 240 },
    { id: 'c', venue: 'STAY', cat: 'SPACE', zh: '超時', price: 50, published: true, pos_only: true, space_role: 'overtime', space_minutes: 60 },
  ] }));
  const [a, b, c] = doc.items;
  assert.equal(a.venue, 'STAY'); assert.equal(a.space_role, 'plan'); assert.equal(a.space_minutes, 240);
  assert.equal(b.space_role, undefined, '餐點不帶計時欄位'); assert.equal(c.space_role, 'overtime'); assert.equal(c.space_minutes, undefined);
  const menu = T.menuIndex(JSON.stringify(doc), 'STAY', { posOnly: true });
  const items = T.posAddLine([], menu, { item_id: 'a', qty: 2 });
  assert.equal(items[0].space_role, 'plan'); assert.equal(items[0].space_minutes, 240); assert.equal(items[0].venue, 'STAY');
  assert.equal(M.serviceCharge(items, { force: true }), null, '空間方案不收服務費');
  assert.deepEqual(require('../lib/pos-kitchen-print.js').jobsOf([{ id: 'to', status: 'paid', session_id: 's', items: [{ ...items[0], ticket: 'tk' }] }]), [], '空間方案不出餐單');
});

test('接線：server 路由、結帳開始計時、清桌擋在場、MCP 目錄、前端看板與設定頁', () => {
  const srv = read('server.js'), ops = read('public/pos-ops.js'), sp = read('public/pos-space.js'), set = read('public/pos-settings.js'), html = read('public/pos.html'), css = read('public/pos-space.css');
  for (const r of ["app.get('/api/admin/orders/space/settings'", "app.post('/api/admin/orders/space/settings',rateLimit({max:20}),auth,adminOnly,requireDb,superOrManagerPin", "app.post('/api/admin/orders/space/entries'", "app.post('/api/admin/orders/sessions/:id/space/extend'", "app.post('/api/admin/orders/sessions/:id/space/leave'", "app.post('/api/admin/orders/sessions/:id/space/resume'"]) assert.ok(srv.includes(r), r);
  assert.match(srv, /ADD COLUMN IF NOT EXISTS space JSONB/);
  assert.match(srv, /spaceStart=!!\(sp&&!sp\.in_at&&out\.lines\.some\(l=>l\.space_role==='plan'\)\)/, '收方案款開始計時');
  assert.match(srv, /客人還在場內，請先按「離場」/);
  assert.match(srv, /menu_space_plans_v1/);
  const cat = JSON.parse(read('lib/pos-mcp-catalog.json'));
  for (const k of ['POST /api/admin/orders/space/entries', 'POST /api/admin/orders/sessions/:id/space/leave', 'POST /api/admin/orders/space/settings']) assert.ok(cat[k], k);
  assert.match(html, /<script src="\/pos-space\.js"><\/script>/); assert.match(html, /pos-space\.css/);
  assert.match(ops, /if\(SPACE_ON\)host\.innerHTML=/); assert.match(ops, /bindSpaceBoard\(host,reload\);bindSpacePanel\(host,cur,reload\)/);
  assert.match(ops, /spaceAfterCheckout\(out,cur\)/);
  assert.match(sp, /function printSpaceEntry/); assert.match(sp, /\.\.\.spaceSlipExtras\(c, cat, info\)/, '入場單印 Wi-Fi／規則／祝福語（KK 11/17）'); assert.match(sp, /帳單夾交櫃台保管/); assert.match(sp, /PosEncouragement\.pick\(\)/); assert.match(sp, /kind: 'moji', scene: bless\.m, w: 104/, '入場單祝福語配 moji 插圖（KK 11/17）'); assert.match(ops, /cmd\.kind==='moji'/); assert.match(ops, /PosMoji\.draw\(g,cmd\.scene/); assert.match(sp, /c\.wifi_ssid/); assert.match(sp, /預計離場/); assert.match(sp, /入場時間/);
  assert.doesNotMatch(sp + css, /住宿|過夜|入住|床位/, '禁用字');
  assert.match(set, /spaceSettingsSection\(\)/); assert.match(set, /bindSpaceSettings\(host\)/);
  assert.match(css, /\.pos-space-mode #p-nav \[data-tab=serve\]\{display:none\}/);
  for (const m of css.matchAll(/font-size:\s*([\d.]+)rem/g)) assert.ok(Number(m[1]) >= 1, 'font-size ≥1rem：' + m[0]);
});
