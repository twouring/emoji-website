// scripts/test-menu-stock.mjs — POS 估清：剩餘份數（設定、扣量、回補、隔天失效、後台存檔不倒回）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const { MenuLib } = T;
const NOW = new Date('2026-10-20T06:00:00Z');   // 台北 14:00，營業日 2026-10-20
const DAY = MenuLib.businessDay(NOW);
const menu = () => JSON.stringify({ version: 1, items: [
  { id: 'm_canele', venue: 'CAFE', cat: 'DESSERT', zh: '可麗露', price: 80, published: true },
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true },
  { id: 'm_bar', venue: 'BAR', cat: 'FOOD', zh: '炸物', price: 200, published: true },
] });
const item = (json, id) => MenuLib.parseMenuDoc(json).items.find(x => x.id === id);

test('設定剩餘份數：記今天營業日、解除估清；null 取消限量；範圍與店別把關', () => {
  let j = T.setSoldOut(menu(), 'm_canele', true, null, NOW);
  j = T.setStock(j, 'm_canele', 5, null, NOW);
  const it = item(j, 'm_canele');
  assert.equal(it.stock_day, DAY); assert.equal(it.stock_left, 5); assert.equal(it.sold_out, '');
  assert.equal(MenuLib.stockLeft(it, NOW), 5); assert.equal(MenuLib.soldOutToday(it, NOW), false);
  assert.equal(MenuLib.stockLeft(item(T.setStock(j, 'm_canele', null, null, NOW), 'm_canele'), NOW), null);
  assert.throws(() => T.setStock(menu(), 'm_canele', -1, null, NOW), /0–9999/);
  assert.throws(() => T.setStock(menu(), 'm_canele', 1.5, null, NOW), /0–9999/);
  assert.throws(() => T.setStock(menu(), 'm_bar', 3, ['CAFE'], NOW), e => e.status === 403);
  assert.equal(item(T.setSoldOut(j, 'm_canele', false, null, NOW), 'm_canele').stock_left, null, '恢復供應清掉份數');
});

test('剩 0 份＝今日估清、客人點不到；隔天自動回到不限量', () => {
  const j = T.setStock(menu(), 'm_canele', 0, null, NOW);
  assert.equal(MenuLib.soldOutToday(item(j, 'm_canele'), NOW), true);
  assert.ok(!T.menuIndex(j, undefined, { now: NOW }).has('m_canele'));
  const tomorrow = new Date(NOW.getTime() + 86400e3);
  assert.equal(MenuLib.stockLeft(item(j, 'm_canele'), tomorrow), null);
  assert.ok(T.menuIndex(j, undefined, { now: tomorrow }).has('m_canele'));
});

test('扣量／回補：數量加總、套餐選項也扣、最少扣到 0；沒設份數的不動', () => {
  let j = T.setStock(menu(), 'm_canele', 5, null, NOW);
  const lines = [{ item_id: 'm_canele', qty: 2 }, { item_id: 'm_latte', qty: 1 }, { item_id: 'm_combo', qty: 1, parts: [{ item_id: 'm_canele' }] }, { item_id: 'm_canele', qty: 9, cancelled: true }];
  assert.equal(T.stockUse(lines).get('m_canele'), 3);
  assert.equal(T.stockTouches(j, lines, NOW), true);
  assert.equal(T.stockTouches(j, [{ item_id: 'm_latte', qty: 1 }], NOW), false);
  j = T.applyStock(j, lines, -1, NOW);
  assert.equal(item(j, 'm_canele').stock_left, 2); assert.equal(item(j, 'm_latte').stock_left, null);
  assert.equal(T.applyStock(j, [{ item_id: 'm_latte', qty: 1 }], -1, NOW), null, '沒變動回 null');
  assert.equal(item(T.applyStock(j, [{ item_id: 'm_canele', qty: 7 }], -1, NOW), 'm_canele').stock_left, 0, '櫃檯超賣最少到 0');
  assert.equal(item(T.applyStock(j, [{ item_id: 'm_canele', qty: 1 }], 1, NOW), 'm_canele').stock_left, 3, '作廢回補');
});

test('份數不夠：列出品項與剩幾份', () => {
  const j = T.setStock(T.setStock(menu(), 'm_canele', 2, null, NOW), 'm_latte', 0, null, NOW);
  const short = T.stockShortage(j, [{ item_id: 'm_canele', qty: 3 }, { item_id: 'm_latte', qty: 1 }, { item_id: 'm_bar', qty: 9 }], NOW);
  assert.deepEqual(short.map(s => [s.item_id, s.need, s.left]), [['m_canele', 3, 2], ['m_latte', 1, 0]]);
  assert.match(T.stockMessage(short), /「可麗露」今天只剩 2 份、「拿鐵」今天已售完/);
  assert.deepEqual(T.stockShortage(j, [{ item_id: 'm_canele', qty: 2 }], NOW), []);
});

test('後台整份菜單存檔沿用資料庫現值的估清與份數，不會把份數倒回', () => {
  const live = T.setStock(menu(), 'm_canele', 1, null, NOW);
  const draft = JSON.parse(menu()); draft.items[0].stock_left = 9; draft.items[0].stock_day = DAY; draft.items[0].price = 90; draft.items[1].sold_out = DAY;
  draft.items.push({ id: 'm_new', venue: 'CAFE', cat: 'FOOD', zh: '新品', price: 1, published: true, stock_left: 3, stock_day: DAY });
  const out = JSON.parse(T.keepLiveMenuFields(live, JSON.stringify(draft)));
  const by = id => out.items.find(x => x.id === id);
  assert.equal(by('m_canele').stock_left, 1); assert.equal(by('m_canele').price, 90, '其他欄位照草稿');
  assert.equal(by('m_latte').sold_out, '', '估清也沿用現值');
  assert.equal(by('m_new').stock_left, undefined, '新品沒有現值＝不限量');
  assert.equal(T.keepLiveMenuFields(live, 'not json'), 'not json');
});

test('接線：送單扣、作廢回補、客人端超量 409、POS 估清頁有圖片與份數設定', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  const order = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(server, /app\.post\('\/api\/admin\/menu\/stock'/);
  assert.match(server, /await stockConsume\(client\.query\.bind\(client\),newlyPlaced,\{strict:!req\.auth\}\)/);
  assert.match(server, /await stockRestore\(client\.query\.bind\(client\),posInventory\.restorableRemoved\(s\.items,items\)\)/);
  assert.match(server, /await stockConsume\(client\.query\.bind\(client\), placed\.lines\)/, '預約取餐排程送單也扣');
  assert.match(server, /await stockConsume\(client\.query\.bind\(client\),orderLines\.filter\(l=>!l\.placed_at\)\)/, '先結後做也扣');
  assert.match(server, /tableOrders\.keepLiveMenuFields\(/);
  assert.match(server, /SELECT value FROM site_content WHERE key='menu' FOR UPDATE/);
  assert.match(ops, /itemThumb\(it,'so-item__img'\)/, '估清格有圖片');
  assert.match(ops, /api\('\/admin\/menu\/stock',\{method:'POST',body:\{item_id:id,left:pick\.left\}\}\)/);
  assert.match(ops, /applyLiveStock\(POS_DATA\.stock\)/);
  assert.match(order, /tr\('stock_left'\)/);
});
