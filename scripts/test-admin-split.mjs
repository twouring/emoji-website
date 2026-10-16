// 前後台拆開：後台獨立服務（SERVICE_ROLE=admin，admin.emoji.tw）與官網服務（www）的 host 分流、OAuth callback 歸屬、排程只在官網跑。
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
    const req = httpRequest(base + url, { headers }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); });
    req.on('error', reject); req.end();
  });
}
const stateOf = res => require('../lib/security').verifyToken(new URL(res.headers.get('location')).searchParams.get('state'), SECRET, { purpose: 'oauth' });

test('官網服務：正式網域的 /admin 轉到 admin.emoji.tw（保留路徑與查詢字串）；活動管理 /organizer 留在官網；本機、pos、admin 子網域不轉', async t => {
  const get = await server(t);
  const cases = [['/admin', '/admin'], ['/admin/members?tab=points', '/admin/members?tab=points']];
  for (const [url, expected] of cases) {
    const res = await get(url, { host: 'www.emoji.tw' });
    assert.equal(res.status, 302, url); assert.equal(res.headers.get('location'), 'https://admin.emoji.tw' + expected, url);
  }
  // 活動管理（活動主入口）在官網：www 直接出頁，不轉後台網域
  for (const url of ['/organizer', '/organizer/events/abc?task=hosts']) {
    const res = await get(url, { host: 'www.emoji.tw' });
    assert.equal(res.status, 200, url); assert.equal(res.headers.get('x-robots-tag'), 'noindex', url);
  }
  const legacy = await get('/admin.html', { host: 'www.emoji.tw' });
  assert.equal(legacy.status, 301); assert.equal(legacy.headers.get('location'), 'https://admin.emoji.tw/admin');
  // admin 子網域暫由官網服務代管（domain mapping 尚未切換）時照常出後台頁，不可轉回自己造成迴圈
  const hosted = await get('/admin', { host: 'admin.emoji.tw' });
  assert.equal(hosted.status, 200); assert.equal(hosted.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await get('/', { host: 'admin.emoji.tw' })).headers.get('location'), '/admin');
  // 代管中的 admin 子網域上的 /organizer 反向轉回官網（活動管理只有 www 一個家）
  const back = await get('/organizer/events/abc?task=hosts', { host: 'admin.emoji.tw' });
  assert.equal(back.status, 302); assert.equal(back.headers.get('location'), 'https://www.emoji.tw/organizer/events/abc?task=hosts');
  assert.equal((await get('/admin', { host: '127.0.0.1' })).status, 200, '本機開發不轉');
  assert.equal((await get('/organizer', { host: '127.0.0.1' })).status, 200, '本機開發不轉');
  assert.equal((await get('/admin', { host: 'pos.emoji.tw' })).headers.get('location'), '/pos', 'POS 子網域維持轉 /pos');
  // 管理 API 不轉（AI agent 以 ADMIN_API_KEY 打 www）
  assert.notEqual((await get('/api/admin/users', { host: 'www.emoji.tw' })).status, 302);
  // 官網首頁與其他頁不受影響
  assert.equal((await get('/', { host: 'www.emoji.tw' })).status, 200);
});

test('官網服務：代管的 admin 子網域發起 Google 登入先跳回 www（cookie 與 callback 同 host）；導回目標即使環境變數漏列 admin 也放行', async t => {
  const get = await server(t, { WEB_ORIGINS: 'https://www.emoji.tw,https://emoji.tw,https://pos.emoji.tw' });
  const target = 'https://admin.emoji.tw/admin/events';
  const hop = await get('/auth/google?redirect=' + encodeURIComponent(target), { host: 'admin.emoji.tw' });
  assert.equal(hop.status, 302); assert.equal(hop.headers.get('location'), 'https://www.emoji.tw/auth/google?redirect=' + encodeURIComponent(target));
  const start = await get('/auth/google?redirect=' + encodeURIComponent(target), { host: 'www.emoji.tw' });
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('redirect_uri'), 'https://www.emoji.tw/auth/google/callback');
  assert.equal(stateOf(start).r, target, '後台網域一律在白名單內，不會被退回 /member');
  assert.equal(stateOf(await get('/auth/google?redirect=' + encodeURIComponent('https://admin.emoji.tw.evil.test/admin'), { host: 'www.emoji.tw' })).r, 'https://app.emoji.tw/');
  assert.equal((await get('/api/health', { origin: 'https://admin.emoji.tw' })).headers.get('access-control-allow-origin'), 'https://admin.emoji.tw');
});

test('後台服務（SERVICE_ROLE=admin）：任何 host 首頁都是 /admin、不轉出去、/organizer 轉回官網、Google callback 綁 admin.emoji.tw、公開頁連結仍指 www', async t => {
  const get = await server(t, { SERVICE_ROLE: 'admin' });
  for (const host of ['admin.emoji.tw', 'emoji-admin-abc.a.run.app', '127.0.0.1']) {
    assert.equal((await get('/', { host })).headers.get('location'), '/admin', host);
    assert.equal((await get('/admin/members', { host })).status, 200, host);
    const org = await get('/organizer/events/x?task=hosts', { host });
    assert.equal(org.status, 302, host); assert.equal(org.headers.get('location'), 'https://www.emoji.tw/organizer/events/x?task=hosts', host + '：活動管理在官網');
  }
  // 本機開發的後台服務（PUBLIC_ORIGIN=http://…）不轉，避免把本機 /organizer 丟到正式站
  const local = await server(t, { SERVICE_ROLE: 'admin', PUBLIC_ORIGIN: 'http://localhost:8080', ADMIN_ORIGIN: 'http://localhost:8081' });
  assert.equal((await local('/organizer/events/x', { host: 'localhost' })).status, 200);
  const target = 'https://admin.emoji.tw/admin';
  const start = await get('/auth/google?redirect=' + encodeURIComponent(target), { host: 'admin.emoji.tw' });
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin, 'https://accounts.google.com', '後台服務自己發起，不再跳 www');
  assert.equal(google.searchParams.get('redirect_uri'), 'https://admin.emoji.tw/auth/google/callback');
  assert.equal(stateOf(start).r, target);
  assert.match([].concat(start.headers.get('set-cookie') || []).join(';'), /oauth_state=/, 'state cookie 設在後台網域');
});

test('排程只在官網服務跑；後台頁的登入鈕走同網域 /auth/google；CI 同一個 image 部署 emoji-website 與 emoji-admin', () => {
  const src = read('server.js');
  const boot = src.slice(src.indexOf('async function boot()'));
  const guard = boot.indexOf("if (ADMIN_MODE) { console.log('[boot] SERVICE_ROLE=admin"), firstCron = boot.indexOf("require('node-cron')"), webhook = boot.indexOf('deliverEventWebhookOnce');
  assert.ok(guard > -1 && guard < firstCron && guard < webhook, '後台服務必須在任何排程啟動前 return');
  // Railway 備援環境與 Cloud Run 共用同一支 IG token 卻各有一顆 DB，排程若也跑就雙發（2026-10-13）
  assert.match(src, /const RAILWAY_MODE = !!process\.env\.RAILWAY_ENVIRONMENT;/);
  const railwayGuard = boot.indexOf("if (RAILWAY_MODE) { console.log('[boot] RAILWAY_ENVIRONMENT");
  assert.ok(railwayGuard > -1 && railwayGuard < firstCron && railwayGuard < webhook, 'Railway 備援環境必須在任何排程啟動前 return');
  assert.match(src, /const OWN_BASE = ADMIN_MODE \? ADMIN_BASE : SITE_BASE;/);
  for (const name of ['GOOGLE_REDIRECT_URI', 'GOOGLE_MEET_REDIRECT_URI', 'ZOOM_REDIRECT_URI']) assert.match(src, new RegExp(`const ${name} = OWN_BASE \\+ '`), name + ' 必須綁服務自己的網址');
  assert.match(src, /url=OWN_BASE\+'\/event-login\.html\?lang='/, 'Email 登入連結回到發起的服務');
  const admin = read('public/admin.html');
  assert.match(admin, /href="\/auth\/google\?redirect=\$\{redirect\}"/);
  assert.doesNotMatch(admin, /AUTH_ORIGIN/, '後台不再在前端猜 www 網域');
  const ci = read('.github/workflows/deploy.yml');
  assert.match(ci, /ADMIN_SERVICE: emoji-admin/);
  assert.match(ci, /gcloud run deploy "\$ADMIN_SERVICE" --image "\$IMAGE:\$\{\{ github\.sha \}\}"/);
});
