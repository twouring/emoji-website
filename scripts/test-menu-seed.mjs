import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  stableMenuId,
  buildMenuSeedDoc,
  shouldWriteMenuSeed,
  loadMenuSeedRows,
  MENU_CONTENT_KEY,
} = require('../lib/menu-seed.js');

test('MENU_CONTENT_KEY is menu', () => {
  assert.equal(MENU_CONTENT_KEY, 'menu');
});

test('stableMenuId is deterministic from venue+cat+en', () => {
  const a = stableMenuId({ cat: 'COFFEE', en: 'AMERICANO', zh: '美式咖啡' });
  const b = stableMenuId({ venue: 'CAFE', cat: 'COFFEE', en: 'AMERICANO', zh: '美式咖啡' });
  assert.equal(a, 'm_cafe_coffee_americano');
  assert.equal(stableMenuId({ venue: 'BAR', cat: 'ALCOHOL', en: 'NEGRONI' }), 'm_bar_alcohol_negroni');
  assert.equal(a, b);
});

test('stableMenuId falls back to zh when en empty', () => {
  const id = stableMenuId({ cat: 'FOOD', en: '', zh: '測試餐' });
  assert.match(id, /^m_cafe_food_/);
});

test('buildMenuSeedDoc publishes all by default', () => {
  const doc = buildMenuSeedDoc([
    { cat: 'FOOD', zh: '薯條', en: 'FRENCH FRIES', price: 180, emo: 150, alcohol: false },
    { cat: 'ALCOHOL', zh: '啤酒', en: 'BEER', price: 200, emo: 150, alcohol: false },
  ]);
  assert.equal(doc.version, 1);
  assert.equal(doc.items.length, 2);
  assert.ok(doc.items.every((i) => i.published === true));
  assert.equal(doc.items[1].alcohol, true);
  assert.equal(doc.items[0].id, 'm_cafe_food_french_fries');
  assert.equal(doc.items[0].venue, 'CAFE');
  assert.equal(doc.items[0].sort, 10);
  assert.equal(doc.items[1].sort, 20);
});

test('buildMenuSeedDoc treats SAKE/LIQUEUR/WINE as alcohol', () => {
  const doc = buildMenuSeedDoc([
    { venue: 'BAR', cat: 'SAKE', zh: '清酒', price: 450 },
    { venue: 'BAR', cat: 'LIQUEUR', zh: '梅酒', price: 240 },
    { venue: 'BAR', cat: 'WINE', zh: '甜白', price: 400 },
    { venue: 'BAR', cat: 'SPARKLING', zh: '柚子氣泡', price: 160 },
  ]);
  assert.deepEqual(doc.items.map((i) => i.alcohol), [true, true, true, false]);
  assert.ok(doc.items.every((i) => i.cat !== 'FOOD'));
});

test('shouldWriteMenuSeed: missing key → write', () => {
  assert.equal(shouldWriteMenuSeed({}, false), true);
  assert.equal(shouldWriteMenuSeed({ menu: '' }, false), true);
});

test('shouldWriteMenuSeed: existing without force → skip', () => {
  assert.equal(shouldWriteMenuSeed({ menu: '{"version":1,"items":[]}' }, false), false);
});

test('shouldWriteMenuSeed: force → write', () => {
  assert.equal(shouldWriteMenuSeed({ menu: '{"version":1,"items":[]}' }, true), true);
});

test('loadMenuSeedRows reads menu-data.js', () => {
  const rows = loadMenuSeedRows();
  assert.ok(rows.length >= 60);
  assert.ok(rows.some((r) => r.zh === '美式咖啡' && r.venue === 'CAFE'));
  assert.ok(rows.some((r) => r.zh === '柚香鮭魚冷盤' && r.venue === 'BAR'));
  assert.ok(rows.some((r) => r.cat === 'SAKE' && r.venue === 'BAR' && r.alcohol === true));
  assert.ok(rows.every((r) => r.note), '定稿菜單每項都有產品內容');
  assert.ok(rows.every((r) => ['CAFE', 'BAR'].includes(r.venue)));
});
