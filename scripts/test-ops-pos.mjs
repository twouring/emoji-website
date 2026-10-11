// scripts/test-ops-pos.mjs — 餐飲營運純邏輯：櫃檯結帳、作廢、估清、暫停點餐、日結、訂位狀態機、分站、桌況
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');
const M = T.MenuLib;
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const DAY = M.businessDay();
const menuJson = JSON.stringify({ version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 180, emo: 150, published: true },
  { id: 'm_toast', venue: 'CAFE', cat: 'FOOD', zh: '吐司', price: 120, emo: 0, published: true },
  { id: 'm_gone', venue: 'CAFE', cat: 'DESSERT', zh: '可麗露', price: 80, published: true, sold_out: DAY },
  { id: 'm_old', venue: 'CAFE', cat: 'DESSERT', zh: '昨日估清', price: 80, published: true, sold_out: '2020-01-01' },
  { id: 'm_special', venue: 'CAFE', cat: 'FOOD', zh: '特餐', price: 260, published: true, available_from: '2099-01-01' },
  { id: 'm_beer', venue: 'BAR', cat: 'ALCOHOL', zh: '啤酒', price: 200, published: true },
] });
const G = 'guest0000001';
const cart = () => {
  const menu = T.menuIndex(menuJson);
  let items = T.addLine([], menu, { item_id: 'm_latte', qty: 2, by: 'A', guest: G });
  items = T.addLine(items, menu, { item_id: 'm_toast', qty: 1, by: 'B', guest: 'guest0000002' });
  return items;
};

test('營業日：凌晨 03:00 前算前一天；估清只在當個營業日生效，特餐供應期間外點不到', () => {
  assert.equal(M.businessDay('2026-10-12T02:59:00+08:00'), '2026-10-11');
  assert.equal(M.businessDay('2026-10-12T03:00:00+08:00'), '2026-10-12');
  const ids = [...T.menuIndex(menuJson).keys()];
  assert.ok(ids.includes('m_latte') && ids.includes('m_old'), '昨天估清的今天自動恢復');
  assert.ok(!ids.includes('m_gone'), '今日估清點不到');
  assert.ok(!ids.includes('m_special'), '供應期間未到點不到');
  assert.ok([...T.menuIndex(menuJson, undefined, { all: true }).keys()].includes('m_gone'), 'all 模式含估清（櫃檯重算價格用）');
  assert.throws(() => T.addLine([], T.menuIndex(menuJson), { item_id: 'm_gone', qty: 1, guest: G }), /售完/);
});

test('估清快速鍵只動單一品項的 sold_out，其他欄位與品項原樣保留；不得跨店別', () => {
  const next = JSON.parse(T.setSoldOut(menuJson, 'm_latte', true, ['CAFE']));
  assert.equal(next.items.find(x => x.id === 'm_latte').sold_out, DAY);
  assert.equal(next.items.find(x => x.id === 'm_latte').emo, 150);
  assert.equal(next.items.length, 6);
  assert.ok(next.updated_at);
  assert.equal(JSON.parse(T.setSoldOut(JSON.stringify(next), 'm_latte', false, null)).items.find(x => x.id === 'm_latte').sold_out, '');
  assert.throws(() => T.setSoldOut(menuJson, 'm_beer', true, ['CAFE']), e => e.status === 403);
  assert.throws(() => T.setSoldOut(menuJson, 'nope', true, null), e => e.status === 404);
});

test('暫停點餐：依店別存文案；非營業時段不擋；設定值經清理', () => {
  const json = T.setPause('', 'BAR', { paused: true, message: '今日最後點餐 22:30\x00' });
  assert.deepEqual(T.parsePause(json).BAR, { paused: true, message: '今日最後點餐 22:30' });
  assert.equal(T.parsePause(json).CAFE.paused, false);
  assert.equal(T.pauseFor(json, 'BAR'), '今日最後點餐 22:30');
  assert.equal(T.pauseFor(json, 'CAFE'), null);
  assert.equal(T.pauseFor(json, null), null);
  assert.equal(T.pauseFor(T.setPause(json, 'CAFE', { paused: true }), 'CAFE'), '目前暫停點餐，請洽櫃檯。');
  assert.equal(T.pauseFor('{bad json', 'BAR'), null);
  assert.throws(() => T.setPause('', 'XX', { paused: true }), e => e.status === 400);
});

test('櫃檯結帳：付款方式必選且不含 tappay；可分帳；會員價只套有設且較低的品項', () => {
  const items = cart();
  const menuAll = T.menuIndex(menuJson, undefined, { all: true });
  assert.throws(() => T.posCheckout(items, { method: 'tappay' }, menuAll), /付款方式/);
  assert.throws(() => T.posCheckout(items, {}, menuAll), /付款方式/);
  const all = T.posCheckout(items, { method: 'cash', staff: 'kk@emoji.tw' }, menuAll);
  assert.equal(all.amount, 480); assert.equal(all.lines.length, 2); assert.equal(all.payer.method, 'cash'); assert.equal(all.payer.member, false);
  const member = T.posCheckout(items, { method: 'linepay', member: true }, menuAll);
  assert.equal(member.amount, 150 * 2 + 120, '拿鐵套會員價、吐司沒設會員價維持原價');
  assert.equal(member.lines[0].regular_price, 180);
  const split = T.posCheckout(items, { method: 'card', lines: [items[1].line] }, menuAll);
  assert.equal(split.amount, 120); assert.equal(split.lines.length, 1);
  assert.throws(() => T.posCheckout(items.map(l => ({ ...l, order_id: 'to_x' })), { method: 'cash' }, menuAll), /沒有可結帳/);
  assert.equal(T.payMethod('transfer'), 'transfer');
  assert.deepEqual(Object.keys(T.PAY_METHODS), ['cash', 'card', 'linepay', 'transfer', 'tappay']);
});

test('櫃檯代客加菜：by 固定「櫃檯」、guest 固定；逐項作廢要原因、已結帳的不能作廢', () => {
  const menuAll = T.menuIndex(menuJson);
  const items = T.posAddLine([], menuAll, { item_id: 'm_toast', qty: 1, note: '不要蔥' });
  assert.equal(items[0].by, '櫃檯'); assert.equal(items[0].guest, T.POS_GUEST); assert.equal(items[0].note, '不要蔥');
  assert.throws(() => T.voidLine(items, items[0].line, ''), /原因/);
  assert.equal(T.voidLine(items, items[0].line, '客人改單').length, 0);
  assert.throws(() => T.voidLine(items.map(l => ({ ...l, order_id: 'to_1' })), items[0].line, 'x'), e => e.status === 409);
  assert.throws(() => T.voidLine(items, 'nope', 'x'), e => e.status === 404);
});

test('作廢出餐單：限當個營業日、不可重複、線上刷卡的要先退款', () => {
  const o = { id: 'to_1', status: 'paid', paid_at: new Date().toISOString(), tappay: {}, items: [] };
  assert.equal(T.voidOrder(o, ' 打錯單 '), '打錯單');
  assert.throws(() => T.voidOrder(o, ''), /原因/);
  assert.throws(() => T.voidOrder({ ...o, status: 'void' }, 'x'), e => e.status === 409);
  assert.throws(() => T.voidOrder({ ...o, paid_at: '2020-01-01T00:00:00Z' }, 'x'), /當個營業日/);
  assert.throws(() => T.voidOrder({ ...o, tappay: { rec_trade_id: 'R1' } }, 'x'), /TapPay/);
  assert.throws(() => T.voidOrder(null, 'x'), e => e.status === 404);
});

test('日結：依付款方式／時段／品項彙總，作廢不計營收；CSV 每品項一列；可依店別過濾', () => {
  const at = h => `2026-10-11T${String(h).padStart(2, '0')}:30:00+08:00`;
  const orders = [
    { id: 'a', table_no: 'A1', status: 'done', amount: 480, paid_at: at(10), payer: { method: 'cash' }, tappay: {}, items: [{ item_id: 'm_latte', venue: 'CAFE', zh: '拿鐵', price: 180, qty: 2 }, { item_id: 'm_toast', venue: 'CAFE', zh: '吐司', price: 120, qty: 1 }] },
    { id: 'b', table_no: 'A2', status: 'ready', amount: 150, paid_at: at(10), payer: { method: 'linepay', member: true }, tappay: {}, items: [{ item_id: 'm_latte', venue: 'CAFE', zh: '拿鐵', price: 150, qty: 1 }] },
    { id: 'c', table_no: 'B1', status: 'void', amount: 999, paid_at: at(12), payer: { method: 'cash' }, tappay: {}, void_reason: '打錯', items: [{ item_id: 'm_toast', venue: 'CAFE', zh: '吐司', price: 999, qty: 1 }] },
    { id: 'd', table_no: 'B2', status: 'done', amount: 200, paid_at: at(20), payer: {}, tappay: { rec_trade_id: 'R1' }, items: [{ item_id: 'm_beer', venue: 'BAR', zh: '啤酒', price: 200, qty: 1 }] },
  ];
  const s = T.salesSummary(orders, { now: at(10) });
  assert.equal(s.day, '2026-10-11'); assert.equal(s.amount, 830); assert.equal(s.orders, 3);
  assert.equal(s.voided, 1); assert.equal(s.void_amount, 999);
  assert.deepEqual(s.by_method, { cash: 480, linepay: 150, tappay: 200 });
  assert.deepEqual(s.by_hour, { '10': 630, '20': 200 });
  assert.deepEqual(s.items[0], { zh: '拿鐵', venue: 'CAFE', qty: 3, amount: 510 });
  const cafe = T.salesSummary(orders, { venues: ['CAFE'], now: at(10) });
  assert.equal(cafe.amount, 630); assert.equal(cafe.by_method.tappay, undefined);
  const csv = T.salesCsvRows(orders, { venues: ['BAR'] });
  assert.equal(csv.length, 2); assert.equal(csv[0][0], '營業日'); assert.equal(csv[1][3], '啤酒'); assert.equal(csv[1][7], '線上刷卡');
  assert.equal(T.salesCsvRows(orders).find(r => r[2] === 'B1')[9], '作廢');
});

test('出餐分站：飲品酒水在吧檯、餐點在廚房；桌況依未付與出餐單判定', () => {
  assert.equal(M.stationOf({ cat: 'COFFEE' }), 'bar'); assert.equal(M.stationOf({ cat: 'SAKE' }), 'bar'); assert.equal(M.stationOf({ cat: 'FOOD' }), 'kitchen');
  const o = { items: [{ cat: 'COFFEE', zh: '拿鐵' }, { cat: 'FOOD', zh: '吐司' }] };
  assert.deepEqual(T.splitByStation(o).bar.map(l => l.zh), ['拿鐵']);
  assert.deepEqual(T.splitByStation(o).kitchen.map(l => l.zh), ['吐司']);
  const s = { id: 'ts_1', items: cart() };
  assert.equal(T.tableStatus(s, []), 'open');
  const paid = { id: 'ts_1', items: s.items.map(l => ({ ...l, order_id: 'to_1' })) };
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_1', status: 'paid' }]), 'preparing');
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_1', status: 'ready' }]), 'ready');
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_other', status: 'ready' }]), 'idle');
  assert.equal(T.elapsedMin(Date.now() - 5 * 60000), 5);
});

test('訂位：依時段歸店別；狀態機；確認／婉拒才寄信且要有 Email', () => {
  assert.equal(T.reservationVenue('08:00'), 'CAFE'); assert.equal(T.reservationVenue('16:59'), 'CAFE'); assert.equal(T.reservationVenue('17:00'), 'BAR'); assert.equal(T.reservationVenue('00:30'), 'BAR');
  assert.equal(T.reservationTransition('new', 'confirmed'), 'confirmed');
  assert.equal(T.reservationTransition('confirmed', 'arrived'), 'arrived');
  assert.equal(T.reservationTransition('confirmed', 'no_show'), 'no_show');
  assert.throws(() => T.reservationTransition('new', 'arrived'), /待確認/);
  assert.throws(() => T.reservationTransition('arrived', 'cancelled'), e => e.status === 409);
  const r = { request_id: 'R1', name: '王小姐', email: 'a@b.c', reserve_date: '2026-11-01', reserve_time: '19:00', period: '晚餐', party_size: 4 };
  const ok = T.reservationReplyMail({ ...r, table_no: 'B2' }, 'confirmed', { origin: 'https://www.emoji.tw', staffNote: '靠窗' });
  assert.equal(ok.to, 'a@b.c'); assert.match(ok.subject, /訂位確認/); assert.match(ok.text, /B2/); assert.match(ok.text, /靠窗/);
  assert.match(T.reservationReplyMail(r, 'cancelled', { origin: 'x' }).subject, /無法安排/);
  assert.equal(T.reservationReplyMail(r, 'arrived', { origin: 'x' }), null);
  assert.equal(T.reservationReplyMail({ ...r, email: '' }, 'confirmed', { origin: 'x' }), null);
  assert.deepEqual(Object.keys(T.RESERVATION_LABEL), ['new', 'confirmed', 'arrived', 'no_show', 'cancelled']);
});

test('server.js 接線：客人加菜擋暫停與估清、櫃檯端點、清桌不漏收、訂位 Email、日結', () => {
  const server = read('server.js');
  assert.match(server, /app\.post\('\/api\/orders\/:id\/items'[\s\S]{0,200}assertNotPaused\(\)/);
  assert.match(server, /app\.get\('\/api\/orders\/pause'/);
  assert.match(server, /app\.post\('\/api\/admin\/orders\/sessions\/:id\/checkout'/);
  assert.match(server, /app\.post\('\/api\/admin\/orders\/:id\/void'/);
  assert.match(server, /app\.post\('\/api\/admin\/menu\/sold-out'/);
  assert.match(server, /app\.post\('\/api\/admin\/orders\/pause'/);
  assert.match(server, /app\.get\('\/api\/admin\/sales'/);
  assert.match(server, /app\.get\('\/api\/admin\/reservations'/);
  assert.match(server, /app\.post\('\/api\/admin\/reservations\/:id\/status'/);
  assert.match(server, /ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS void_reason/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS email/);
  assert.match(server, /'new','confirmed','arrived','cancelled','no_show'/);
  assert.match(server, /請先到櫃檯結帳或逐項作廢/, '清桌時有未結帳品項要擋');
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\)/, '餐飲子帳號可用新端點');
  assert.match(read('lib/security.js'), /'ordering_pause'/, '暫停點餐設定要能公開讀取');
  assert.doesNotMatch(server, /言文字根帳號/);
});

test('後台與客人端接線：新分頁、估清快速鍵、暫停點餐、訂位 Email 欄位', () => {
  const admin = read('public/admin.html'), ops = read('public/pos-ops.js'), order = read('public/order.html'), reserve = read('public/reserve.html'), reserveJs = read('public/reserve.js');
  assert.match(admin, /CAFE:\['pos','orders','reservations','sales','menu'\]/);
  assert.match(admin, /BAR:\['pos','orders','reservations','sales','menu'\]/);
  // 餐飲營運畫面抽成 /pos-ops.js，後台與平板 POS（pos.emoji.tw）共用
  assert.match(admin, /<script src="\/pos-ops\.js"><\/script>/); assert.match(admin, /<link rel="stylesheet" href="\/pos-ops\.css">/);
  for (const fn of ['loadPos', 'loadOrders', 'loadReservations', 'loadSales', 'loadSoldOut', 'printOrder', 'paintPos']) { assert.match(ops, new RegExp(`function ${fn}\\(`), fn); assert.doesNotMatch(admin, new RegExp(`function ${fn}\\(`), fn + ' 不應殘留在 admin.html'); }
  assert.match(admin, /data-mi-soldout=/); assert.match(admin, /\/admin\/menu\/sold-out/);
  assert.match(ops, /data-pause-venue=/); assert.match(ops, /\/admin\/orders\/pause/);
  assert.match(ops, /sessions\/'\+cur\.id\+'\/checkout/);
  assert.match(ops, /downloadCSV\(`日結_/);
  assert.match(admin, /id="mi-from" type="date"/);
  assert.doesNotMatch(admin, /言文字根帳號|根後台/);
  assert.match(order, /MenuLib\.orderableOnly\(MENU_DOC\)/, '客人端只列可點品項');
  assert.match(order, /api\('\/orders\/pause'\)/);
  assert.match(order, /err\.status===423/);
  assert.match(reserve, /name="email" type="email"/);
  assert.match(reserveJs, /email:val\('email'\)/);
});
