// POS 與掃碼點餐依店別分網址（KK 11/4）：pos.emoji.tw/atcafe、/3am；atcafe／3am.emoji.tw/order。隔離 server.js 實跑 host 路由。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const SECRET = 'local-test-secret-not-used-in-production';

async function server(t, env = {}) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: SECRET, DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub', GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); }, console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (url, headers = {}) => new Promise((resolve, reject) => { const req = httpRequest(base + url, { headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); }); req.on('error', reject); req.end(); });
}


const T = require(path.join(root, 'lib/table-orders.js'));

test('POS 子網域：/atcafe、/3am（含子分頁）回 POS 頁；www 的 /3am 仍是品牌頁', async t => {
  const get = await server(t);
  for (const p of ['/atcafe', '/atcafe/sales', '/atcafe/table/A3', '/3am', '/3am/analytics/customers', '/pos']) {
    const r = await get(p, { host: 'pos.emoji.tw' });
    assert.equal(r.status, 200, p); assert.match(r.body, /POS_URL_VENUE/, p);
  }
  const w = await get('/3am', { host: 'www.emoji.tw' });
  assert.doesNotMatch(w.body || '', /POS_URL_VENUE/, 'www 的 /3am 不可變成 POS');
});

test('分店網域：atcafe／3am.emoji.tw/order 回點餐頁與資源；其他路徑照舊導回官網', async t => {
  const get = await server(t);
  for (const host of ['atcafe.emoji.tw', '3am.emoji.tw']) {
    const r = await get('/order?s=ts_0123456789abcdef&k=abcdefghijklmnop', { host });
    assert.equal(r.status, 200, host); assert.match(r.body, /桌邊點餐/);
    for (const f of ['/menu-lib.js', '/order-lib.js', '/song-picks.js', '/line-handoff.js', '/event-push-sw.js']) assert.equal((await get(f, { host })).status, 200, host + f);
    assert.equal((await get('/reserve', { host })).status, 302, host + ' /reserve 仍回官網');
  }
  assert.equal((await get('/order', { host: 'staysquare.emoji.tw' })).status, 302, '等等空間沒有點餐');
  const login = await get('/auth/google?redirect=' + encodeURIComponent('https://3am.emoji.tw/order?s=ts_0123456789abcdef&k=x'), { host: 'www.emoji.tw' });
  assert.equal(login.status, 302); assert.match(login.headers.get('location'), /accounts\.google\.com/, '分店網域在登入導回白名單');
});

test('orderBase：依店別給網域；沒帶店別依點餐時段', () => {
  assert.equal(T.orderBase('CAFE'), 'https://atcafe.emoji.tw');
  assert.equal(T.orderBase('BAR'), 'https://3am.emoji.tw');
  assert.equal(T.orderBase('', '2026-11-04T02:00:00Z'), 'https://atcafe.emoji.tw', '台北 10:00');
  assert.equal(T.orderBase(null, '2026-11-04T12:00:00Z'), 'https://3am.emoji.tw', '台北 20:00');
  assert.equal(T.sessionUrl(T.orderBase('BAR'), 'ts_0123456789abcdef', 's').startsWith('https://3am.emoji.tw/order?s=ts_0123456789abcdef&k='), true);
});

test('前端：POS 網址鎖店別、主色用 CIS；點餐頁依網域換 CIS 主色', () => {
  const pos = read('public/pos.html'), order = read('public/order.html'), ops = read('public/pos-ops.js');
  assert.match(pos, /POS_VENUE_BASE = \{ CAFE:'\/atcafe', BAR:'\/3am' \}/);
  assert.match(pos, /SCOPE = POS_URL_VENUE \|\|/);
  assert.match(pos, /const scopesOf = d => POS_URL_VENUE \? \[POS_URL_VENUE\]/);
  assert.match(pos, /html\[data-venue=CAFE\]\{--accent:#984C37;/);
  assert.match(pos, /html\[data-venue=BAR\]\{--accent:#6B8FAB;[^}]*--on-accent:#1B1A17/, '三點水配白字對比不足，主色上用墨字');
  assert.match(ops, /posTableUrl=t=>\(typeof POS_BASE!=='undefined'\?POS_BASE:'\/pos'\)/);
  assert.equal((ops.match(/venue:SCOPE\|\|undefined,operator_id/g) || []).length, 3, '三條開桌路徑都要帶店別，QR 才會印對網域');
  assert.match(order, /\{'atcafe\.emoji\.tw':'CAFE','3am\.emoji\.tw':'BAR'\}\[location\.hostname\]/);
  assert.match(order, /html\[data-venue=CAFE\]\{--yellow:#984C37;--on-yellow:#FFFFFF/);
  assert.match(order, /html\[data-venue=BAR\]\{--yellow:#6B8FAB;--on-yellow:#1B1A17/);
});
