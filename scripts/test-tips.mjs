// 打賞：純邏輯（lib/tips.js）＋接線靜態檢查（客人頁、POS、服務費／低消／出餐排除、API 文件、操作紀錄）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tips = require('../lib/tips.js');
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const tableOrders = require('../lib/table-orders.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('設定：預設關閉；快捷金額去重排序、不超過上限；patch 擋壞值', () => {
  const d = tips.normalizeSettings('');
  assert.equal(d.enabled, false); assert.deepEqual(d.presets, [100, 200, 500]); assert.equal(d.max, 10000);
  const s = tips.patchSettings(d, { enabled: true, performer: ' 小安 ', presets: '500, 100，100 300', max: 2000 });
  assert.deepEqual(s, { enabled: true, performer: '小安', presets: [100, 300, 500], max: 2000 });
  assert.throws(() => tips.patchSettings(d, { presets: '100, abc' }), /快捷金額/);
  assert.throws(() => tips.patchSettings(d, { max: 0 }), /單筆上限/);
  assert.throws(() => tips.patchSettings(s, { presets: [3000] }), /快捷金額/);
});

test('客人金額：整數 1–上限；音效不在白名單改掌聲', () => {
  const s = tips.normalizeSettings({ enabled: true, max: 1000 });
  assert.deepEqual(tips.parseTip({ amount: 168, sfx: 'kiss' }, s), { amount: 168, sfx: 'kiss' });
  assert.equal(tips.parseTip({ amount: '50', sfx: '../etc' }, s).sfx, 'applause');
  for (const a of [0, -5, 1.5, 1001, '', null, 'abc', true]) assert.throws(() => tips.parseTip({ amount: a }, s), /打賞金額/);
  for (const id of tips.SOUND_IDS) assert.ok(fs.existsSync(new URL('../public/sfx/' + id + '.mp3', import.meta.url)), id + '.mp3 存在');
});

test('桌上那一行：已送出已完成、cat TIP、帶表演者與音效', () => {
  const l = tips.tipLine({ amount: 200, sfx: 'cheer', performer: '小安', venue: 'BAR', guest: 'abc12345', by: '阿明' });
  assert.equal(l.cat, 'TIP'); assert.equal(l.item_id, 'tip'); assert.equal(l.price, 200); assert.equal(l.qty, 1);
  assert.ok(l.placed_at && l.served_at); assert.equal(l.order_id, null);
  assert.equal(l.zh, '打賞｜小安'); assert.equal(l.tip.sfx, 'cheer'); assert.equal(l.tip.performer, '小安'); assert.match(l.tip.id, /^tp_/);
});

test('打賞不算服務費、不上出餐單；日結另列且不進熱銷', () => {
  const now = Date.parse('2026-11-02T13:00:00Z');
  const food = { line: 'a', item_id: 'x', venue: 'BAR', cat: 'BEER', zh: '啤酒', price: 200, qty: 1 };
  const tip = tips.tipLine({ amount: 500, sfx: 'wow', performer: '小安', venue: 'BAR', guest: 'g', by: 'b' });
  assert.equal(MenuLib.serviceCharge([food, tip], { now }).amount, 20);
  assert.equal(MenuLib.serviceCharge([tip], { now }), null);
  const st = tableOrders.splitByStation({ items: [food, tip] });
  assert.equal(st.bar.length + st.kitchen.length, 1);
  const sum = tableOrders.salesSummary([{ id: 'o1', status: 'paid', amount: 720, paid_at: new Date(now).toISOString(), items: [food, tip], payer: { method: 'cash' } }], { now });
  assert.equal(sum.tip_amount, 500); assert.equal(sum.tip_count, 1);
  assert.ok(!sum.items.some(i => i.zh.startsWith('打賞')));
  const kp = require('../lib/pos-kitchen-print.js');
  assert.match(fs.readFileSync(new URL('../lib/pos-kitchen-print.js', import.meta.url), 'utf8'), /l\.song\|\|l\.tip/);
  assert.ok(kp);
});

test('統計：期間已收／已付；未付＝全期間已收－已付；作廢單與取消行不算', () => {
  const bd = MenuLib.businessDay;
  const t = (amt, perf, extra = {}) => ({ ...tips.tipLine({ amount: amt, sfx: 'applause', performer: perf, guest: 'g', by: '客' }), ...extra });
  const all = [
    { id: 'o1', table_no: 'A1', status: 'paid', paid_at: '2026-11-01T12:00:00Z', items: [t(100, '小安'), t(50, '小安', { cancelled: true })] },
    { id: 'o2', table_no: 'A2', status: 'void', paid_at: '2026-11-01T12:00:00Z', items: [t(999, '小安')] },
    { id: 'o3', table_no: 'B1', status: 'paid', paid_at: '2026-11-05T12:00:00Z', items: [t(300, '小安'), t(200, '阿凱')] },
  ];
  const payouts = [{ id: 'p1', performer: '小安', amount: 80, at: '2026-11-02T12:00:00Z' }];
  const r = tips.summarize({ orders: all.filter(o => o.id === 'o3'), payouts: [], allOrders: all, allPayouts: payouts, businessDay: bd, from: '2026-11-05', to: '2026-11-05' });
  assert.equal(r.total, 500); assert.equal(r.count, 2); assert.equal(r.paid, 0);
  const an = r.by_performer.find(x => x.performer === '小安');
  assert.deepEqual([an.amount, an.paid, an.unpaid], [300, 0, 320]);   // 100+300 已收 − 80 已付
  assert.equal(r.unpaid, 320 + 200);
});

test('支付：表演者、正整數、方式白名單', () => {
  assert.deepEqual(tips.parsePayout({ performer: '小安', amount: 300, method: 'cash', note: '萬聖節' }), { performer: '小安', amount: 300, method: 'cash', note: '萬聖節' });
  assert.throws(() => tips.parsePayout({ performer: '', amount: 1, method: 'cash' }), /表演者/);
  assert.throws(() => tips.parsePayout({ performer: 'x', amount: 0, method: 'cash' }), /金額/);
  assert.throws(() => tips.parsePayout({ performer: 'x', amount: 1, method: 'btc' }), /支付方式/);
});

test('事件：只留 12 小時、音效白名單', () => {
  const T = Date.parse('2026-11-01T12:00:00Z');
  let st = tips.pushEvent({ events: [] }, { id: 'a', table: 'A1', amount: 100, sfx: 'nope' }, T);
  assert.equal(st.events[0].sfx, 'applause');
  st = tips.pushEvent(st, { id: 'b', table: 'A2', amount: 50, sfx: 'kiss' }, T + 13 * 3600e3);
  assert.deepEqual(st.events.map(e => e.id), ['b']);
});

test('接線：server 路由、FOOD_API 涵蓋、操作紀錄、API 文件、POS 分頁、客人頁、低消排除', () => {
  const server = read('server.js'), api = read('docs/API.md'), pos = read('public/pos.html'), ops = read('public/pos-ops.js'), order = read('public/order.html'), log = read('lib/pos-log.js'), ptips = read('public/pos-tips.js');
  for (const r of ["app.get('/api/tips'", "app.post('/api/tips'", "app.get('/api/admin/orders/tips/events'", "app.get('/api/admin/orders/tips'", "app.post('/api/admin/orders/tips/settings'", "app.post('/api/admin/orders/tips/payouts'"]) assert.ok(server.includes(r), r);
  assert.match(server, /tips\/payouts',rateLimit\(\{max:20\}\),auth,adminOnly,requireDb,superOrManagerPin/);
  assert.match(server, /INSERT INTO pos_cash_moves[^;]+'out',p\.amount/);
  for (const h of ['### GET /api/tips', '### POST /api/tips', '### GET /api/admin/orders/tips', '### POST /api/admin/orders/tips/settings', '### POST /api/admin/orders/tips/payouts', '### GET /api/admin/orders/tips/events']) assert.ok(api.includes(h), h);
  assert.match(log, /tips\\\/payouts/);
  assert.match(pos, /id:'tips'[^}]+group:'settings'/);
  assert.match(pos, /tips:tabTips/); assert.match(pos, /tipBoot\(\)/); assert.match(pos, /pos-tips\.js/);
  assert.match(ptips, /isSongPlayer/); assert.match(ptips, /songSfx\(ev\.sfx\)/);
  assert.match(ops, /!l\.tip&&l\.venue==='BAR'/);
  assert.match(order, /id="tip-open"/); assert.match(order, /id="tip-amt" type="number" inputmode="numeric"/); assert.match(order, /data-tip-sfx/);
  assert.match(order, /api\('\/tips',\{method:'POST'/);
  require('../public/order-lib.js'); const L = globalThis.OrderLib;
  for (const lang of ['zh', 'en', 'ja']) for (const k of ['tip_title', 'tip_hint', 'tip_send', 'tip_confirm', 'tip_done', 'tip_bad', 'info_tip_free']) assert.notEqual(L.text(lang, k), k, lang + ':' + k);
});
