// 會員功能全部在會員 App（app.emoji.tw／public/m.html）；官網不再有 /member 會員頁
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const m = read('public/m.html'), server = read('server.js');

async function boot(t, env = {}) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(server + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (url, headers = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); });
    req.on('error', reject); req.end();
  });
}

test('官網會員頁已刪除；/member 三語（含舊 .html）302 到會員 App 並保留查詢字串', async t => {
  for (const f of ['public/member.html', 'public/en/member.html', 'public/ja/member.html', 'lib/member-ui.js']) assert.equal(fs.existsSync(path.join(root, f)), false, f);
  const get = await boot(t);
  for (const url of ['/member', '/member.html', '/en/member', '/ja/member', '/en/member.html']) {
    const res = await get(url, { host: 'www.emoji.tw' });
    assert.equal(res.status, 302, url); assert.equal(res.headers.get('location'), 'https://app.emoji.tw/', url); assert.equal(res.headers.get('x-robots-tag'), 'noindex', url);
  }
  const paid = await get('/member?plan_paid=1&s=cs_x', { host: 'www.emoji.tw' });
  assert.equal(paid.headers.get('location'), 'https://app.emoji.tw/?plan_paid=1&s=cs_x', 'Stripe 舊導回連結仍能到 App 驗證付款');
});

test('登入預設導回會員 App；App 網域在導回白名單；Stripe 會籍付款成功／取消都回 App', () => {
  assert.match(server, /const APP_BASE = \(process\.env\.APP_ORIGIN \|\| 'https:\/\/app\.emoji\.tw'\)/);
  assert.match(server, /const DEFAULT_MEMBER_URL = \(process\.env\.MEMBER_URL \|\| APP_BASE \+ '\/'\)/);
  assert.match(server, /SITE_BASE, ADMIN_BASE, APP_BASE\]\)\]/);
  assert.match(server, /success_url: `\$\{APP_BASE\}\/\?plan_paid=1&s=\{CHECKOUT_SESSION_ID\}`/);
  assert.match(server, /cancel_url: `\$\{APP_BASE\}\/\?plan_canceled=1`/);
  assert.doesNotMatch(server, /\$\{SITE_BASE\}\/member|memberBase|lang === 'en' \? '\/en\/member'/);
  assert.match(server, /app\.get\(\['\/member', '\/member\.html', '\/en\/member', '\/en\/member\.html', '\/ja\/member', '\/ja\/member\.html'\]/, '舊網址 302 轉址路由');
  // 通知信也改指 App
  assert.doesNotMatch(server, /會員專區：\$\{SITE_BASE\}/);
  assert.match(server, /會員 App：\$\{APP_BASE\}\//);
});

test('/api/state 會員資料依 ?lang= 回活動語系', () => {
  assert.match(server, /const lang = \['en', 'ja'\]\.includes\(String\(req\.query\.lang \|\| ''\)\) \? String\(req\.query\.lang\) : 'zh';/);
  assert.match(server, /events:events\.map\(e=>publicEventCopy\(localizeEvent\(e,lang\)\)\)/);
  assert.match(m, /get\('\/api\/state\?lang='\+LANG\)/);
});

test('App 含官網會員頁搬過來的全部功能：會籍狀態與購買、進出 QR、活動與會員動態、資料編輯、LINE 綁定、三語', () => {
  for (const tab of ['home', 'plan', 'events', 'me']) assert.match(m, new RegExp(`data-tab="${tab}"`), tab);
  assert.match(m, /\/api\/me\/access-qr/); assert.match(m, /\/api\/me\/card/); assert.match(m, /\/api\/me\/yan/); assert.match(m, /\/api\/me\/rewards/);
  assert.match(m, /\/api\/me\/plans\/checkout/); assert.match(m, /\/api\/me\/plans\/verify/); assert.match(m, /plan_paid/); assert.match(m, /plan_canceled/);
  assert.match(m, /\/api\/me\/profile/); assert.match(m, /\/api\/me\/line-link/); assert.match(m, /\/api\/passkey/);
  assert.match(m, /data\.updates/); assert.match(m, /commitments/); assert.match(m, /cert_no/);
  assert.match(m, /PLAN_PRICES=\{day_4h:200,day_12h:500,month:4000,quarter:10000,year:35000\}/);
  for (const lang of ['zh', 'en', 'ja']) assert.match(m, new RegExp(`\\n\\s+${lang}:\\{locale:'`), lang + ' i18n');
  assert.match(m, /\/event-login\.html\?lang=/);
  // 活動詳情連回官網並帶 token，不用再登入
  assert.match(m, /SITE\+BASE\+'\/events\/'\+encodeURIComponent\(e\.slug\|\|e\.id\)\+'#token='/);
  // 不再連回已刪除的官網會員頁
  assert.doesNotMatch(m, /\/member\b/);
  // 使用者資料一律 esc()
  assert.match(m, /esc\(me\.name/); assert.match(m, /esc\(e\.title\)/); assert.match(m, /esc\(u\.title\)/);
  assert.match(read('public/m-sw.js'), /VERSION = 'm-v(9|\d{2,})'/);
});

test('官網不再有會員入口：導覽／頁尾／消費方式／首頁連到 App，nav.js 不讀 token', () => {
  for (const f of ['public/index.html', 'public/en/index.html', 'public/ja/index.html', 'public/system.html', 'public/en/system.html', 'public/ja/system.html', 'public/nav.js', 'lib/layout.js',
    'views/partials/header-zh.html', 'views/partials/header-en.html', 'views/partials/header-ja.html', 'views/partials/footer-zh.html', 'views/partials/footer-en.html', 'views/partials/footer-ja.html']) {
    assert.doesNotMatch(read(f), /href="(?:\/en|\/ja)?\/member"|NAV_MEMBER_CURRENT|data-label-authed|會員專區|Member area|会員エリア/, f);
  }
  assert.doesNotMatch(read('public/nav.js'), /tth_token|\/api\/state/);
  for (const f of ['public/system.html', 'views/partials/header-zh.html', 'views/partials/footer-zh.html']) assert.match(read(f), /https:\/\/app\.emoji\.tw\//, f);
  const login = read('public/event-login.html');
  assert.match(login, /const APP='https:\/\/app\.emoji\.tw\/'/); assert.doesNotMatch(login, /location\.origin\+'\/member'/);
});
