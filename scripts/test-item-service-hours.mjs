// 品項每日供應時段（KK 11/22）：hours_from 起開放、hours_to 起停售、隔天自動恢復；客人點餐、POS、後端送單共用 MenuLib 判斷
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import '../public/menu-lib.js';
const M = globalThis.MenuLib;
const require = createRequire(import.meta.url);
const menuContent = require('../lib/menu-content.js');
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00+08:00`);
const lunch = M.normalizeItem({ id: 'm_hzlpmwnu', venue: 'CAFE', cat: 'JAPANESE', zh: '日式醬燒漢堡排定食', price: 259, published: true, image: 'https://www.emoji.tw/ig-media/assets/x.jpg', options: [{ label: '加購飲品', choices: [{ zh: '不加購' }, { zh: '美式咖啡', add: 80 }] }], hours_from: '11:00', hours_to: '14:00' });
const coffee = M.normalizeItem({ id: 'm_c', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', price: 120, published: true });

test('邊界：10:59 不可、11:00 可、13:59 可、14:00 起停售', () => {
  const d = '2026-11-23';
  assert.equal(M.inServiceHours(lunch, at(d, '10:59')), false);
  assert.equal(M.inServiceHours(lunch, at(d, '11:00')), true);
  assert.equal(M.inServiceHours(lunch, at(d, '13:59')), true);
  assert.equal(M.inServiceHours(lunch, at(d, '14:00')), false);
  assert.equal(M.inServiceHours(lunch, at(d, '23:59')), false);
});
test('跨日：當天 14:00 停售後，隔天 11:00 自動恢復（不需估清／手動恢復）', () => {
  assert.equal(M.isOrderable(lunch, at('2026-11-23', '14:00')), false);
  assert.equal(M.isOrderable(lunch, at('2026-11-24', '00:30')), false);
  assert.equal(M.isOrderable(lunch, at('2026-11-24', '10:59')), false);
  assert.equal(M.isOrderable(lunch, at('2026-11-24', '11:00')), true);
  assert.equal(M.soldOutToday(lunch, at('2026-11-23', '14:30')), false);   // 不是估清，估清狀態不受影響
});
test('跨午夜時段（22:00–02:00）也成立', () => {
  const late = M.normalizeItem({ ...lunch, hours_from: '22:00', hours_to: '02:00' });
  assert.equal(M.inServiceHours(late, at('2026-11-23', '21:59')), false);
  assert.equal(M.inServiceHours(late, at('2026-11-23', '23:00')), true);
  assert.equal(M.inServiceHours(late, at('2026-11-24', '01:59')), true);
  assert.equal(M.inServiceHours(late, at('2026-11-24', '02:00')), false);
});
test('相容：沒設時段的品項不受影響；欄位不完整或格式錯就當沒設', () => {
  for (const t of ['07:00', '10:59', '14:00', '23:59']) assert.equal(M.inServiceHours(coffee, at('2026-11-23', t)), true);
  assert.equal('hours_from' in coffee, false);
  for (const bad of [{ hours_from: '11:00' }, { hours_from: '11:00', hours_to: '11:00' }, { hours_from: '25:00', hours_to: '14:00' }, { hours_from: '11', hours_to: '14' }]) {
    const it = M.normalizeItem({ ...coffee, ...bad });
    assert.equal(M.hasServiceHours(it), false, JSON.stringify(bad));
  }
  const doc = { items: [lunch, coffee] };
  assert.deepEqual(M.orderableOnly(doc, at('2026-11-23', '14:00')).map(x => x.id), ['m_c']);
  assert.deepEqual(M.orderableOnly(doc, at('2026-11-23', '12:00')).map(x => x.id), ['m_hzlpmwnu', 'm_c']);
  assert.equal(M.serviceHoursText(lunch), '11:00–14:00');
});
test('normalize 保留圖片、價格、加購；存檔往返不掉欄位', () => {
  const again = M.parseMenuDoc(M.stringifyDoc({ items: [lunch] })).items[0];
  assert.equal(again.price, 259);
  assert.equal(again.image, lunch.image);
  assert.equal(again.hours_from, '11:00');
  assert.equal(again.hours_to, '14:00');
  assert.equal(M.optionAdd(again, '加購飲品：美式咖啡 +$80'), 80);
});
test('內容管理員 PATCH：可設／清除時段，只給一個或格式錯回 400，其他欄位不動', () => {
  const json = M.stringifyDoc({ items: [M.normalizeItem({ ...lunch, hours_from: '', hours_to: '' }), coffee] });
  const set = menuContent.editItem(json, { id: 'm_hzlpmwnu', hours_from: '11:00', hours_to: '14:00' }, {});
  assert.equal(set.item.hours_from, '11:00');
  assert.equal(set.item.price, 259);
  assert.equal(set.item.image, lunch.image);
  assert.equal(set.item.options.length, 1);
  assert.equal(menuContent.view(set.item).hours_to, '14:00');
  const clear = menuContent.editItem(set.json, { id: 'm_hzlpmwnu', hours_from: '', hours_to: '' }, {});
  assert.equal(M.hasServiceHours(clear.item), false);
  assert.throws(() => menuContent.editItem(json, { id: 'm_hzlpmwnu', hours_from: '11:00' }, {}), /同時/);
  assert.throws(() => menuContent.editItem(json, { id: 'm_hzlpmwnu', hours_from: '11點', hours_to: '14:00' }, {}), /HH:MM/);
  const other = menuContent.editItem(set.json, { id: 'm_hzlpmwnu', price: 259 }, {});
  assert.equal(other.item.hours_to, '14:00');   // 改別的欄位不洗掉時段
});
test('接線：客人加點／送單／線上付款、POS 加點／送單都擋時段外；前端兩端都依時段重繪', () => {
  const s = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(s, /function assertLinesInHours\(items,hours,now\)/);
  assert.match(s, /const hx=hoursOffItem\(await menuHoursMap\(\),iid\);if\(hx&&!menu\.has\(iid\)\)return res\.status\(409\)/);
  assert.match(s, /const hours=await menuHoursMap\(\);return mutateItems\(req,res,items=>\{assertLinesInHours\(items,hours\);assertLinesInWindow\(items\);/);
  assert.match(s, /try\{assertLinesInHours\(lines,await menuHoursMap\(\)\);\}/);
  assert.match(s, /const hx=hoursOffItem\(await menuHoursMap\(\),req\.body\?\.item_id\);/);
  assert.match(s, /assertLinesInHours\(items\.filter\(l=>tableOrders\.itemInVenues\(l,venues\)\),hours\);return tableOrders\.placeLines\(items,new Date\(\),venues\)\.items;/);
  const o = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(o, /function menuKey\(\)\{[^}]*MenuLib\.inServiceHours/);
  assert.match(o, /if\(menuKey\(\)!==WIN_KEY\)renderMenu\(\)/);
  const p = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(p, /const hoursOff=!MenuLib\.inServiceHours\(it\)/);
  assert.match(p, /if\(it&&!MenuLib\.inServiceHours\(it\)\)\{toast/);
  assert.match(p, /filter\(MenuLib\.hasServiceHours\)\.map\(it=>\[it\.id,MenuLib\.inServiceHours\(it\)\]\)\]\);/);
  const a = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(a, /hours_from: \(MENU_DOC\.items\.find/);   // 後台舊表單存檔要原樣帶回
});

test('櫃檯結帳只收已送出的：草稿不計費、指定草稿 409、預收不含草稿；時段內已送出的照常結帳（KK 11/22）', () => {
  const T = require('../lib/table-orders.js');
  const sent = { line: 'a1', item_id: 'm_hzlpmwnu', venue: 'CAFE', cat: 'JAPANESE', zh: '日式醬燒漢堡排定食', price: 339, qty: 1, by: '小明', guest: 'g1234567', order_id: null, added_at: '2026-11-23T05:50:00Z', placed_at: '2026-11-23T05:55:00Z' };   // 13:55 送出
  const draft = { line: 'b2', item_id: 'm_hzlpmwnu', venue: 'CAFE', cat: 'JAPANESE', zh: '日式醬燒漢堡排定食', price: 259, qty: 1, by: '小華', guest: 'g7654321', order_id: null, added_at: '2026-11-23T05:58:00Z' };   // 13:58 加進購物車、沒送出
  const counter = { line: 'c3', item_id: 'm_c', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', price: 120, qty: 1, by: '櫃檯', guest: 'posstaff00', order_id: null };
  const after = Date.parse('2026-11-23T14:10:00+08:00');
  const all = T.posCheckout([sent, draft, counter], { method: 'cash' }, new Map(), [], { table: 'A1', now: after, sentOnly: true });
  assert.deepEqual(all.lines.map(l => l.line).sort(), ['a1', 'c3'], '14:00 後結帳：已送出＋櫃檯代點可結，草稿不收');
  assert.equal(all.amount, 459);
  const mine = T.posCheckout([sent, draft], { method: 'cash', lines: ['a1'] }, new Map(), [], { table: 'A1', now: after, sentOnly: true });
  assert.equal(mine.amount, 339);
  assert.throws(() => T.posCheckout([sent, draft], { method: 'cash', lines: ['a1', 'b2'] }, new Map(), [], { table: 'A1', now: after, sentOnly: true }), e => e.status === 409 && /還沒送出/.test(e.message));
  assert.throws(() => T.posCheckout([draft], { method: 'cash' }, new Map(), [], { table: 'A1', now: after, sentOnly: true }), /沒有可結帳/);
  assert.throws(() => T.posCheckout([sent, draft], { method: 'cash', prepay: 400 }, new Map(), [], { table: 'A1', now: after, sentOnly: true }), /小於這桌未結金額 NT\$339/, '預收上限只算已送出的');
  const s = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(s, /\{table:s\.table_no,sentOnly:true\}\);invoice=ezpayInvoice/, '櫃檯結帳路由帶 sentOnly');
  assert.match(readFileSync(new URL('../lib/linepay-pos.js', import.meta.url), 'utf8'), /methods,\{table:s\.table_no,sentOnly:true\}\)/, 'LINE Pay 收款帶 sentOnly');
  const every = [...s.matchAll(/tableOrders\.posCheckout\(/g)].length;
  assert.equal(every, [...s.matchAll(/tableOrders\.posCheckout\([^\n]*?sentOnly:true\}\)/g)].length, 'server.js 每個 posCheckout 呼叫都要帶 sentOnly:true');
});

test('顯示分類 display_cat（KK 11/23）：商業午餐排在套餐區第一、只出現一次；計價／選項／出餐站仍依原分類', () => {
  const T = require('../lib/table-orders.js');
  const combo = (id, sort) => M.normalizeItem({ id, venue: 'CAFE', cat: 'COMBO', zh: id, price: 300, published: true, sort, combo: [{ label: '飲品', choices: [{ zh: '美式咖啡' }] }] });
  const biz = M.normalizeItem({ ...lunch, zh: '商業午餐｜日式醬燒漢堡排定食', display_cat: 'COMBO', sort: 0 });
  const salad = M.normalizeItem({ id: 's1', venue: 'CAFE', cat: 'SALAD', zh: '沙拉', price: 200, published: true, sort: 10 });
  const onigiri = M.normalizeItem({ id: 'j1', venue: 'CAFE', cat: 'JAPANESE', zh: '飯糰', price: 220, published: true, sort: 80 });
  const items = [onigiri, salad, combo('c6', 6), biz, combo('c5', 5), coffee];
  const sorted = M.sortItems(items).map(x => x.id);
  assert.deepEqual(sorted, ['m_hzlpmwnu', 'c5', 'c6', 's1', 'j1', 'm_c'], '商業午餐在套餐區最前，其他相對順序不變');
  assert.equal(biz.cat, 'JAPANESE');
  assert.equal(M.shownCat(biz), 'COMBO');
  assert.equal(M.shownCat(onigiri), 'JAPANESE');
  const html = M.renderMenuHtml(M.sortItems(items), 'zh');
  assert.equal(html.split('<span class="menu-item__zh">商業午餐｜日式醬燒漢堡排定食').length - 1, 1, '官網只出現一次');
  const firstGroup = html.split('<section class="menu-group">')[1];
  assert.match(firstGroup, /menu-group__zh">套餐</);
  assert.ok(firstGroup.indexOf('商業午餐') < firstGroup.indexOf('c5'), '第一個套餐區的首位');
  assert.equal(M.optionAdd(biz, '加購飲品：美式咖啡 +$80'), 80, '仍是一般品項加選項（可不加購）');
  assert.equal(M.memberPrice(biz), M.memberPrice(lunch), '會員價不變');
  assert.equal(M.stationOf(biz), 'kitchen');
  const menu = new Map([[biz.id, biz]]);
  const line = T.addLine([], menu, { item_id: biz.id, qty: 1, guest: 'guest0000001', note: '' })[0];
  assert.equal(line.price, 259); assert.equal(line.cat, 'JAPANESE');
  for (const bad of ['COMBO']) assert.equal(M.normalizeItem({ ...combo('cx', 1), display_cat: 'SALAD' }).display_cat, undefined, bad);
  assert.equal(M.normalizeItem({ ...coffee, display_cat: 'NOPE' }).display_cat, undefined);
  const json = M.stringifyDoc({ items: [lunch, coffee] });
  const set = menuContent.editItem(json, { id: 'm_hzlpmwnu', display_cat: 'COMBO', sort: 0 }, {});
  assert.equal(set.item.display_cat, 'COMBO'); assert.equal(set.item.cat, 'JAPANESE'); assert.equal(set.item.hours_from, '11:00'); assert.equal(set.item.image, lunch.image);
  assert.equal(menuContent.view(set.item).display_cat, 'COMBO');
  assert.equal(menuContent.editItem(set.json, { id: 'm_hzlpmwnu', display_cat: '' }, {}).item.display_cat, undefined);
  assert.throws(() => menuContent.editItem(json, { id: 'm_hzlpmwnu', display_cat: 'xx' }, {}), /顯示分類/);
});
test('接線：點餐頁、App、POS（點餐格與估清）、官網 JSON-LD 都用 shownCat 分組', () => {
  const o = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(o, /if\(MenuLib\.shownCat\(it\)!==cat\)\{cat=MenuLib\.shownCat\(it\);var c=MenuLib\.CAT_LABEL\[cat\][^\n]*menu-grid/);
  assert.match(o, /if\(!next\|\|MenuLib\.shownCat\(next\)!==cat\)/);
  assert.match(readFileSync(new URL('../public/m.html', import.meta.url), 'utf8'), /if\(MenuLib\.shownCat\(it\)!==cat\)/);
  const p = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(p, /const cats=\[\.\.\.new Set\(menuItems\.map\(it=>MenuLib\.shownCat\(it\)\)\)\]/);
  assert.match(p, /menuItems\.filter\(it=>!POS_CAT\|\|MenuLib\.shownCat\(it\)===POS_CAT\)/);
  assert.match(p, /const c=MenuLib\.shownCat\(it\);if\(!groups\.has\(c\)\)/);
  assert.match(readFileSync(new URL('../lib/public-render.js', import.meta.url), 'utf8'), /const shown = MenuLib\.shownCat\(it\);/);
  assert.match(readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8'), /display_cat: \(MENU_DOC\.items\.find/);
});
