// kk-ec2（AI GO Hosted App 單機管線）副本：四個入口（www／裸網域／pos／app）完全由環境變數決定網域，
// 並以 CRON_MODE=off 關掉所有排程與收款同步。另驗正式站預設值（不設這些變數）行為不變。
// 以隔離的 server.js（無真 DB、無外網）實跑 HTTP。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

// kk-ec2 副本設定（與 docs/kk-ec2-deploy.md、kk-ec2.env.example 同一份）
const D = 'emoji.deploy.43-213-238-222.nip.io';
const KK = {
  PUBLIC_ORIGIN: `https://www.${D}`, APP_ORIGIN: `https://app.${D}`, ADMIN_ORIGIN: `https://admin.${D}`,
  POS_ORIGIN: `https://pos.${D}`, SSO_ORIGIN: `https://sso.${D}`,
  APEX_HOSTS: D, APEX_REDIRECT_ORIGIN: `https://www.${D}`, POS_HOSTS: `pos.${D}`, APP_HOSTS: `app.${D}`, ADMIN_HOSTS: `admin.${D}`, KTV_HOSTS: `ktv.${D}`,
  WEB_ORIGINS: `https://www.${D},https://${D},https://pos.${D},https://app.${D},https://admin.${D}`,
  CRON_MODE: 'off',
};

async function server(t, env = {}) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { method, headers: { 'accept-language': 'zh-TW', ...headers } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
}

test('kk-ec2：裸網域 308 到副本官網（保留路徑、查詢、方法），不跳回正式站', async t => {
  const get = await server(t, KK);
  for (const method of ['GET', 'POST']) {
    const r = await get('/en/events?x=1', { host: D }, method);
    assert.equal(r.status, 308, method); assert.equal(r.location, `https://www.${D}/en/events?x=1`, method);
  }
  assert.notEqual((await get('/', { host: 'emoji.tw' })).status, 308, '副本不再把正式裸網域當成自己的');
  assert.notEqual((await get('/', { host: `www.${D}` })).status, 308);
});

test('kk-ec2：www 首頁、pos 品牌選擇頁、app 會員 PWA 都回 200，跨站轉址都留在副本網域', async t => {
  const get = await server(t, KK);
  const www = await get('/', { host: `www.${D}` });
  assert.equal(www.status, 200); assert.match(www.body, /<html/i);
  const pos = await get('/', { host: `pos.${D}` });
  assert.equal(pos.status, 200); assert.equal(pos.headers['x-robots-tag'], 'noindex'); assert.match(pos.body, /renderBrandPicker/);
  assert.equal((await get('/atcafe', { host: `pos.${D}` })).status, 200, '品牌 POS');
  const app = await get('/', { host: `app.${D}` });
  assert.equal(app.status, 200); assert.match(app.body, /tth_token/, '會員 PWA（m.html）');
  // 不屬於 App 的頁面導回副本官網、/pos 舊網址導回副本 POS、/organizer 導回副本 App、/admin 導回副本後台
  assert.equal((await get('/events', { host: `app.${D}` })).location, `https://www.${D}/events`);
  assert.equal((await get('/pos/sales', { host: `www.${D}` })).location, `https://pos.${D}/`);
  assert.equal((await get('/organizer', { host: `www.${D}` })).location, `https://app.${D}/host`);
  assert.equal((await get('/admin', { host: `app.${D}` })).location, `https://admin.${D}/admin`);
  // 健康檢查（deployd-single 等 8080 回應即就緒；人工驗收看 /api/health）
  const h = await get('/api/health', { host: `www.${D}` });
  assert.equal(h.status, 200); assert.equal(JSON.parse(h.body).ok, true);
  assert.equal((await get('/api/health', { origin: `https://app.${D}` })).headers['access-control-allow-origin'], `https://app.${D}`, 'App 跨網域打 API 放行');
});

test('kk-ec2：Google 登入 callback 綁副本官網網域', async t => {
  const get = await server(t, { ...KK, GOOGLE_CLIENT_ID: 'stub' });
  const r = await get('/auth/google?redirect=' + encodeURIComponent(`https://app.${D}/`), { host: `www.${D}` });
  assert.equal(new URL(r.location).searchParams.get('redirect_uri'), `https://www.${D}/auth/google/callback`);
});

test('CRON_MODE=off：boot() 在收款同步與任何排程之前 return；/internal/cron/* 一律 404', async t => {
  const src = read('server.js'), boot = src.slice(src.indexOf('async function boot()'));
  const off = boot.indexOf("if (CRON_OFF) {");
  assert.ok(off > -1);
  for (const later of ['for (const w of PAY_WATCHERS)', "require('node-cron')", "cronRunner.run('event-webhooks')", 'if (CRON_SCHEDULER) {'])
    assert.ok(off < boot.indexOf(later), 'CRON_OFF 必須在 ' + later + ' 之前');
  assert.match(src, /const CRON_OFF = process\.env\.CRON_MODE === 'off';/);
  const get = await server(t, { ...KK, CRON_SECRET: 'x'.repeat(40) });
  assert.equal((await get('/internal/cron/tick', { 'x-cron-secret': 'x'.repeat(40) }, 'POST')).status, 404);
});

test('正式站預設（不設副本變數）不變：emoji.tw → www.emoji.tw、/pos → pos.emoji.tw', async t => {
  const get = await server(t, { PUBLIC_ORIGIN: 'https://www.emoji.tw' });
  assert.equal((await get('/a?b=1', { host: 'emoji.tw' })).location, 'https://www.emoji.tw/a?b=1');
  assert.equal((await get('/pos', { host: 'www.emoji.tw' })).location, 'https://pos.emoji.tw/');
});

test('前端：App 與找碴圖片以子網域前綴推官網網址，不寫死 emoji.tw', () => {
  const m = read('public/m.html');
  assert.match(m, /const ON_APP=\/\^app\\\.\/\.test\(location\.hostname\), SITE=ON_APP\?location\.origin\.replace\(/);
  assert.doesNotMatch(m, /location\.hostname==='app\.emoji\.tw'/);
  assert.doesNotMatch(read('public/pos-bugs.js'), /'https:\/\/www\.emoji\.tw'/);
});
