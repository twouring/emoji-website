// 語系預設（KK 2026-11-05）：依瀏覽器語系導向，沒設定就英文；隔離 server.js 實跑。
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


const { pickLang } = require('../lib/lang-pref.js');

test('pickLang：依 q 值取第一個支援語系，沒有就英文', () => {
  assert.equal(pickLang('zh-TW,zh;q=0.9,en;q=0.8'), 'zh');
  assert.equal(pickLang('ja-JP,ja;q=0.9'), 'ja');
  assert.equal(pickLang('en-US,en;q=0.9'), 'en');
  assert.equal(pickLang('fr-FR,fr;q=0.9,ja;q=0.5'), 'ja');
  assert.equal(pickLang('de-DE,ko;q=0.8'), 'en');
  assert.equal(pickLang('en;q=0.5,zh-CN;q=0.9'), 'zh');
  assert.equal(pickLang(''), 'en');
  assert.equal(pickLang(undefined), 'en');
  assert.equal(pickLang('*'), 'en');
});

test('官網與子品牌站：外部進入中文網址依瀏覽器語系轉址，沒設定轉英文', async t => {
  const get = await server(t);
  const cases = [
    ['www.emoji.tw', '/', '', '/en'], ['www.emoji.tw', '/', 'ja,en;q=0.8', '/ja'], ['www.emoji.tw', '/', 'en-US', '/en'],
    ['www.emoji.tw', '/about', 'fr-FR', '/en/about'], ['www.emoji.tw', '/events?x=1', 'ja', '/ja/events?x=1'],
    ['3am.emoji.tw', '/', '', '/en'], ['3am.emoji.tw', '/', 'ja-JP', '/ja'], ['atcafe.emoji.tw', '/cis', 'en', '/en/cis'],
  ];
  for (const [host, url, al, loc] of cases) {
    const r = await get(url, { host, ...(al ? { 'accept-language': al } : {}) });
    assert.equal(r.status, 302, `${host}${url} [${al}]`); assert.equal(r.headers.get('location'), loc, `${host}${url} [${al}]`);
    assert.match(r.headers.get('vary') || '', /Accept-Language/);
  }
});

test('中文瀏覽器、站內切換、cookie、爬蟲與已帶語系的網址都不轉址', async t => {
  const get = await server(t);
  for (const host of ['www.emoji.tw', '3am.emoji.tw']) {
    assert.notEqual((await get('/', { host, 'accept-language': 'zh-TW,zh;q=0.9' })).status, 302, host + ' zh');
    const sw = await get('/', { host, referer: `https://${host}/en` });
    assert.notEqual(sw.status, 302, host + ' 站內切換'); assert.match(String(sw.headers.get('set-cookie') || ''), /site_lang=zh/);
    assert.notEqual((await get('/', { host, 'accept-language': 'en', cookie: 'site_lang=zh' })).status, 302, host + ' cookie zh');
    assert.equal((await get('/', { host, 'accept-language': 'zh-TW', cookie: 'site_lang=ja' })).headers.get('location'), '/ja', host + ' cookie ja');
    assert.notEqual((await get('/', { host, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).status, 302, host + ' bot');
    const en = await get('/en', { host, 'accept-language': 'zh-TW' });
    assert.notEqual(en.status, 302, host + ' /en'); assert.match(String(en.headers.get('set-cookie') || ''), /site_lang=en/);
  }
  // 沒有外語版的頁面、API、靜態檔、其他網域不受影響
  for (const [host, url] of [['www.emoji.tw', '/api/health'], ['www.emoji.tw', '/nav.css'], ['app.emoji.tw', '/'], ['www.emoji.tw', '/m']]) {
    const r = await get(url, { host });
    assert.ok(!/^\/(en|ja)/.test(r.headers.get('location') || ''), `${host}${url} 不轉語系`);
  }
});
