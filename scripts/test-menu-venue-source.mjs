import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const M = T.MenuLib;
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// KK 11/5：「三點水菜單沒看到費南雪，為什麼可以兌換」→ 店別菜單資料來源要統一
const items = [
  { id: 'c', venue: 'CAFE', cat: 'COFFEE', zh: '美式', published: true, price: 100 },
  { id: 'd', venue: 'CAFE', cat: 'DESSERT', zh: '原味費南雪', published: true, price: 90, points: 9 },
  { id: 'b', venue: 'BAR', cat: 'BEER', zh: '啤酒', published: true, price: 200 },
];
test('MenuLib.inVenue／forVenue：共用甜點只在兩個餐飲店別，venue 換成該店', () => {
  assert.deepEqual(M.forVenue(items, 'BAR').map(i => i.id), ['d', 'b']);
  assert.equal(M.forVenue(items, 'BAR').find(i => i.id === 'd').venue, 'BAR');
  assert.deepEqual(M.forVenue(items, 'CAFE').map(i => i.id), ['c', 'd']);
  assert.deepEqual(M.forVenue(items, 'REST').map(i => i.id), [], '約書旅不販售跨店甜點');
  assert.equal(M.inVenue(items[1], 'REST'), false, '約書旅 POS 不得看到在咖啡甜點');
  assert.equal(items[1].venue, 'CAFE', '不可改到原資料');
});
test('點餐／兌換（menuIndex）與 App、官網菜單看到的三點水品項一致', () => {
  const doc = JSON.stringify({ items });
  assert.deepEqual([...T.menuIndex(doc, 'BAR').keys()].sort(), M.forVenue(items, 'BAR').map(i => i.id).sort());
  const R = require('../lib/public-render.js');
  assert.ok(R);
});
test('各畫面不得再自己寫 it.venue===店別 篩菜單', () => {
  const files = ['public/order.html', 'public/m.html', 'public/pos-ops.js', 'public/pos-inventory.js', 'lib/public-render.js', 'lib/table-orders.js'];
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /filter\((?:function\()?it\)?(?:=>|\{return )[^)]*it\.venue *=== *(?:APP_MENU_VENUE|venue|SCOPE)\b/, f + ' 要改用 MenuLib.forVenue／inVenue');
  }
  assert.match(read('public/m.html'), /MenuLib\.forVenue\(MenuLib\.publishedOnly\(MENU\),APP_MENU_VENUE\)/);
  assert.match(read('lib/public-render.js'), /MenuLib\.forVenue\(items, venue\)/);
});
