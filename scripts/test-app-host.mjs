// app.emoji.tw 消費者子站；沿用前後台拆開的 host 測試框架\n// 前後台拆開：後台獨立服務（SERVICE_ROLE=admin，admin.emoji.tw）與官網服務（www）的 host 分流、OAuth callback 歸屬、排程只在官網跑。
// 以隔離的 server.js（無真 DB、無外網）實跑 HTTP；排程與前端接線以原始碼正則驗證。
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
    process: { env: { NODE_ENV: 'test', APP_SECRET: SECRET, DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  // fetch（undici）不允許自訂 Host 標頭：改走 node:http，回傳物件對齊 fetch 的 status/headers
  return (url, headers = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); });
    req.on('error', reject); req.end();
  });
}
const stateOf = res => require('../lib/security').verifyToken(new URL(res.headers.get('location')).searchParams.get('state'), SECRET, { purpose: 'oauth' });

test('app.emoji.tw：首頁直接出會員 PWA（網址維持 /），帶 noindex；官網首頁不受影響', async t => {
  const get = await server(t);
  const home = await get('/', { host: 'app.emoji.tw' });
  assert.equal(home.status, 200); assert.equal(home.headers.get('x-robots-tag'), 'noindex');
  assert.match(home.body, /rel="manifest" href="\/m\.webmanifest"/); assert.match(home.body, /data-tab="home"/);
  const www = await get('/', { host: 'www.emoji.tw' });
  assert.doesNotMatch(www.body, /data-tab="home"/);
});

test('app.emoji.tw：不屬於 App 的頁面導回官網（保留路徑），App 需要的檔案與 API 不轉', async t => {
  const get = await server(t);
  for (const url of ['/events/abc?x=1', '/space', '/member', '/fellow']) {
    const res = await get(url, { host: 'app.emoji.tw' });
    assert.equal(res.status, 302, url); assert.equal(res.headers.get('location'), 'https://www.emoji.tw' + url, url);
  }
  for (const url of ['/m', '/m.webmanifest', '/m-sw.js', '/m-icon-192.png', '/vendor/qrcode.min.js', '/favicon.svg']) {
    const res = await get(url, { host: 'app.emoji.tw' });
    assert.equal(res.status, 200, url);
  }
  assert.notEqual((await get('/api/health', { host: 'app.emoji.tw' })).status, 302);
});

test('app.emoji.tw：manifest 與 service worker scope 涵蓋整個子網域；官網 /m 仍限 /m', async t => {
  const get = await server(t);
  const app = JSON.parse((await get('/m.webmanifest', { host: 'app.emoji.tw' })).body);
  assert.equal(app.start_url, '/'); assert.equal(app.scope, '/'); assert.equal(app.id, '/'); assert.equal(app.display, 'standalone');
  const www = JSON.parse((await get('/m.webmanifest', { host: 'www.emoji.tw' })).body);
  assert.equal(www.start_url, '/m'); assert.equal(www.scope, '/m');
  assert.equal((await get('/m-sw.js', { host: 'app.emoji.tw' })).headers.get('service-worker-allowed'), '/');
  assert.equal((await get('/m-sw.js', { host: 'www.emoji.tw' })).headers.get('service-worker-allowed'), '/m');
});

test('app.emoji.tw 登入：先跳回官網發起 Google 登入（state cookie 與 callback 同網域），登入後導回 app 子網域', async t => {
  const get = await server(t);
  const res = await get('/auth/google?redirect=' + encodeURIComponent('https://app.emoji.tw/'), { host: 'app.emoji.tw' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://www.emoji.tw/auth/google?redirect=' + encodeURIComponent('https://app.emoji.tw/'));
  const start = await get('/auth/google?redirect=' + encodeURIComponent('https://app.emoji.tw/'), { host: 'www.emoji.tw' });
  assert.equal(start.status, 302);
  assert.equal(stateOf(start).r, 'https://app.emoji.tw/', 'app.emoji.tw 在允許的導回名單內');
  const evil = await get('/auth/google?redirect=' + encodeURIComponent('https://app.emoji.tw.evil.test/'), { host: 'www.emoji.tw' });
  assert.notEqual(stateOf(evil).r, 'https://app.emoji.tw.evil.test/');
});

test('前端：app 子網域用根路徑登入、活動與完整會員專區連回官網；service worker 殼含 /', () => {
  const h = read('public/m.html'), sw = read('public/m-sw.js');
  assert.match(h, /ON_APP=location\.hostname==='app\.emoji\.tw'/);
  assert.match(h, /href="\$\{SITE\}\/events\//); assert.match(h, /href="\$\{SITE\}\/member"/);
  assert.match(h, /register\('\/m-sw\.js',\{scope:ROOT\}\)/);
  assert.match(sw, /VERSION = 'm-v([2-9]|\d{2,})'/); assert.match(sw, /SHELL = \['\/m', '\/'/);
});
