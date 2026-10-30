// 會員 App 商店：菜單分類 SHOP 的零售品（牙刷、毛巾、耳機…），App 下單開外帶單、到櫃檯付款取貨
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const shop = require('../lib/shop.js');
const T = require('../lib/table-orders.js');
const MenuLib = T.MenuLib;
const kitchen = require('../lib/pos-kitchen-print.js');

const doc = JSON.stringify({ version: 1, items: [
  { id: 'brush', zh: '牙刷牙膏組', en: 'Toothbrush set', venue: 'CAFE', cat: 'SHOP', price: 60, published: true },
  { id: 'towel', zh: '浴巾', venue: 'BAR', cat: 'SHOP', price: 350, emo: 200, published: true },
  { id: 'ear', zh: '耳機', venue: 'CAFE', cat: 'SHOP', price: 490, published: false },
  { id: 'gone', zh: '毛巾', venue: 'CAFE', cat: 'SHOP', price: 150, published: true, sold_out: MenuLib.businessDay() },
  { id: 'latte', zh: '拿鐵', venue: 'CAFE', cat: 'COFFEE', price: 140, published: true },
  { id: 'beer', zh: '啤酒', venue: 'BAR', cat: 'BEER', price: 200, published: true },
] });

test('SHOP 分類存在，四語標籤齊全，seed 也認得', () => {
  assert.ok(MenuLib.CATS.includes('SHOP'));
  for (const k of ['zh', 'en', 'ja', 'ko']) assert.ok(MenuLib.CAT_LABEL.SHOP[k]);
  assert.match(read('lib/menu-seed.js'), /'SHOP'/);
});

test('商店品不出現在桌邊點餐／預約取餐／官網菜單，只在商店與 POS', () => {
  const d = MenuLib.parseMenuDoc(doc);
  assert.deepEqual(MenuLib.orderableOnly(d).map(i => i.id).sort(), ['beer', 'latte']);
  assert.deepEqual(MenuLib.publishedOnly(d).map(i => i.id).sort(), ['beer', 'latte']);
  assert.ok(MenuLib.orderableOnly(d, undefined, { posOnly: true }).some(i => i.id === 'brush'));
  assert.deepEqual(shop.itemsOf(doc).map(i => i.id).sort(), ['brush', 'towel'], '未發布、今日估清的不賣；不分店');
});

test('normalizeOrder 擋空單、重複、超量', () => {
  assert.throws(() => shop.normalizeOrder({ items: [] }), /1–20/);
  assert.throws(() => shop.normalizeOrder({ items: [{ item_id: 'a', qty: 1 }, { item_id: 'a', qty: 1 }] }), /合併/);
  assert.throws(() => shop.normalizeOrder({ items: [{ item_id: 'a', qty: 21 }] }), /1–20/);
  assert.throws(() => shop.normalizeOrder({ items: [{ item_id: 'a', qty: 20 }, { item_id: 'b', qty: 20 }, { item_id: 'c', qty: 1 }] }), /40/);
  assert.deepEqual(shop.normalizeOrder({ items: [{ item_id: 'brush', qty: 2 }], note: ' 晚點拿\n' }), { items: [{ item_id: 'brush', qty: 2 }], note: '晚點拿' });
});

test('帳記在當下營業品牌；03–08 記在咖啡；POS 品牌帳號記自己店別', () => {
  assert.equal(shop.venueFor(null, new Date('2026-11-02T10:00:00+08:00')), 'CAFE');
  assert.equal(shop.venueFor(null, new Date('2026-11-02T20:00:00+08:00')), 'BAR');
  assert.equal(shop.venueFor(null, new Date('2026-11-02T05:00:00+08:00')), 'CAFE');
  assert.equal(shop.venueFor(['BAR']), 'BAR');
});

test('addLine：商店行記指定店別、直接算已出；不上出餐單、不收服務費、不套會員價', () => {
  const menu = shop.menuOf(doc);
  let items = T.addLine([], menu, { item_id: 'brush', qty: 2, by: '小明', guest: 'appuser0001', venue: 'BAR' });
  assert.equal(items[0].venue, 'BAR');
  assert.ok(items[0].served_at, '商店行一加入就 served_at');
  assert.deepEqual(T.splitByStation({ items }), { bar: [], kitchen: [] });
  assert.equal(kitchen.jobsOf([{ id: 's1', table_no: 'W01', status: 'placed', items: items.map(l => ({ ...l, ticket: 'tk_1', placed_at: l.added_at })) }]).length, 0);
  const sc = MenuLib.serviceCharge(items, { now: new Date('2026-11-05T20:00:00+08:00') });
  assert.equal(sc, null, '三點水服務費不含商店品');
  const all = new Map(MenuLib.parseMenuDoc(doc).items.map(i => [i.id, i]));
  const towel = T.addLine([], shop.menuOf(doc), { item_id: 'towel', qty: 1, guest: 'appuser0001', venue: 'BAR' });
  assert.equal(T.applyMemberPrice(towel, all)[0].price, 350, '商店品照標價，不套聚落價');
  // 一般品項不受 venue 參數影響
  const latte = T.addLine([], new Map([['latte', all.get('latte')]]), { item_id: 'latte', qty: 1, guest: 'appuser0001', venue: 'BAR' });
  assert.equal(latte[0].venue, 'CAFE');
  assert.equal(latte[0].served_at, undefined);
});

test('server：/api/me/shop 三條路由、排程自動取消、POS 加點不擋跨店商店品、可兌換清單排除商店品', () => {
  const s = read('server.js');
  for (const r of ["app.get('/api/me/shop'", "app.post('/api/me/shop'", "app.delete('/api/me/shop/:id'"]) assert.ok(s.includes(r), r);
  assert.match(s, /ADD COLUMN IF NOT EXISTS shop_at TIMESTAMPTZ/);
  assert.match(s, /shop_expired: await expireShopOrders\(\)/);
  assert.match(s, /const shopItem=tableOrders\.MenuLib\.isShop\(it\);if\(it&&!shopItem&&!tableOrders\.itemInVenues/);
  assert.match(s, /!tableOrders\.MenuLib\.isShop\(it\) && it\.points > 0/);
});

test('App：首頁與預約分頁有商店入口、三語字串齊全、改版升 SW', () => {
  const m = read('public/m.html');
  assert.match(m, /data-go="shop"/);
  assert.match(m, /if\(sub==='shop'\)return bookShop\(\)/);
  assert.match(m, /post\('\/api\/me\/shop'/);
  for (const k of [',shop:', 'shopTitle:', 'shopHint:', 'shopSubmit:', 'shopOk:', 'shopStates:', 'cancelShop:']) assert.equal(m.split(k).length - 1, 3, k + ' 要有中英日三語');
  assert.doesNotMatch(read('public/m-sw.js'), /m-v42'/);
});
