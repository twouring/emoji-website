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
