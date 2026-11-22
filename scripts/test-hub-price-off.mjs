import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
/* 聚落價暫時移除（KK 2026-11-23）：總開關 MenuLib.HUB_PRICE_ON=false；恢復時改 true 並刪掉本檔 */
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const tableOrders = require('../lib/table-orders.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('總開關關閉', () => { assert.equal(MenuLib.HUB_PRICE_ON, false); });

test('伺服器結帳：開關關閉時有效會籍也不套聚落價', () => {
  const s = read('server.js');
  assert.match(s, /if\(!tableOrders\.MenuLib\.HUB_PRICE_ON\)memberActive=false;[^\n]*\n[^\n]*\n[^\n]*tableOrders\.posCheckout\(s\.items,\{\.\.\.req\.body,member:memberActive,/);
});

test('官網菜單不出聚落價', () => {
  const html = MenuLib.renderMenuHtml([{ id: 'x', venue: 'STAY', cat: 'COFFEE', zh: '測試', en: 'T', price: 200, emo: 150, published: true }], 'zh');
  assert.doesNotMatch(html, /聚落價/);
});

test('POS／點餐頁／後台／IG 工具都看開關', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /if\(!POS_MEMBER\|\|!MenuLib\.HUB_PRICE_ON\|\|!it\)return l\.price;/);
  assert.match(ops, /\$\{MenuLib\.HUB_PRICE_ON&&\(POS_YAN\.id\|\|memberSaving>0\)\?/);
  assert.match(read('public/order.html'), /MenuLib\.HUB_PRICE_ON&&ME&&ME\.active/);
  assert.match(read('public/admin.html'), /MenuLib\.HUB_PRICE_ON \? '<th class="num">聚落價<\/th>'/);
  assert.match(read('public/pos-content.js'), /<label\$\{MenuLib\.HUB_PRICE_ON\?'':' hidden'\}>會員價/);
  assert.match(read('public/ig-studio.js'), /showMember: false,/);
});
