import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../public/menu-lib.js';
const M = globalThis.MenuLib;
const at = hhmm => M.orderWindow(`2026-11-02T${hhmm}:00+08:00`);
const food = { venue: 'CAFE', cat: 'BREAD' }, coffee = { venue: 'CAFE', cat: 'COFFEE' };
const bite = { venue: 'BAR', cat: 'FRIED' }, sake = { venue: 'BAR', cat: 'SAKE' }, combo = { venue: 'CAFE', cat: 'COMBO' };

test('在咖啡：16:00 停餐點、16:30 停飲品並換三點水', () => {
  assert.equal(at('07:59').venue, null);
  assert.deepEqual(at('08:00'), { venue: 'CAFE', food: true, drink: true });
  assert.deepEqual(at('15:59'), { venue: 'CAFE', food: true, drink: true });
  assert.deepEqual(at('16:00'), { venue: 'CAFE', food: false, drink: true });
  assert.deepEqual(at('16:29'), { venue: 'CAFE', food: false, drink: true });
  assert.deepEqual(at('16:30'), { venue: 'BAR', food: true, drink: true });
});
test('三點水：02:00 停餐點、02:30 停酒水', () => {
  assert.deepEqual(at('23:59'), { venue: 'BAR', food: true, drink: true });
  assert.deepEqual(at('01:59'), { venue: 'BAR', food: true, drink: true });
  assert.deepEqual(at('02:00'), { venue: 'BAR', food: false, drink: true });
  assert.deepEqual(at('02:29'), { venue: 'BAR', food: false, drink: true });
  assert.equal(at('02:30').venue, null);
});
test('orderableInWindow：飲品／酒水看 drink，其餘（含套餐）看 food', () => {
  assert.equal(M.orderableInWindow(food, at('15:00')), true);
  assert.equal(M.orderableInWindow(food, at('16:10')), false);
  assert.equal(M.orderableInWindow(combo, at('16:10')), false);
  assert.equal(M.orderableInWindow(coffee, at('16:10')), true);
  assert.equal(M.orderableInWindow(coffee, at('16:40')), false);
  assert.equal(M.orderableInWindow(sake, at('16:40')), true);
  assert.equal(M.orderableInWindow(bite, at('02:10')), false);
  assert.equal(M.orderableInWindow(sake, at('02:10')), true);
  assert.equal(M.orderableInWindow(sake, at('02:40')), false);
});
test('伺服器：掃碼加點／兌換用時段菜單，送單檢查最後點餐', () => {
  const s = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(s, /async function currentMenu\(opt\)\{const w=tableOrders\.MenuLib\.orderWindow\(\)/);
  assert.match(s, /assertLinesInWindow\(items\);return tableOrders\.placeLines\(items\)\.items;/);
  assert.match(s, /pauseFor\(await contentValue\('ordering_pause'\),tableOrders\.MenuLib\.orderWindow\(\)\.venue\)/);
});
test('order.html 依時段過濾菜單並顯示最後點餐提示', () => {
  const h = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(h, /MenuLib\.orderableInWindow\(it,WIN\)/);
  assert.match(h, /cafe_food_closed/);
});
test('order.html 常駐提醒最後點餐時間，30 分內轉橘色', () => {
  const h = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
  assert.match(h, /function renderShift\(\)/);
  assert.match(h, /tr\(W2\.food\?'cafe_last_order':'cafe_food_closed'\)/);
  assert.match(h, /classList\.toggle\('soon',!PAUSED&&left!=null&&left<=30\)/);
  assert.match(h, /\.menu-status\.soon\{/);
  assert.match(h, /else renderShift\(\);\},30000\)/);
  for (const s of ['餐點點到 16:00・飲品點到 16:30', '餐點點到 02:00・酒水點到 02:30', 'Food until 16:00', 'フード02:00・ドリンク02:30まで']) assert.ok(lib.includes(s), s);
});
