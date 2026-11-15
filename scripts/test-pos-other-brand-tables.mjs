// 共用座位（KK 11/16）：品牌 POS 桌位圖標出別的品牌佔用的桌（不能開桌／帶位／換過去）；混桌裡對方品項灰色唯讀、不進本店結帳
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tableOrders = require('../lib/table-orders.js');
const posRegister = require('../lib/pos-register.js');
const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const doc = fs.readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
const venueOf = s => s.venue || posRegister.sessionVenues(s)[0] || null;
const T = '2026-11-15T12:00:00Z';
const bar = t => ({ id: 'b' + t, table_no: t, venue: 'BAR', items: [{ line: 'x' + t, zh: '琴通寧', qty: 1, venue: 'BAR', price: 280 }], created_at: T });

test('occupiedByOthers：三點水 A2／A8／C6 在咖啡 POS 看得到是對方佔用，自己的、外帶、管理員都不列', () => {
  const rows = [bar('A2'), bar('A8'), bar('C6'), { id: 'c1', table_no: 'A3', venue: 'CAFE', items: [], created_at: T }, { id: 'w', table_no: 'W01', venue: 'BAR', items: [], created_at: T }];
  const cafe = tableOrders.occupiedByOthers(rows, ['CAFE'], venueOf);
  assert.deepEqual(cafe.map(o => [o.table, o.venue]), [['A2', 'BAR'], ['A8', 'BAR'], ['C6', 'BAR']]);
  // 反向：三點水看在咖啡的 A3
  assert.deepEqual(tableOrders.occupiedByOthers(rows, ['BAR'], venueOf).map(o => o.table), ['A3']);
  // 言文字管理員（不限品牌）不需要
  assert.deepEqual(tableOrders.occupiedByOthers(rows, null, venueOf), []);
  // 舊資料沒記 venue：依品項判斷
  const legacy = { id: 'l', table_no: 'B1', items: [{ venue: 'BAR', line: 'q' }], created_at: T };
  assert.deepEqual(tableOrders.occupiedByOthers([legacy], ['CAFE'], venueOf).map(o => o.table), ['B1']);
});

test('otherVenueLines：只回對方未結、未作廢的品項，不帶價格；自家品項不受影響', () => {
  const items = [
    { line: 'a', zh: '拿鐵', qty: 1, venue: 'CAFE', price: 150 },
    { line: 'b', zh: '琴通寧', qty: 2, venue: 'BAR', price: 280, placed_at: T },
    { line: 'c', zh: '啤酒', qty: 1, venue: 'BAR', price: 200, order_id: 'od1' },   // 已結帳
    { line: 'd', zh: '調酒', qty: 1, venue: 'BAR', price: 300, cancelled: true },
  ];
  const o = tableOrders.otherVenueLines(items, ['CAFE']);
  assert.deepEqual(o.map(l => l.line), ['b']);
  assert.equal(o[0].price, undefined);
  assert.deepEqual(tableOrders.otherVenueLines(items, null), []);
  // 自家清單照舊只含自家品項（小計不會混入）
  const own = tableOrders.unpaid(items).filter(l => tableOrders.itemInVenues(l, ['CAFE']));
  assert.deepEqual(own.map(l => l.line), ['a']);
  assert.equal(tableOrders.sum(own), 150);
});

test('GET /api/admin/orders 回 occupied 與 sessions[].other_lines', () => {
  const i = srv.indexOf("app.get('/api/admin/orders',"); const r = srv.slice(i, srv.indexOf('\n}));', i));
  assert.match(r, /const occupied=tableOrders\.occupiedByOthers\(rows,venues,sessionVenueOf\)/);
  assert.match(r, /other_lines:tableOrders\.otherVenueLines\(s\.items,venues\)/);
  assert.match(r, /res\.json\(\{orders,tickets,sessions,occupied,/);
  assert.match(doc, /occupied\[\]/);
  assert.match(doc, /other_lines/);
});

test('後端仍拒絕改對方品項（前端灰色唯讀的最後防線）', () => {
  assert.match(srv, /只能作廢自己店別的品項。/);
  assert.match(srv, /只能修改自己店別的品項。/);
  assert.match(srv, /請只勾選自己店別的品項結帳/);
});

test('前端：佔用桌不可點、開桌／一次開多桌／帶位／拖單換桌都擋；對方品項灰色唯讀', () => {
  assert.match(ops, /const otherBusy=new Map\(\(d\.occupied\|\|\[\]\)/);
  // 佔用格是 div（不是 button）、沒有 data-open-table
  const cell = ops.match(/if\(s\.empty&&otherBusy\.has\(s\.table\)\)return `([^`]+)`/);
  assert.ok(cell, '佔用格');
  assert.doesNotMatch(cell[1], /data-open-table|<button/);
  assert.match(cell[1], /class="pos-table other-busy/);
  assert.match(ops, /const openSession=async body=>\{if\(!body\.takeout&&otherBusy\.has\(body\.table_no\)\)/);
  assert.match(ops, /openManyTables\(slots\.filter\(x=>x\.empty&&!x\.takeout&&!otherBusy\.has\(x\.table\)\)/);
  assert.match(ops, /if\(otherBusy\.has\(to\)\)\{toast\(/);
  assert.match(ops, /\(d\.occupied\|\|\[\]\)\.forEach\(o=>\{if\(!busy\[o\.table\]\)busy\[o\.table\]=/);   // 帶位彈窗停用
  // 灰色唯讀區：沒有勾選框、價格、操作鍵
  const fn = ops.slice(ops.indexOf('function otherLinesHtml('), ops.indexOf('function paintPos('));
  assert.doesNotMatch(fn, /checkbox|data-pick|data-edit-line|price|<button/);
  assert.match(ops, /<\/tbody><\/table><\/div>\$\{otherLinesHtml\(cur\)\}/);
  assert.match(css, /\.pos-table\.other-busy\{[^}]*pointer-events:none/);
  assert.match(css, /\.pos-other-lines\{[^}]*user-select:none/);
  // 輪詢簽名含 occupied，別店開／清桌會即時重畫
  assert.match(ops, /const sig=JSON\.stringify\(\[POS_DATA\.occupied\|\|\[\]/);
});
