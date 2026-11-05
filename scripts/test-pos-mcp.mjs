// POS MCP（KK 11/5）：品牌金鑰只看自己品牌、只打白名單 API、協定基本流程
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../lib/pos-mcp.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const SECRET = 'test-secret-'.repeat(4);

test('金鑰：每個品牌一把、不能互換、換版本作廢', () => {
  const keys = Object.values(M.VENUES).map(v => M.keyFor(v, SECRET));
  assert.equal(new Set(keys).size, 4);
  for (const v of Object.values(M.VENUES)) assert.equal(M.venueOfKey(M.keyFor(v, SECRET), SECRET), v);
  const cafe = M.keyFor('CAFE', SECRET);
  assert.equal(M.venueOfKey(cafe.replace('pmk_cafe_', 'pmk_bar_'), SECRET), null, '改前綴冒充別的品牌');
  assert.equal(M.venueOfKey(cafe, 'other-secret'), null);
  assert.equal(M.venueOfKey(cafe, SECRET, 'v2'), null);
  assert.equal(M.venueOfKey('pmk_cafe_x', SECRET), null);
  assert.equal(M.venueOfKey(cafe, ''), null);
});

test('白名單：只有唯讀查詢＋估清，碰不到會員、員工、設定、結帳', () => {
  assert.ok(M.allowed('GET', '/api/admin/sales'));
  assert.ok(M.allowed('POST', '/api/admin/menu/sold-out'));
  for (const [m, p] of [['GET', '/api/admin/yan/members'], ['POST', '/api/admin/staff'], ['GET', '/api/admin/system-settings'], ['POST', '/api/admin/orders/sessions'], ['POST', '/api/admin/sales'], ['GET', '/api/me'], ['GET', '/api/admin/sales/x']])
    assert.ok(!M.allowed(m, p), `${m} ${p}`);
});

test('server：auth 認品牌金鑰、鎖品牌、套白名單；操作紀錄記 pos-mcp', () => {
  const i = server.indexOf('async function auth(req, res, next)');
  const body = server.slice(i, server.indexOf('\n}', i));
  assert.match(body, /posMcp\.venueOfKey\(t, SECRET, POS_MCP_KEY_VERSION\)/);
  assert.match(body, /posMcp\.allowed\(req\.method, req\.path\)/);
  assert.match(body, /brands: \[mcpVenue\]/);
  assert.doesNotMatch(body, /mcp[^\n]*super: true/);
  assert.match(server, /'pos-mcp:' \+ req\.auth\.mcp/);
  assert.match(server, /app\.post\('\/api\/mcp', auth,/);
});

const ctx = (venue, calls = [], reply = () => ({ status: 200, data: {} })) => ({ venue, call: async (m, p, b) => { calls.push([m, p, b]); return reply(m, p, b); } });

test('協定：initialize／tools/list／通知／未知方法', async () => {
  const init = await M.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, ctx('BAR'));
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /三點水/);
  const list = await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx('BAR'));
  assert.ok(list.result.tools.length >= 10);
  for (const t of list.result.tools) assert.equal(t.inputSchema.type, 'object');
  assert.equal(await M.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx('BAR')), null);
  assert.equal((await M.handle({ jsonrpc: '2.0', id: 3, method: 'nope' }, ctx('BAR'))).error.code, -32601);
  assert.equal((await M.handle({ id: 4 }, ctx('BAR'))).error.code, -32600);
});

test('tools/call：品牌金鑰的 venue 一律鎖自己品牌', async () => {
  const calls = [];
  const out = await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pos_sales', arguments: { venue: 'CAFE', day: '2026-11-04' } } },
    ctx('BAR', calls, () => ({ status: 200, data: { day: '2026-11-04', orders: 3, amount: 900, items: [] } })));
  assert.equal(calls[0][1], '/api/admin/sales?venue=BAR&day=2026-11-04');
  assert.equal(out.result.structuredContent.venue, 'BAR');
  assert.equal(JSON.parse(out.result.content[0].text).amount, 900);
});

test('tools/call：估清只送自己品牌；API 錯誤回 isError', async () => {
  const calls = [];
  await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pos_set_sold_out', arguments: { item_id: 'm1', sold_out: true } } }, ctx('CAFE', calls, () => ({ status: 200, data: { ok: true } })));
  assert.deepEqual(calls[0], ['POST', '/api/admin/menu/sold-out', { item_id: 'm1', sold_out: true, venue: 'CAFE' }]);
  const bad = await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pos_set_sold_out', arguments: { item_id: 'x', sold_out: true } } }, ctx('CAFE', [], () => ({ status: 403, data: { error: '只能估清自己店別' } })));
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /自己店別/);
});

test('tools/call：總公司金鑰要帶 venue；pos_menu 依品牌過濾', async () => {
  const none = await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pos_status', arguments: {} } }, ctx(null));
  assert.equal(none.result.isError, true);
  const menu = { items: [
    { id: 'a', zh: '拿鐵', cat: 'COFFEE', venue: 'CAFE', price: 150, published: true },
    { id: 'b', zh: '調酒', cat: 'COCKTAIL', venue: 'BAR', price: 380, published: true },
    { id: 'c', zh: '可麗露', cat: 'DESSERT', venue: 'CAFE', price: 90, published: true },
  ] };
  const out = await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pos_menu', arguments: {} } }, ctx('BAR', [], () => ({ status: 200, data: { content: { menu: JSON.stringify(menu) } } })));
  const ids = out.result.structuredContent.items.map(i => i.id).sort();
  assert.deepEqual(ids, ['b', 'c'], '三點水看得到自己的酒與共用甜點，看不到在咖啡咖啡');
});
