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
  assert.equal(member.amount, 150 * 2 + 108, '拿鐵用設定的會員價 150、吐司沒設會員價＝九折 108');
  assert.equal(member.lines[0].regular_price, 180);
  const split = T.posCheckout(items, { method: 'card', lines: [items[1].line] }, menuAll);
  assert.equal(split.amount, 120); assert.equal(split.lines.length, 1);
  assert.throws(() => T.posCheckout(items.map(l => ({ ...l, order_id: 'to_x' })), { method: 'cash' }, menuAll), /沒有可結帳/);
  assert.equal(T.payMethod('transfer'), 'transfer');
  assert.deepEqual(Object.keys(T.PAY_METHODS), ['cash', 'card', 'linepay', 'transfer', 'taishin', 'other', 'tappay']);
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

test('取消單一品項：單價歸零、原價留底、從單上金額扣除；限當個營業日、不可對最後一項／線上刷卡／已開發票的單動手', () => {
  const twoItems = [
    { line: 'l1', zh: '拿鐵', price: 180, qty: 2 },
    { line: 'l2', zh: '吐司', price: 120, qty: 1 },
  ];
  const o = { id: 'to_1', status: 'paid', paid_at: new Date().toISOString(), amount: 480, tappay: {}, invoice: {}, items: twoItems };
  const out = T.voidOrderLine(o, 'l2', ' 客人不要了 ');
  assert.equal(out.reason, '客人不要了');
  assert.equal(out.refund, 120);
  assert.equal(out.amount, 360);
  const cancelled = out.items.find(l => l.line === 'l2');
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.price, 0); assert.equal(cancelled.regular_price, 120); assert.equal(cancelled.cancel_reason, '客人不要了');
  assert.equal(out.items.find(l => l.line === 'l1').price, 180); // 其他品項不受影響
  assert.throws(() => T.voidOrderLine(o, 'l2', ''), /原因/);
  assert.throws(() => T.voidOrderLine(o, 'nope', 'x'), e => e.status === 404);
  assert.throws(() => T.voidOrderLine({ ...o, items: out.items }, 'l2', 'x'), /已取消/); // 不可重複取消同一項
  assert.throws(() => T.voidOrderLine({ ...o, items: [twoItems[0]] }, 'l1', 'x'), /最後一項/); // 只剩一項未取消時擋下，請改走作廢整張單
  assert.throws(() => T.voidOrderLine({ ...o, status: 'void' }, 'l1', 'x'), e => e.status === 409);
  assert.throws(() => T.voidOrderLine({ ...o, tappay: { rec_trade_id: 'R1' } }, 'l1', 'x'), /TapPay/);
  assert.throws(() => T.voidOrderLine({ ...o, invoice: { status: 'issued' } }, 'l1', 'x'), /發票/);
  assert.throws(() => T.voidOrderLine({ ...o, paid_at: '2020-01-01T00:00:00Z' }, 'l1', 'x'), /當個營業日/);
  assert.throws(() => T.voidOrderLine(null, 'l1', 'x'), e => e.status === 404);
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
  assert.equal(csv.length, 2); assert.equal(csv[0][0], '營業日'); assert.equal(csv[0][9], '發票狀態'); assert.equal(csv[0][10], '發票號碼'); assert.equal(csv[1][3], '啤酒'); assert.equal(csv[1][7], '線上刷卡');
  assert.equal(T.salesCsvRows(orders).find(r => r[2] === 'B1')[11], '作廢');
});

test('出餐分站：飲品酒水在吧檯、餐點在廚房；桌況依未付與出餐單判定', () => {
  assert.equal(M.stationOf({ cat: 'COFFEE' }), 'bar'); assert.equal(M.stationOf({ cat: 'SAKE' }), 'bar'); assert.equal(M.stationOf({ cat: 'FOOD' }), 'kitchen');
  const o = { items: [{ cat: 'COFFEE', zh: '拿鐵' }, { cat: 'FOOD', zh: '吐司' }] };
  assert.deepEqual(T.splitByStation(o).bar.map(l => l.zh), ['拿鐵']);
  assert.deepEqual(T.splitByStation(o).kitchen.map(l => l.zh), ['吐司']);
  const s = { id: 'ts_1', items: cart() };
  assert.equal(T.tableStatus({ id: 'ts_0', items: [] }, []), 'empty', '櫃檯剛開桌還沒點＝已開桌');
  assert.equal(T.tableStatus(s, []), 'open');
  const paid = { id: 'ts_1', items: s.items.map(l => ({ ...l, order_id: 'to_1' })) };
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_1', status: 'paid' }]), 'preparing');
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_1', status: 'ready' }]), 'ready');
  assert.equal(T.tableStatus(paid, [{ session_id: 'ts_other', status: 'ready' }]), 'idle');
  assert.equal(T.elapsedMin(Date.now() - 5 * 60000), 5);
});

test('櫃檯開桌／外帶：空桌子帳號看得到也清得掉；外帶取 W01–W99 最小空號、結完取完自動收掉；內用桌不自動收', () => {
  const cafe = ['CAFE'];
  assert.equal(T.orderVisibleToVenues({ items: [] }, cafe), true, '剛開的空桌每家店都看得到');
  assert.equal(T.sessionClosableByVenues({ items: [] }, cafe), true, '開錯桌可以直接清掉');
  assert.equal(T.sessionClosableByVenues({ items: [{ venue: 'BAR' }] }, cafe), false);
  assert.equal(T.isTakeout('W01'), true); assert.equal(T.isTakeout('W1'), false); assert.equal(T.isTakeout('A1'), false);
  assert.equal(T.nextTakeoutTable(new Set()), 'W01');
  assert.equal(T.nextTakeoutTable(new Set(['W01', 'W02', 'W04'])), 'W03', '取最小空號');
  assert.equal(T.nextTakeoutTable(new Set(Array.from({ length: 99 }, (_, i) => 'W' + String(i + 1).padStart(2, '0')))), null);
  const paidItems = cart().map(l => ({ ...l, order_id: 'to_1' }));
  assert.equal(T.takeoutFinished({ id: 'ts_w', items: [] }, []), false, '還沒點東西不能收');
  assert.equal(T.takeoutFinished({ id: 'ts_w', items: cart() }, []), false, '有未結帳不能收');
  assert.equal(T.takeoutFinished({ id: 'ts_w', items: paidItems }, [{ session_id: 'ts_w', status: 'paid' }]), false, '餐還沒做好不能收');
  assert.equal(T.takeoutFinished({ id: 'ts_w', items: paidItems }, [{ session_id: 'ts_w', status: 'ready' }]), false, '客人還沒取餐不能收');
  assert.equal(T.takeoutFinished({ id: 'ts_w', items: paidItems }, [{ session_id: 'ts_other', status: 'ready' }]), true, '結完、取完就收');
});

test('櫃檯登記訂位：Email 可空、30 分鐘內時段可登；客人自助仍照舊規則', () => {
  const R = require('../lib/reservations');
  const now = new Date('2026-10-11T18:00:00+08:00');
  const base = { date: '2026-10-11', time: '18:00', party_size: 3, name: '陳先生', phone: '0912-000-111' };
  assert.throws(() => R.normalizeReservation({ ...base, time: '20:00' }, now), /Email/, '客人端 Email 必填');
  assert.throws(() => R.normalizeReservation({ ...base, email: 'a@b.co' }, now), /已經過了/, '客人端擋 30 分鐘內');
  const staff = R.normalizeReservation(base, now, { staff: true });
  assert.equal(staff.email, ''); assert.equal(staff.period, '三點水');
  assert.throws(() => R.normalizeReservation({ ...base, email: 'not-mail' }, now, { staff: true }), /Email/, '櫃檯有填就要正確');
  assert.throws(() => R.normalizeReservation({ ...base, time: '18:15' }, now, { staff: true }), /時段/, '櫃檯也只能選 30 分鐘格');
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
  assert.match(server, /app\.post\('\/api\/admin\/orders\/sessions',auth,adminOnly/, '櫃檯開桌／外帶');
  assert.match(server, /app\.post\('\/api\/admin\/reservations',auth,adminOnly/, '櫃檯登記訂位');
  assert.match(server, /normalizeReservation\(\{\.\.\.req\.body,lang:'zh',source:'pos'\},new Date\(\),\{staff:true\}\)/);
  assert.match(server, /if\(r\.email\)sendMailQuietly/, '櫃檯登記沒 Email 不寄信');
  assert.match(server, /tableOrders\.takeoutFinished\(s,live\)/, '外帶單自動收掉');
  assert.match(server, /app\.post\('\/api\/auth\/renew',auth,requireDb/, 'POS 續期');
  assert.match(server, /ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS void_reason/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS email/);
  assert.match(server, /'new','confirmed','arrived','cancelled','no_show'/);
  assert.match(server, /請先到櫃檯結帳或逐項作廢/, '清桌時有未結帳品項要擋');
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|analytics\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\|yan\|reservation-hours\|inventory\)/, '餐飲子帳號可用新端點');
  assert.match(read('lib/security.js'), /'ordering_pause'/, '暫停點餐設定要能公開讀取');
  assert.doesNotMatch(server, /言文字根帳號/);
});

test('後台與客人端接線：新分頁、估清快速鍵、暫停點餐、訂位 Email 欄位', () => {
  const admin = read('public/admin.html'), ops = read('public/pos-ops.js'), order = read('public/order.html'), reserve = read('public/reserve.html'), reserveJs = read('public/reserve.js');
  // 2026-10 起：後台品牌工作區只留日結報表，櫃檯結帳／點餐出餐／訂位／查單記錄等現場操作全部搬到 pos.emoji.tw
  assert.match(admin, /BRAND_TABS = \{ CAFE:\['sales','staff'\], BAR:\['sales','staff'\] \}/);
  assert.match(admin, /\{ id:'history',\s+label:'查單',\s+render:tabHistory \}/); assert.match(admin, /if \(tab === 'history'\) \{ loadHistory\(\); return; \}/);
  // 餐飲營運畫面抽成 /pos-ops.js，後台與平板 POS（pos.emoji.tw）共用
  assert.match(admin, /<script src="\/pos-ops\.js"><\/script>/); assert.match(admin, /<link rel="stylesheet" href="\/pos-ops\.css">/);
  for (const fn of ['loadPos', 'loadOrders', 'loadReservations', 'loadSales', 'loadSoldOut', 'loadHistory', 'printOrder', 'printReceipt', 'paintPos']) { assert.match(ops, new RegExp(`function ${fn}\\(`), fn); assert.doesNotMatch(admin, new RegExp(`function ${fn}\\(`), fn + ' 不應殘留在 admin.html'); }
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

test('櫃檯改品項：數量 1–20、贈送要原因且單價歸 0、取消贈送還原；已結帳不可改', () => {
  const items = cart();
  const q3 = T.editLine(items, items[0].line, { qty: 3 });
  assert.equal(q3[0].qty, 3); assert.equal(q3[1].qty, 1, '其他列不動');
  assert.throws(() => T.editLine(items, items[0].line, { qty: 0 }), /1–20/);
  assert.throws(() => T.editLine(items, items[0].line, { qty: 21 }), /1–20/);
  assert.throws(() => T.editLine(items, items[0].line, { qty: 1.5 }), /1–20/);
  assert.throws(() => T.editLine(items, items[0].line, { free: true, reason: '' }), /贈送原因/);
  const comp = T.editLine(items, items[0].line, { free: true, reason: '生日' });
  assert.equal(comp[0].price, 0); assert.equal(comp[0].regular_price, 180); assert.equal(comp[0].comp_reason, '生日');
  assert.equal(T.sum(T.unpaid(comp)), 120, '贈送後只剩吐司的錢');
  const back = T.editLine(comp, items[0].line, { free: false });
  assert.equal(back[0].price, 180); assert.equal(back[0].regular_price, undefined); assert.equal(back[0].comp_reason, undefined);
  assert.throws(() => T.editLine(items.map(l => ({ ...l, order_id: 'to_1' })), items[0].line, { qty: 2 }), e => e.status === 409);
  assert.throws(() => T.editLine(items, 'nope', { qty: 2 }), e => e.status === 404);
});

test('櫃檯改品項：任何品項都能補／改／清除備註，不限加點當下；可與改數量同時送', () => {
  const items = cart();
  const noted = T.editLine(items, items[0].line, { note: '不要冰' });
  assert.equal(noted[0].note, '不要冰'); assert.equal(noted[1].note, '', '其他列不動');
  const cleared = T.editLine(noted, items[0].line, { note: '' });
  assert.equal(cleared[0].note, '', '留空＝清除備註');
  const both = T.editLine(items, items[0].line, { qty: 3, note: '少冰少糖' });
  assert.equal(both[0].qty, 3); assert.equal(both[0].note, '少冰少糖');
});

test('整單折扣與現金找零：％四捨五入、金額不超過小計、原因必填；會員價→折扣→應收；實收不足擋', () => {
  const items = cart(), menuAll = T.menuIndex(menuJson, undefined, { all: true });
  assert.equal(T.discountOf({}, 480), null);
  assert.deepEqual(T.discountOf({ discount: { type: 'percent', value: 10, reason: '熟客' } }, 485), { type: 'percent', value: 10, amount: 49, reason: '熟客' }, '48.5 四捨五入成 49');
  assert.deepEqual(T.discountOf({ discount: { type: 'amount', value: 50, reason: '萬聖' } }, 480).amount, 50);
  assert.throws(() => T.discountOf({ discount: { type: 'amount', value: 500, reason: 'x' } }, 480), /不可超過小計/);
  assert.throws(() => T.discountOf({ discount: { type: 'percent', value: 101, reason: 'x' } }, 480), /1–100/);
  assert.throws(() => T.discountOf({ discount: { type: 'percent', value: 10 } }, 480), /折扣原因/);
  assert.throws(() => T.discountOf({ discount: { type: 'bogus', value: 10, reason: 'x' } }, 480), /類型/);
  const out = T.posCheckout(items, { method: 'cash', member: true, discount: { type: 'percent', value: 10, reason: '熟客' }, received: 500 }, menuAll);
  assert.equal(out.subtotal, 408, '先套會員價 150×2+108'); assert.equal(out.discount.amount, 41); assert.equal(out.amount, 367);
  assert.equal(out.payer.received, 500); assert.equal(out.payer.change, 133); assert.deepEqual(out.payer.discount, { type: 'percent', value: 10, amount: 41, reason: '熟客' });
  assert.throws(() => T.posCheckout(items, { method: 'cash', received: 100 }, menuAll), /實收/);
  const card = T.posCheckout(items, { method: 'card', received: 1000 }, menuAll);
  assert.equal(card.payer.received, undefined, '非現金不記實收');
  const comp = T.editLine(items, items[0].line, { free: true, reason: '招待' });
  assert.equal(T.posCheckout(comp, { method: 'cash', member: true }, menuAll).amount, 108, '贈送的品項套會員價也還是 0；吐司九折 108');
});

test('換桌併桌：併桌把來源品項接到目標後面', () => {
  const a = cart(), b = T.posAddLine([], T.menuIndex(menuJson), { item_id: 'm_toast', qty: 1 });
  assert.equal(T.mergeItems(b, a).length, 3); assert.equal(T.mergeItems(b, a)[0].item_id, 'm_toast');
  assert.deepEqual(T.mergeItems(null, a), a);
  assert.equal(T.shiftClose, undefined, '舊交班結算已由開關帳取代');
});

test('日結含折扣與贈送：營收為折後實收、折扣與贈送另列；CSV 折扣為負數列', () => {
  const at = h => `2026-10-11T${String(h).padStart(2, '0')}:30:00+08:00`;
  const orders = [
    { id: 'a', table_no: 'A1', status: 'done', amount: 378, paid_at: at(10), payer: { method: 'cash', member: true, discount: { type: 'percent', value: 10, amount: 42, reason: '熟客' }, received: 500, change: 122 }, tappay: {}, items: [{ item_id: 'm_latte', venue: 'CAFE', zh: '拿鐵', price: 150, qty: 2 }, { item_id: 'm_toast', venue: 'CAFE', zh: '吐司', price: 120, qty: 1 }] },
    { id: 'b', table_no: 'A2', status: 'done', amount: 120, paid_at: at(11), payer: { method: 'cash' }, tappay: {}, items: [{ item_id: 'm_latte', venue: 'CAFE', zh: '拿鐵', price: 0, qty: 1, regular_price: 180, comp_reason: '招待' }, { item_id: 'm_toast', venue: 'CAFE', zh: '吐司', price: 120, qty: 1 }] },
  ];
  const s = T.salesSummary(orders, { now: at(10) });
  assert.equal(s.amount, 498); assert.equal(s.discount_amount, 42); assert.equal(s.discount_count, 1); assert.equal(s.comp_count, 1);
  assert.equal(s.by_method.cash, 498);
  const csv = T.salesCsvRows(orders);
  const disc = csv.find(r => String(r[3]).startsWith('折扣'));
  assert.ok(disc, '折扣另列一列'); assert.equal(disc[6], -42); assert.match(disc[3], /10％：熟客/);
  assert.equal(csv.slice(1).reduce((a, r) => a + Number(r[6]), 0), 498, '小計欄加總＝營收');
  assert.match(csv.find(r => r[2] === 'A2' && r[6] === 0)[3], /贈送：招待/);
});

test('桌邊送單：送出後進看板、客人不能自己刪；出餐後從看板消失；桌況「待出餐」；全部出餐過的結帳直接記已取餐', () => {
  const items = cart(), menu = T.menuIndex(menuJson);
  const placed = T.placeLines(items, new Date('2026-10-13T04:00:00Z'));
  assert.equal(placed.lines.length, items.length, '整桌還沒送的一起送');
  assert.ok(placed.items.every(l => l.placed_at === '2026-10-13T04:00:00.000Z' && l.ticket === placed.ticket));
  assert.throws(() => T.placeLines(placed.items), e => e.status === 400, '沒有新品項不能再送');
  assert.throws(() => T.removeLine(placed.items, placed.items[0].line, G), /已送出/, '送出後客人不能自己移除（找櫃檯作廢）');
  const s = { id: 'ts_1', table_no: 'A1', items: placed.items };
  const tickets = T.ticketsOf(s);
  assert.equal(tickets.length, 1); assert.equal(tickets[0].status, 'placed'); assert.equal(tickets[0].table_no, 'A1'); assert.equal(tickets[0].id, placed.ticket);
  assert.equal(tickets[0].amount, T.sum(items)); assert.ok(tickets[0].stations.bar.some(l => l.zh === '拿鐵'), '看板分站');
  assert.equal(T.tableStatus(s, []), 'ordered');
  // 第二輪加點只送新加的；看板兩張
  const more = T.addLine(placed.items, menu, { item_id: 'm_toast', qty: 1, by: 'C', guest: 'guest0000003' });
  const second = T.placeLines(more);
  assert.equal(second.lines.length, 1); assert.notEqual(second.ticket, placed.ticket);
  assert.equal(T.ticketsOf({ id: 'ts_1', table_no: 'A1', items: second.items }).length, 2);
  // 部分出餐：第一張送單只先出第一道 → 送單還留在看板、該行劃線（served_at）、served/partial 標好
  const firstLine = placed.lines[0].line;
  const part = T.serveTicket(second.items, placed.ticket, undefined, [firstLine]);
  assert.ok(part.find(l => l.line === firstLine).served_at, '點名的那道標已出');
  assert.ok(placed.lines.slice(1).every(x => !part.find(l => l.line === x.line).served_at), '其他道還沒出');
  const partTickets = T.ticketsOf({ id: 'ts_1', table_no: 'A1', items: part });
  assert.equal(partTickets.length, 2, '部分出餐的送單仍在看板');
  const pt = partTickets.find(t => t.id === placed.ticket);
  assert.equal(pt.served, 1); assert.equal(pt.partial, true); assert.equal(pt.items.length, placed.lines.length, '已出的行一起回，看板才能劃線');
  assert.throws(() => T.serveTicket(part, placed.ticket, undefined, [firstLine]), e => e.status === 404, '同一道不能出兩次');
  assert.throws(() => T.serveTicket(part, placed.ticket, undefined, ['nope']), e => e.status === 404, '行不在這張送單');
  // 整筆出餐：沒給 lines ＝ 剩下的全部標；全部出完才從看板消失；重複出或不存在回 404
  const served = T.serveTicket(part, placed.ticket);
  assert.equal(T.ticketsOf({ id: 'ts_1', table_no: 'A1', items: served }).length, 1);
  assert.throws(() => T.serveTicket(served, placed.ticket), e => e.status === 404);
  assert.throws(() => T.serveTicket(served, 'nope'), e => e.status === 404);
  const all = T.serveTicket(served, second.ticket);
  assert.equal(T.tableStatus({ id: 'ts_1', items: all }, []), 'open', '全部出餐但未結帳＝點餐中（可再加點）');
  assert.ok(T.posCheckout(all, { method: 'cash' }, menu).lines.every(l => l.served_at), '結帳保留出餐記號給 server 判定直接已取餐');
  assert.ok(T.orderOwnedByVenues(tickets[0], ['CAFE']) && !T.orderOwnedByVenues(tickets[0], ['BAR']), '子帳號只看自己品牌的送單');
});

test('server.js／前端接線：桌邊送單端點、看板含送單、客人端送出按鈕、三語文案', () => {
  const server = read('server.js'), ops = read('public/pos-ops.js'), order = read('public/order.html'), lib = read('public/order-lib.js'), api = read('docs/API.md');
  assert.match(server, /app\.post\('\/api\/orders\/:id\/place'[\s\S]{0,200}assertNotPaused\(\)/, '最後點餐後不能再送單');
  assert.match(server, /app\.post\('\/api\/admin\/orders\/sessions\/:id\/tickets\/:ticket\/serve'/);
  assert.match(server, /tableOrders\.ticketsOf\(s\)/, '看板回送單');
  assert.match(server, /served\?'done':'paid'/, '全部出餐過的結帳直接記已取餐');
  for (const s of ['data-serve=', 'data-serve-line=', "'/serve'", 'd.tickets', 'ops-placed', 'ordered:[', "placed:'待出餐'", '整筆出餐', 'line-served', '部分出餐']) assert.ok(ops.includes(s), s);
  assert.match(server, /req\.body\?\.lines/, '出餐端點接受 lines（品項層級）');
  for (const s of ['id="bar-place"', "'/place'", 'data-i18n="place"', 'id="cart-place"', 'id="pay-reminder"']) assert.ok(order.includes(s), s);
  for (const lang of ['zh', 'en', 'ja']) { assert.match(lib, new RegExp(lang + ": \\{[\\s\\S]*?place: '"), lang); assert.match(lib, new RegExp(lang + ": \\{[\\s\\S]*?pay_reminder: '"), lang + ' 結帳提醒'); }
  assert.match(api, /### POST \/api\/orders\/:id\/place/); assert.match(api, /tickets\/:ticket\/serve/);
});

test('server.js 接線：改品項、換桌、查單、結帳回找零；交班結算已移除；作廢退回時贈送維持贈送', () => {
  const server = read('server.js'), ops = read('public/pos-ops.js'), api = read('docs/API.md');
  assert.match(server, /app\.patch\('\/api\/admin\/orders\/sessions\/:id\/items\/:line'/);
  assert.match(server, /app\.post\('\/api\/admin\/orders\/sessions\/:id\/move'/);
  assert.match(server, /app\.get\('\/api\/admin\/orders\/history'/);
  assert.doesNotMatch(server, /shift-close/, '舊交班結算 API 已移除（由開關帳取代）');
  assert.doesNotMatch(ops, /交班結算|shift-close/, '日結頁不再有交班區');
  assert.doesNotMatch(api, /### POST \/api\/admin\/sales\/shift-close/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_shift_closes/, '舊表保留');
  // 開關帳：品牌 × 營業日一本；結帳前檢查；只有超管能重開
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_registers/); assert.match(server, /CREATE TABLE IF NOT EXISTS pos_cash_moves/);
  assert.equal((server.match(/CREATE TABLE IF NOT EXISTS pos_registers/g) || []).length, 1, '建表不可重複');
  for (const r of ["app.get('/api/admin/registers'", "app.post('/api/admin/registers/open'", "app.get('/api/admin/registers/:id'", "app.post('/api/admin/registers/:id/cash'", "app.post('/api/admin/registers/:id/count'", "app.post('/api/admin/registers/:id/close'", "app.post('/api/admin/registers/:id/reopen',auth,adminOnly,superOnly"]) assert.ok(server.includes(r), r);
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_register_counts/, '小結點驗留痕表');
  assert.match(server, /ADD COLUMN IF NOT EXISTS opening_denominations JSONB/, '開帳面額欄位要有 ALTER 給既有 DB');
  assert.match(server, /posRegister\.checkoutAllowed\(out\.lines/, '結帳前檢查帳本');
  assert.match(server, /pos_registers_open_idx ON pos_registers\(day,venue\) WHERE closed_at IS NULL/, '同品牌同日只能一本開著（部分唯一索引，關帳後可重開）');
  assert.match(server, /pos_registers_open_day_idx ON pos_registers\(day\) WHERE closed_at IS NULL/, '共用抽屜帳：同日不分品牌只能一本開著（DB 兜底）');
  assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$1\)\)`,\['register:'\+day\]\)/, '開帳鎖整個營業日，不是鎖品牌');
  assert.match(server, /FROM pos_registers WHERE day=\$1 AND closed_at IS NULL ORDER BY opened_at LIMIT 1',\[day\]/, '開帳前查的是當日任何品牌開著的帳');
  assert.match(server, /FROM pos_registers WHERE day=\$1 AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1',\[day\]/, '承接上一本關帳的留存金');
  assert.match(server, /posRegister\.openRegister\(req\.body,\{venue,open,handover\}\)/);
  assert.match(server, /\.\.\.posRegister\.registerOverview\(all\)/, '帳本列表附全店總覽（open_venue/handover/can_open/wait）');
  assert.match(server, /FROM pos_registers WHERE day=\$1 AND closed_at IS NULL ORDER BY opened_at LIMIT 1',\[r\.day\]/, '重開補單也要看全店有沒有開著的帳');
  for (const s of ['const regWait=', 'regWaitChip(v)', 'regDefaultCash()', 'REG_DATA?.handover', '等${esc(regWait(v))}關帳', '共用同一個抽屜帳']) assert.ok(ops.includes(s), '前端共用抽屜帳：' + s);
  assert.match(server, /received:out\.payer\.received,change:out\.payer\.change/);
  assert.match(server, /l\.comp_reason\|\|l\.app_redeem\?\{\.\.\.l,order_id:null\}/, '作廢退回未結帳時贈送品項維持贈送');
  assert.match(server, /storeInvoiceResult\(\{id:orderId,table_no:s\.table_no,items:orderLines,amount:out\.amount,discount:out\.discount\}/, '發票帶折扣');
  assert.match(server, /app\.get\(\['\/pos', '\/pos\/\*'\]/);
  for (const s of ['data-qty=', 'data-comp=', 'pos-disc-apply', 'pos-received', 'data-received=', 'data-receipt=', '/admin/orders/history', "'/move'", 'data-cat=', 'data-add=', '/admin/registers/open', 'data-reg-open=', 'data-reg-close=', 'data-reg-cash=', 'data-reg-count=', 'data-denom=', 'function openRegisterForm(', 'reg-open-total', 'reg-count-total', "'/count'", 'function printRegisterReport(', "'/reopen'"]) assert.ok(ops.includes(s), s);
  assert.ok(!/\bprompt\(`\$\{BRAND_LABEL\[venue\]/.test(ops), '開帳不再用 prompt，改面額／總額表單');
  assert.match(api, /### POST \/api\/admin\/registers\/open/); assert.match(api, /### POST \/api\/admin\/registers\/:id\/close/);
  assert.doesNotMatch(ops, /id="pos-item"|id="pos-qty"/, '下拉選單加菜已換成點選菜單磁貼');
  assert.match(api, /### GET \/api\/admin\/orders\/history/);
});
