// POS／KDS 即時同步：hub 的 staff 訂閱者收任何一桌異動；前端 fetch 讀 SSE，輪詢降為備援
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const live = require('../lib/table-live.js');
const { posLiveParse } = require('../public/pos-live.js');
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function fakeRes() {
  const res = { chunks: [], writeHead(code, h) { res.code = code; res.headers = h; }, write(c) { if (res.dead) throw new Error('closed'); res.chunks.push(c); } };
  return res;
}

test('hub：staff 訂閱收所有桌的 changed（只帶 id，不查 DB）；斷線與心跳失敗移除', async () => {
  let loads = 0;
  const hub = live.createHub({ load: async () => { loads++; return null; } });
  const req = new EventEmitter(), res = fakeRes();
  hub.subscribeStaff(req, res);
  assert.equal(res.code, 200); assert.match(res.headers['Content-Type'], /text\/event-stream/);
  assert.match(res.chunks[0], /^retry: \d+\n\n$/);
  await hub.notify('s1'); await hub.notify('s2');
  assert.deepEqual(res.chunks.slice(1), ['event: changed\ndata: {"id":"s1"}\n\n', 'event: changed\ndata: {"id":"s2"}\n\n']);
  assert.equal(loads, 0, '沒有客人訂閱時不查 DB');
  hub.heartbeat(); assert.equal(res.chunks.at(-1), ': ping\n\n');
  req.emit('close'); assert.equal(hub.staffSize(), 0);
  const r2 = fakeRes(); hub.subscribeStaff(new EventEmitter(), r2); r2.dead = true; hub.heartbeat();
  assert.equal(hub.staffSize(), 0, '寫失敗即移除');
});

test('posLiveParse：分塊到達也能組回事件，未完片段留到下一塊', () => {
  const a = posLiveParse('retry: 2000\n\nevent: changed\ndata: {"id":"s1"}\n\nevent: chan');
  assert.deepEqual(a.events.filter(e => e.event === 'changed'), [{ event: 'changed', data: '{"id":"s1"}' }]);
  const b = posLiveParse(a.rest + 'ged\ndata: {"id":"s2"}\n\n: ping\n\n');
  assert.deepEqual(b.events, [{ event: 'changed', data: '{"id":"s2"}' }]);
  assert.equal(b.rest, '');
});

test('接線：路由要登入、FOOD_API 涵蓋、POS 開機啟動、輪詢在 SSE 正常時放慢', () => {
  const server = read('server.js'), pos = read('public/pos.html'), ops = read('public/pos-ops.js'), js = read('public/pos-live.js');
  assert.match(server, /app\.get\('\/api\/admin\/orders\/live',auth,adminOnly,requireDb,/);
  assert.ok(server.indexOf("'/api/admin/orders/live'") < server.indexOf("app.get('/api/admin/orders',"), 'live 要在 /orders 之前註冊');
  assert.ok(pos.includes('<script src="/pos-live.js"></script>') && pos.includes('posLiveBoot();'));
  assert.match(js, /Authorization: 'Bearer ' \+ token/);
  assert.equal((ops.match(/POS_LIVE_OK\?60000:15000/g) || []).length, 3);
  assert.equal((ops.match(/POS_LIVE_OK\?60000:10000/g) || []).length, 2);
  assert.doesNotMatch(ops, /loadPos\(\);\},15000\)|loadOrders\(\);\},10000\)/);
});

test('端到端：/api/admin/orders/live 未登入 401；帶管理金鑰連上後，任何桌異動即時推 changed（不被 gzip 卡住）', async t => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {}, on() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const KEY = 'test-admin-key-' + 'x'.repeat(40);
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ADMIN_API_KEY: KEY } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true; module.exports.liveHub = liveHub;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  const open = headers => new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/admin/orders/live', { headers: { 'Accept-Encoding': 'gzip', ...headers } }, res => {
      const got = []; let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; const p = posLiveParse(buf); buf = p.rest; got.push(...p.events); });
      resolve({ res, got });
    });
    req.on('error', reject); req.end();
  });
  const anon = await open({});
  assert.equal(anon.res.statusCode, 401); anon.res.destroy();
  const c = await open({ Authorization: 'Bearer ' + KEY });
  assert.equal(c.res.statusCode, 200);
  assert.match(c.res.headers['content-type'], /text\/event-stream/);
  assert.equal(c.res.headers['content-encoding'], undefined, 'SSE 不可被 gzip（會緩衝到結束才送）');
  await new Promise(r => setTimeout(r, 30));
  await module.exports.liveHub.notify('sessA');
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(c.got.filter(e => e.event === 'changed').map(e => JSON.parse(e.data).id), ['sessA']);
  c.res.destroy();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(module.exports.liveHub.staffSize(), 0, '斷線即移除');
});
