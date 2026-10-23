// app.emoji.tw 消費者／主辦子站；隔離 server.js（無真 DB、無外網）實跑 host 路由。
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

test('app.emoji.tw：首頁與 /host 都回會員 PWA；其他網頁仍導回官網', async t => {
  const get = await server(t);
  for (const url of ['/', '/host', '/host/event_123']) { const r = await get(url, { host: 'app.emoji.tw' }); assert.equal(r.status, 200, url); assert.match(r.body, /data-tab="home"/); }
  const no = await get('/events/abc?x=1', { host: 'app.emoji.tw' }); assert.equal(no.status, 302); assert.equal(no.headers.get('location'), 'https://www.emoji.tw/events/abc?x=1');
  assert.equal((await get('/m-sw.js', { host: 'app.emoji.tw' })).headers.get('service-worker-allowed'), '/');
});

test('舊 /organizer 無論網域都轉 App /host，單場路徑保留活動 id', async t => {
  const get = await server(t);
  for (const host of ['www.emoji.tw', 'admin.emoji.tw', 'app.emoji.tw']) {
    let r = await get('/organizer?x=1', { host }); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://app.emoji.tw/host?x=1');
    r = await get('/organizer/events/e_abc/guests?x=1', { host }); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://app.emoji.tw/host/e_abc?x=1');
  }
});

test('前端含 App 主辦路由、建立三步、匯入與管理錨點', () => {
  const h = read('public/m.html'), host=read('public/m-host.js');
  assert.match(h, /<script src="\/m-host\.js"><\/script>/);
  for (const needle of ['/api/organizer/state', '/api/me/event-applications', '/api/venue-fee/quote', '/api/event-applications', '/api/me/event-import', 'hostPath', '開啟相機簽到']) assert.ok(host.includes(needle), needle);
  for (const needle of ['uxGuests', 'uxInvite', 'uxCheckin', 'uxCheckinMode', 'data-ug-filter', '/check-in/lookup', "'/guests/import'", '快速模式']) assert.ok(host.includes(needle), needle);
  // 一筆報名多張票：來賓清單拆成每位參加者，簽到／撤銷要帶 attendee_id，否則後端回「請選擇一位參加者」。
  assert.match(host, /attendee_id:r\.attendee_id/); assert.match(host, /\?attendee_id='\+encodeURIComponent\(r\.attendee_id\)/);
  assert.match(h, /id="ovnext"/);
  assert.match(host, /HOST_I18N=.*zh:.*en:.*ja:/s);
  assert.match(host, /unlock_code/); assert.match(host, /PAYOUT_ACCOUNT_REQUIRED/);
  assert.match(host, /\/api\/me\/payout-account/); assert.match(host, /\/payments/);
  assert.match(read('public/m-sw.js'), /m-host\.js/);
  assert.match(read('server.js'), /m-host\\\.js\$/);
  assert.match(h, /https:\/\/app\.emoji\.tw\/host|href="\/host"/);
  assert.match(read('public/event-checkin.html'), /https:\/\/app\.emoji\.tw\/host/);
  assert.match(read('lib/event-mailer.js'), /appOrigin\+'\/host\/'/);
});

test('活動匯入解析 JSON-LD、OG，並阻擋 SSRF 私網／IPv6 私網', async () => {
  const imp = require('../lib/event-import');
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"測試活動","description":"活動介紹","startDate":"2026-11-01T09:00:00+00:00","endDate":"2026-11-01T11:00:00+00:00","location":{"@type":"Place","name":"言文字","address":{"addressLocality":"台北市","streetAddress":"仁愛路"}},"image":"/cover.jpg","organizer":{"name":"言文字"}}</script>`;
  const got = imp.parseEventHtml(html, 'https://events.example/a');
  assert.equal(got.title, '測試活動'); assert.equal(got.starts_at, '2026-11-01T17:00'); assert.equal(got.image_url, 'https://events.example/cover.jpg'); assert.ok(got.fields_found.includes('location'));
  const og = imp.parseEventHtml('<meta property="og:title" content="OG 活動"><meta property="og:description" content="內容"><title>不應優先</title>', 'https://a.example'); assert.equal(og.title, 'OG 活動');
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', 'fe80::1']) assert.equal(imp.isBlockedIp(ip), true, ip);
  await assert.rejects(imp.checkUrl('http://example.com'), /只接受/);
  await assert.rejects(imp.checkUrl('https://x.test', { resolve: async () => [{ address: '127.0.0.1', family: 4 }] }), /內部網路/);
});

test('匯入轉址逐跳重做 SSRF 驗證，不會跟到內網', async () => {
  const imp = require('../lib/event-import'); let requests = 0;
  await assert.rejects(imp.fetchEventPage('https://safe.test/a', { resolve: async host => host === 'safe.test' ? [{ address: '8.8.8.8', family: 4 }] : [{ address: '127.0.0.1', family: 4 }], request: async () => { requests++; return { status: 302, headers: { location: 'https://private.test/x' }, body: '' }; } }), /內部網路/);
  assert.equal(requests, 1);
});

test('App 主辦子畫面：「‹ 返回」回上一個畫面，不直接跳回列表；按鈕文字不換行', () => {
  const host = read('public/m-host.js');
  assert.match(host, /function navBack\(\)/);
  assert.match(host, /hostTickets=navScreen\('hostTickets',hostTickets\)/);
  assert.match(host, /uxHome=navScreen\('uxHome',uxHome,true\)/);
  assert.match(host, /id="host-back"[^`]*white-space:nowrap[^`]*‹ 返回/);
  assert.doesNotMatch(host, /‹ 我的活動/);
});
