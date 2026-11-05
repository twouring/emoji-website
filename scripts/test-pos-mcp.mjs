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

const FOOD = new RegExp(server.match(/const FOOD_API = \/(.*)\/;/)[1]);

test('權限＝品牌 POS 帳號全部功能（FOOD_API）；POS 以外碰不到', () => {
  for (const [m, p] of [['GET', '/api/admin/sales'], ['POST', '/api/admin/menu/sold-out'], ['POST', '/api/admin/orders/sessions'], ['POST', '/api/admin/staff'], ['POST', '/api/admin/registers/open'], ['GET', '/api/admin/yan/members'], ['POST', '/api/admin/pos/drawer-events']])
    assert.ok(M.allowed(m, p, FOOD), `${m} ${p}`);
  for (const [m, p] of [['GET', '/api/admin/system-settings'], ['GET', '/api/admin/exec'], ['POST', '/api/admin/events'], ['GET', '/api/me'], ['GET', '/api/admin/orders/live']])
    assert.ok(!M.allowed(m, p, FOOD), `${m} ${p}`);
  assert.ok(!M.allowed('GET', '/api/admin/sales', null), '沒傳 FOOD_API 一律拒絕');
});

test('以後新功能自動補進 MCP：每支 POS API 都在 lib/pos-mcp-catalog.json 且有說明（新增後跑 build-pos-mcp-catalog.mjs）', async () => {
  const { buildCatalog } = await import('./build-pos-mcp-catalog.mjs');
  const want = buildCatalog();
  const have = JSON.parse(fs.readFileSync(new URL('../lib/pos-mcp-catalog.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(want).length > 100);
  assert.deepEqual(Object.keys(have).sort(), Object.keys(want).sort(), '路由與目錄不同步：node scripts/build-pos-mcp-catalog.mjs');
  for (const [k, v] of Object.entries(have)) { assert.ok(v, `${k} 缺 docs/API.md 說明`); assert.equal(v, want[k], `${k} 說明過期：重跑 build-pos-mcp-catalog.mjs`); }
});

test('server：pos_endpoints 讀執行中的 Express 路由（新路由自動出現）', () => {
  assert.match(server, /app\._router\?\.stack/);
  assert.match(server, /posMcp\.allowed\(x\.method, x\.path, FOOD_API\)/);
  assert.match(server, /routes: posMcpRoutes/);
});

test('server：auth 認品牌金鑰、鎖品牌、套白名單；操作紀錄記 pos-mcp', () => {
  const i = server.indexOf('async function auth(req, res, next)');
  const body = server.slice(i, server.indexOf('\n}', i));
  assert.match(body, /posMcp\.venueOfKey\(t, SECRET, POS_MCP_KEY_VERSION\)/);
  assert.match(body, /posMcp\.allowed\(req\.method, req\.path, FOOD_API\)/);
  assert.match(body, /brands: \[mcpVenue\]/);
  assert.doesNotMatch(body, /mcp[^\n]*super: true/);
  assert.match(server, /'pos-mcp:' \+ req\.auth\.mcp/);
  assert.match(server, /app\.post\('\/api\/mcp', auth,/);
});

const ctx = (venue, calls = [], reply = () => ({ status: 200, data: {} })) => ({ venue, call: async (m, p, b, h) => { calls.push(h ? [m, p, b, h] : [m, p, b]); return reply(m, p, b); } });

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
  await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pos_set_sold_out', arguments: { item_id: 'm1', sold_out: true, staff_pin: '1111' } } }, ctx('CAFE', calls, () => ({ status: 200, data: { ok: true } })));
  assert.deepEqual(calls[0], ['POST', '/api/admin/menu/sold-out', { item_id: 'm1', sold_out: true, venue: 'CAFE' }, { 'X-Staff-Pin': '1111' }]);
  assert.ok(M.TOOLS.find(t => t.name === 'pos_set_sold_out').inputSchema.required.includes('staff_pin'));
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

test('pos_call：路徑限 /api/admin、venue 自動鎖、帶店長碼；pos_endpoints 附說明', async () => {
  const calls = [];
  const c = ctx('BAR', calls, () => ({ status: 200, data: { ok: true } }));
  c.routes = () => [{ method: 'POST', path: '/api/admin/orders/sessions/:id/checkout' }, { method: 'GET', path: '/api/admin/sales' }];
  await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pos_call', arguments: { method: 'POST', path: '/api/admin/orders/sessions/s1/checkout', body: { method: 'cash', venue: 'CAFE' }, query: { venue: 'CAFE' }, manager_pin: '1234' } } }, c);
  assert.equal(calls[0][1], '/api/admin/orders/sessions/s1/checkout?venue=BAR');
  assert.deepEqual(calls[0][2], { method: 'cash', venue: 'BAR' });
  assert.deepEqual(calls[0][3], { 'X-Manager-Pin': '1234' });
  await M.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'pos_call', arguments: { method: 'POST', path: '/api/admin/orders/sessions', staff_pin: '0420' } } }, c);
  assert.equal(calls.at(-1)[3]['X-Staff-Pin'], '0420');
  for (const path of ['/api/me', '/api/admin/../me', 'https://evil/api/admin/x'])
    assert.equal((await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pos_call', arguments: { method: 'GET', path } } }, c)).result.isError, true, path);
  const ep = await M.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pos_endpoints', arguments: { keyword: '日結' } } }, c);
  const sales = ep.result.structuredContent.endpoints.find(e => e.path === '/api/admin/sales');
  assert.ok(sales && /日結/.test(sales.doc), '關鍵字搜得到說明');
  const none = await M.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'pos_endpoints', arguments: { keyword: 'zzz-不存在' } } }, c);
  assert.equal(none.result.structuredContent.count, 0);
});

test('員工登入：寫入要 X-Staff-Pin、驗 staffByPin（限自己品牌）、覆寫 operator_id、notOperator 擋員工管理', () => {
  const i = server.indexOf('async function auth(req, res, next)');
  const body = server.slice(i, server.indexOf('\n}', i));
  assert.match(body, /req\.method !== 'GET' && req\.method !== 'HEAD'/);
  assert.match(body, /req\.get\('x-staff-pin'\)/);
  assert.match(body, /staffByPin\(pin, mcpVenue\)/);
  assert.match(body, /operator_staff_id: staff\.id/);
  assert.match(body, /req\.body\.operator_id = staff\.id/);
  assert.match(body, /posMcp\.pinLocked\(mcpVenue\)/);
  // notOperator 看 operator_staff_id：員工管理對 MCP 也擋
  assert.match(server, /function notOperator[\s\S]{0,120}req\.auth\.operator_staff_id/);
  assert.match(server, /app\.post\('\/api\/admin\/staff',auth,adminOnly,notOperator/);
  assert.match(server, /'pos-mcp:' \+ req\.auth\.mcp \+ \(req\.auth\.operator_staff_id \? ':' \+ req\.auth\.name/);
});

test('員工識別碼防猜：同品牌錯 10 次鎖 15 分鐘，成功清零，品牌互不影響', () => {
  const t0 = 1e12;
  for (let n = 0; n < 9; n++) M.pinFail('REST', t0);
  assert.equal(M.pinLocked('REST', t0), 0);
  M.pinFail('REST', t0);
  assert.equal(M.pinLocked('REST', t0 + 60e3), 14);
  assert.equal(M.pinLocked('STAY', t0), 0);
  assert.equal(M.pinLocked('REST', t0 + 16 * 60e3), 0, '過 15 分鐘解鎖');
  M.pinFail('REST', t0); M.pinOk('REST'); assert.equal(M.pinLocked('REST', t0), 0);
});
