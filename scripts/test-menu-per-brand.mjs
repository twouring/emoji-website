// 菜單依品牌分開（KK 11/11 D1／D4）：menu:CAFE／BAR／STAY／REST 各一列，商店品 menu:TTH；舊 menu 只當遷移來源
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../lib/menu-per-brand.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const legacy = JSON.stringify({ version: 1, updated_at: '2026-11-17T00:00:00Z', items: [
  { id: 'coffee', venue: 'CAFE', cat: 'COFFEE', zh: '美式', price: 100, published: true },
  { id: 'canele', venue: 'CAFE', cat: 'DESSERT', zh: '可麗露', price: 90, published: true, sold_out: '2026-11-17', stock_day: '2026-11-17', stock_left: 2 },
  { id: 'tart', venue: 'CAFE', cat: 'DESSERT', zh: '檸檬塔', price: 130, published: true },
  { id: 'beer', venue: 'BAR', cat: 'BEER', zh: '啤酒', price: 200, published: true },
  { id: 'lounge', venue: 'REST', cat: 'LOUNGE', zh: '貴賓室 1 小時', price: 150, published: true },
  { id: 'desk', venue: 'STAY', cat: 'SPACE', zh: '日租', price: 400, published: true },
  { id: 'brush', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', price: 60, published: true },
] });
const ids = raw => JSON.parse(raw).items.map(i => i.id);

test('遷移：依品項歸屬拆五列；SHOP 進 menu:TTH；近 30 天在三點水賣過的甜點複製一份給三點水', () => {
  const out = B.migrateLegacy(legacy, { canele: ['CAFE', 'BAR'], tart: ['CAFE'] });
  assert.deepEqual(Object.keys(out.rows).sort(), [...B.KEYS].sort());
  assert.deepEqual(ids(out.rows['menu:CAFE']), ['coffee', 'canele', 'tart']);
  assert.deepEqual(ids(out.rows['menu:BAR']), ['beer', 'canele_bar']);
  assert.deepEqual(ids(out.rows['menu:REST']), ['lounge']);
  assert.deepEqual(ids(out.rows['menu:STAY']), ['desk']);
  assert.deepEqual(ids(out.rows['menu:TTH']), ['brush']);
  const copy = JSON.parse(out.rows['menu:BAR']).items.find(i => i.id === 'canele_bar');
  assert.equal(copy.venue, 'BAR');
  assert.equal(copy.price, 90);
  assert.equal(copy.sold_out, '', '複製品不帶原品項的估清');
  assert.equal(copy.stock_left, null, '複製品不帶原品項的剩餘份數');
  assert.deepEqual(out.copies, [{ from: 'canele', to: 'canele_bar', venue: 'BAR', zh: '可麗露' }]);
  // 品項總數＝原本＋複製，id 全域唯一
  const all = B.KEYS.flatMap(k => ids(out.rows[k]));
  assert.equal(all.length, 8); assert.equal(new Set(all).size, 8);
  // 冪等
  assert.deepEqual(B.migrateLegacy(legacy, { canele: ['CAFE', 'BAR'], tart: ['CAFE'] }), out);
  assert.throws(() => B.migrateLegacy('not json'), /格式錯誤/);
});

test('讀：有品牌列就合併品牌列（舊 menu 不再讀）；一列都沒有才退回舊 menu', () => {
  const rows = Object.entries(B.migrateLegacy(legacy, {}).rows).map(([key, value]) => ({ key, value }));
  assert.deepEqual(ids(B.fromRows([{ key: 'menu', value: legacy }, ...rows])).sort(), ids(legacy).sort());
  const onlyCafe = [{ key: 'menu', value: legacy }, { key: 'menu:CAFE', value: JSON.stringify({ items: [{ id: 'x', venue: 'CAFE', cat: 'COFFEE' }] }) }];
  assert.deepEqual(ids(B.fromRows(onlyCafe)), ['x'], '遷移後舊 menu 不再出現');
  assert.equal(B.fromRows([{ key: 'menu', value: legacy }]), legacy);
  assert.equal(B.hasBrandRows([{ key: 'menu', value: legacy }]), false);
});

test('寫：只回寫有變動的品牌列，其他品牌不動（品牌之間互不覆蓋）', () => {
  const before = B.fromRows(Object.entries(B.migrateLegacy(legacy, {}).rows).map(([key, value]) => ({ key, value })));
  const doc = JSON.parse(before); doc.items.find(i => i.id === 'beer').price = 220; doc.updated_at = 'later';
  const ch = B.changedRows(before, JSON.stringify(doc));
  assert.deepEqual(Object.keys(ch), ['menu:BAR']);
  assert.equal(JSON.parse(ch['menu:BAR']).items.find(i => i.id === 'beer').price, 220);
  // 品項換品牌：兩列都要寫
  const doc2 = JSON.parse(before); doc2.items.find(i => i.id === 'tart').venue = 'BAR';
  assert.deepEqual(Object.keys(B.changedRows(before, JSON.stringify(doc2))).sort(), ['menu:BAR', 'menu:CAFE']);
  assert.equal(B.keyOfItem({ cat: 'SHOP', venue: 'BAR' }), 'menu:TTH');
  assert.throws(() => B.keyFor('XYZ'), e => e.status === 400);
});

test('server 接線：讀寫都走 menuRead／menuWrite、開機一次性遷移、舊 menu 不再寫入', () => {
  assert.match(server, /await migrateMenuPerBrand\(\);/);
  assert.match(server, /menu_per_brand_v1/);
  assert.match(server, /const contentValue=async key=>key===menuBrands\.LEGACY_KEY\?await menuJson\(\)/);
  assert.doesNotMatch(server, /UPDATE site_content SET value=\$1, updated_at=now\(\) WHERE key=\$2`, \[JSON\.stringify\(doc\), MENU_CONTENT_KEY\]/, '回填一律走 menuReplace');
  assert.doesNotMatch(server, /WHERE key='menu'/, '不再直接讀寫舊單一列');
  const pm = server.slice(server.indexOf('async function patchMenu('), server.indexOf('/* ---- 內容管理員'));
  assert.match(pm, /menuLock\(Q\)/); assert.match(pm, /menuWrite\(Q,cur,next/);
  const mig = server.slice(server.indexOf('async function migrateMenuPerBrand'), server.indexOf('/* ---------- token'));
  assert.match(mig, /ON CONFLICT \(key\) DO NOTHING/, '遷移不覆蓋已存在的品牌列');
  assert.match(mig, /interval '30 days'/);
  assert.match(mig, /pos_menu_recipes/, '複製的甜點連配方一起複製');
});

test('App 商店：讀 menu:TTH、只能線上付款（沒有 Stripe 不收單）、App 沒有「櫃檯付款」鍵', () => {
  const r = server.slice(server.indexOf("app.post('/api/me/shop', auth"), server.indexOf("app.delete('/api/me/shop/:id'"));
  assert.match(r, /if \(!stripe\) return res\.status\(503\)/);
  assert.match(r, /contentValue\(menuBrands\.SHOP_KEY\)/);
  const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  assert.doesNotMatch(m, /id="shctr"/);
  assert.doesNotMatch(m, /或到在咖啡／三點水櫃檯付款/);
});
