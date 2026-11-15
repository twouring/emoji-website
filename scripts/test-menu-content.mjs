// 內容管理員（KK 11/15）：POS／MCP 改菜單品項與照片——權限、品牌隔離、部分更新不動估清、照片格式與網址檢查
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../lib/menu-content.js');
const M = require('../lib/pos-mcp.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js');

const menu = JSON.stringify({ version: 1, items: [
  { id: 'a', venue: 'CAFE', cat: 'COFFEE', zh: '美式', price: 120, published: true, sold_out: '2026-11-15', stock_day: '2026-11-15', stock_left: 3, sort: 10 },
  { id: 'b', venue: 'BAR', cat: 'SAKE', zh: '清酒', price: 300, published: true, sort: 10 },
  { id: 'c', venue: 'CAFE', cat: 'BEVERAGE', zh: '可可', price: 140, published: true, sort: 20 },
] });
const items = j => JSON.parse(j).items;

test('職稱：含「內容管理員」或「店長」才可改內容', () => {
  for (const r of ['內容管理員', '店長', '副店長', '工讀／內容管理員']) assert.ok(C.canEditContent(r), r);
  for (const r of ['', '工讀', '正職', null, undefined, '內容']) assert.ok(!C.canEditContent(r), String(r));
});

test('修改：只改有帶的欄位；估清與份數沿用原值', () => {
  const { json, item, created } = C.editItem(menu, { id: 'a', price: 130, note: '淺焙' }, { venues: ['CAFE'] });
  assert.equal(created, false);
  assert.equal(item.price, 130); assert.equal(item.note, '淺焙'); assert.equal(item.zh, '美式'); assert.equal(item.published, true);
  const a = items(json).find(x => x.id === 'a');
  assert.equal(a.sold_out, '2026-11-15'); assert.equal(a.stock_left, 3);
  assert.equal(items(json).length, 3);
  // 嘗試順便改估清：忽略
  const j2 = C.editItem(menu, { id: 'a', sold_out: '', stock_left: 99 }, { venues: ['CAFE'] }).json;
  assert.equal(items(j2).find(x => x.id === 'a').stock_left, 3);
});

test('品牌隔離：不能改別品牌、不能新增到別品牌', () => {
  assert.throws(() => C.editItem(menu, { id: 'b', price: 1 }, { venues: ['CAFE'] }), e => e.status === 403);
  assert.throws(() => C.editItem(menu, { zh: '新品' }, { venue: 'BAR', venues: ['CAFE'] }), e => e.status === 403);
  assert.throws(() => C.editItem(menu, { id: 'zzz', price: 1 }, { venues: ['CAFE'] }), e => e.status === 404);
  assert.throws(() => C.editItem(menu, { zh: '空間' }, { venue: 'NOPE' }), /沒有菜單品項/);
  assert.equal(C.editItem(menu, { zh: '等等空間 4 小時', cat: 'SPACE', price: 200 }, { venues: ['STAY'] }).item.venue, 'STAY', '等等空間有空間方案品項（KK 11/15 空間情境）');
});

test('新增：落在自己品牌、預設不上架、排在最後、id 由系統產生', () => {
  const { json, item, created } = C.editItem(menu, { zh: '拿鐵', price: 150, cat: 'COFFEE', id: undefined }, { venues: ['CAFE'] });
  assert.equal(created, true); assert.equal(item.venue, 'CAFE'); assert.equal(item.published, false);
  assert.ok(item.sort > 20); assert.match(item.id, /^m_/);
  assert.equal(items(json).length, 4);
  assert.throws(() => C.editItem(menu, { price: 1 }, { venues: ['CAFE'] }), /品名/);
  assert.throws(() => C.editItem(menu, { zh: '書', cat: 'BOOK' }, { venues: ['REST'] }), /書冊/);
  assert.throws(() => C.editItem(menu, { zh: 'x', cat: 'NOPE' }, { venues: ['CAFE'] }), /分類無效/);
  assert.throws(() => C.editItem(menu, { id: 'a', price: -1 }, { venues: ['CAFE'] }), /0 以上/);
});

test('套餐文字、上架布林、照片網址白名單', () => {
  const { item } = C.editItem(menu, { zh: '早午餐', cat: 'COMBO', combo_text: '飲品：美式、可可+20', published: 'true' }, { venues: ['CAFE'] });
  assert.equal(item.published, true);
  assert.deepEqual(item.combo[0].choices.map(c => [c.id, c.add]), [['a', 0], ['c', 20]]);
  assert.equal(C.cleanImage('/ig-media/assets/menu-x.jpg'), '/ig-media/assets/menu-x.jpg');
  assert.equal(C.cleanImage('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(C.cleanImage(''), '');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAA', 'http://x/a.jpg', '/ig-media/../secret', '"><img onerror=1>']) assert.throws(() => C.cleanImage(bad), bad);
});

test('照片 base64：檔頭判斷格式、限 5MB', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(C.decodeImage('data:image/png;base64,' + png.toString('base64')).mimetype, 'image/png');
  assert.throws(() => C.decodeImage(Buffer.from('GIF89a........').toString('base64')), /JPEG/);
  assert.throws(() => C.decodeImage('not base64!!'), /格式/);
  assert.throws(() => C.decodeImage(Buffer.alloc(5 * 1024 * 1024 + 10, 0xff).toString('base64')), /5MB/);
});

test('照片網址：擋內部網路、非 https；轉址每跳重檢', async () => {
  await assert.rejects(C.fetchImage('http://example.com/a.jpg'), /https/);
  await assert.rejects(C.fetchImage('https://127.0.0.1/a.jpg'), /內部網路/);
  await assert.rejects(C.fetchImage('https://metadata.google.internal/x'), /內部網路/);
  const jpg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
  const hops = [];
  const resolve = async h => [{ address: h === 'evil.test' ? '10.0.0.1' : '93.184.216.34', family: 4 }];
  const request = async url => { hops.push(url.hostname); return url.hostname === 'cdn.test' ? { status: 302, location: 'https://evil.test/x.jpg' } : { status: 200, buffer: jpg }; };
  await assert.rejects(C.fetchImage('https://cdn.test/a.jpg', { resolve, request }), /內部網路/);
  assert.deepEqual(hops, ['cdn.test']);
  const ok = await C.fetchImage('https://ok.test/a.jpg', { resolve, request });
  assert.equal(ok.mimetype, 'image/jpeg');
  await assert.rejects(C.fetchImage('https://ok.test/a.jpg', { resolve, request: async () => ({ status: 200, buffer: Buffer.from('<html>hello</html>') }) }), /不是 JPEG/);
});

test('server：三支路由掛 contentEditor（看 pos_staff 職稱）；寫入後官網快取失效；照片 body 8MB 只開給照片與 MCP', () => {
  for (const r of ["app.post('/api/admin/menu/items',auth,adminOnly,requireDb,contentEditor,", "app.patch('/api/admin/menu/items/:id',auth,adminOnly,requireDb,contentEditor,", "app.post('/api/admin/menu/items/:id/photo',auth,adminOnly,requireDb,contentEditor,"]) assert.ok(server.includes(r), r);
  const ce = server.slice(server.indexOf('async function contentEditor'), server.indexOf("app.get('/api/admin/menu/items'"));
  assert.match(ce, /operator_staff_id/); assert.match(ce, /canEditContent\(role\)/); assert.match(ce, /need_content_role/);
  assert.match(server, /snapshotCache\.at=0;\n  req\.posLogDetail/);
  assert.ok(server.indexOf("express.json({ limit: '8mb' })") < server.indexOf("app.use(express.json({ limit: '256kb' }))"));
  assert.doesNotMatch(server, /app\.use\(\/\^/, 'app.use 不可用 RegExp 路徑（vm 測試跨 realm 會丟 TypeError）');
  assert.match(server, /兩店共用品項（甜點、商店）請由言文字管理員/);
});

test('POS 操作紀錄：describe 用進入中介層時的子路徑（finish 時 req.path 已還原成完整路徑）', () => {
  const i = server.indexOf("app.use('/api/admin', (req, res, next) => {");
  const mw = server.slice(i, server.indexOf('\n});', i));
  assert.match(mw, /const subPath = req\.path;/);
  assert.match(mw, /posLog\.describe\(req\.method, subPath\)/);
  assert.doesNotMatch(mw, /posLog\.describe\(req\.method, req\.path\)/);
});

test('MCP：新增三個內容工具；寫入一律帶 staff_pin、品牌鎖定', async () => {
  const names = M.TOOLS ? M.TOOLS.map(t => t.name) : (await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { venue: 'CAFE' })).result.tools.map(t => t.name);
  for (const n of ['pos_menu_items', 'pos_menu_save', 'pos_menu_photo']) assert.ok(names.includes(n), n);
  const calls = [];
  const ctx = { venue: 'CAFE', call: async (m, p, b, h) => { calls.push([m, p, b, h]); return { status: 200, data: { ok: true, item: { id: 'a' } } }; } };
  const r = await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pos_menu_save', arguments: { id: 'a', price: 130, staff_pin: '1234', venue: 'BAR' } } }, ctx);
  assert.ok(!r.result.isError);
  assert.deepEqual(calls[0].slice(0, 3), ['PATCH', '/api/admin/menu/items/a', { price: 130, venue: 'CAFE' }]);
  assert.equal(calls[0][3]['X-Staff-Pin'], '1234');
  await M.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pos_menu_save', arguments: { zh: '拿鐵', price: 150, staff_pin: '1234' } } }, ctx);
  assert.deepEqual(calls[1].slice(0, 2), ['POST', '/api/admin/menu/items']);
  await M.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'pos_menu_photo', arguments: { item_id: 'a', image_url: 'https://x.test/a.jpg', staff_pin: '1234' } } }, ctx);
  assert.deepEqual(calls[2].slice(0, 3), ['POST', '/api/admin/menu/items/a/photo', { image_url: 'https://x.test/a.jpg', venue: 'CAFE' }]);
  const bad = await M.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'pos_menu_save', arguments: { staff_pin: '1234' } } }, ctx);
  assert.ok(bad.result.isError);
  const nop = await M.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'pos_menu_photo', arguments: { item_id: 'a', staff_pin: '1234' } } }, ctx);
  assert.ok(nop.result.isError);
});

test('POS：設定底下有「菜單內容」分頁；員工職稱快選有內容管理員', () => {
  const pos = read('public/pos.html'), ops = read('public/pos-ops.js'), js = read('public/pos-content.js');
  assert.match(pos, /\{ id:'content', icon:'pencil',\s+label:'菜單內容', group:'settings'/);
  assert.match(pos, /content:tabContent/); assert.match(pos, /TAB === 'content'\) loadContent\(\)/);
  assert.match(pos, /<script src="\/pos-content\.js"><\/script>/); assert.match(pos, /pos-content\.css/);
  assert.match(ops, /\['內容管理員','內容管理員'\]/);
  assert.match(js, /\/admin\/menu\/items\/'\+encodeURIComponent\(it\.id\)\+'\/photo'/);
  assert.match(js, /1600\/Math\.max/);
  assert.doesNotMatch(read('public/pos-content.css'), /font-size:0?\.\d+rem/);
});
