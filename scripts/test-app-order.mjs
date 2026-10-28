// 桌邊點餐收進會員 App（app.emoji.tw/order）；隔離 server.js（無真 DB、無外網）實跑 host 路由。
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

test('桌邊點餐收進 App：app.emoji.tw/order 回點餐頁與所需資源；www 舊連結帶參數轉到 App', async t => {
  const get = await server(t);
  const r = await get('/order?s=ts_0123456789abcdef&k=abcdefghijklmnop', { host: 'app.emoji.tw' });
  assert.equal(r.status, 200); assert.match(r.body, /桌邊點餐/);
  for (const f of ['/menu-lib.js', '/order-lib.js', '/song-picks.js', '/event-push-sw.js']) assert.equal((await get(f, { host: 'app.emoji.tw' })).status, 200, f);
  const w = await get('/order?s=ts_0123456789abcdef&k=abcdefghijklmnop', { host: 'www.emoji.tw' });
  assert.equal(w.status, 302); assert.equal(w.headers.get('location'), 'https://app.emoji.tw/order?s=ts_0123456789abcdef&k=abcdefghijklmnop');
  // 官網其他頁仍不在 App 網域重複出現
  assert.equal((await get('/menu', { host: 'app.emoji.tw' })).status, 302);
});

test('開桌 QR、補印、取餐推播的網址都指向 App', () => {
  const s = read('server.js');
  assert.equal((s.match(/sessionUrl\(SITE_BASE/g) || []).length, 0);
  assert.equal((s.match(/sessionUrl\(APP_BASE/g) || []).length, 3);
});

test('點餐頁：App 網域共用會員登入、可加到主畫面（裝的是 App）、從 App 開有返回鍵', () => {
  const h = read('public/order.html');
  assert.match(h, /<link rel="manifest" href="\/m\.webmanifest">/);
  assert.match(h, /TOKEN_KEY=ON_APP\?'tth_token':'order_member_token'/);
  assert.match(h, /id="install-card"/); assert.match(h, /id="inst"/); assert.match(h, /beforeinstallprompt/);
  assert.match(h, /register\('\/event-push-sw\.js',\{scope:'\/order'\}\)/);   // 不可佔用 App 的根 scope（m-sw.js）
  assert.match(h, /id="app-home"/);
  require(path.join(root, 'public/order-lib.js')); const L = globalThis.OrderLib;
  for (const lang of ['zh', 'en', 'ja']) for (const k of ['inst_title', 'inst_sub', 'inst_btn', 'inst_later', 'inst_ios_1', 'inst_ios_2', 'inst_ios_3', 'inst_inapp_1']) {
    const v = L.text(lang, k); assert.ok(v && v !== k, lang + ' ' + k);
  }
});

test('會員 App 首頁有「掃碼點餐」：掃到本桌 QR 在 App 內開 /order', () => {
  const m = read('public/m.html');
  assert.match(m, /id="order-scan"/); assert.match(m, /function startOrder\(\)/);
  assert.match(m, /location\.href='\/order\?s='/);
  assert.match(m, /async function scanTable\(sub,onTable\)/);
  for (const k of ["orderScan:'掃碼點餐'", "orderScan:'Scan to order'", "orderScan:'QRで注文'"]) assert.ok(m.includes(k), k);
});
