// 單一登入 sso.emoji.tw：/authorize、/logout、/api/sso/session、host 分流，以及各站前端都接上 sso-client.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const SECRET = 'test-only-sso-secret';
const sec = require('../lib/security');

async function harness(t) {
  const users = [{ id: 'u-1', name: '測試', email: 'm@example.test', is_admin: false }];
  const run = async (sql, args = []) => {
    if (sql.includes('FROM users WHERE id=$1')) return { rows: users.filter(u => u.id === args[0]) };
    if (sql.includes('COUNT(*)::int AS n FROM commitments')) return { rows: [{ n: 0 }] };
    if (sql.includes('SELECT EXISTS')) return { rows: [{ allowed: false }] };
    return { rows: [], rowCount: 0 };
  };
  const mod = { exports: {} };
  const localRequire = n => n === 'pg' ? { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } } : n === 'stripe' ? class {} : createRequire(path.join(root, 'server.js'))(n);
  const ctx = vm.createContext({ require: localRequire, module: mod, __dirname: root, process: { env: { NODE_ENV: 'test', APP_SECRET: SECRET, DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub', GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x' } }, Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout, setInterval, clearInterval, console: { log() {}, warn() {}, error() {} } });
  new vm.Script(read('server.js') + '\ndbReady=true;').runInContext(ctx);
  const http = mod.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(r => { http.close(r); http.closeAllConnections(); }));
  const call = (url, { host = 'sso.emoji.tw', method = 'GET', body, cookie, origin } = {}) => fetch('http://127.0.0.1:' + http.address().port + url, {
    method, redirect: 'manual',
    headers: { 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { call, users };
}
const ssoCookie = sub => 'emoji_sso=' + encodeURIComponent(sec.signToken({ sub, role: 'invited' }, SECRET, { purpose: 'sso' }));

test('/authorize：有 SSO cookie 就核發該站 session token 帶回，並順延 cookie', async t => {
  const { call } = await harness(t);
  const r = await call('/authorize?redirect=' + encodeURIComponent('https://pos.emoji.tw/pos'), { cookie: ssoCookie('u-1') });
  assert.equal(r.status, 302);
  const loc = r.headers.get('location');
  assert.match(loc, /^https:\/\/pos\.emoji\.tw\/pos#token=/);
  const tok = decodeURIComponent(loc.split('#token=')[1]);
  const p = sec.verifyToken(tok, SECRET);
  assert.equal(p.sub, 'u-1'); assert.equal(p.purpose, 'session');
  assert.match(r.headers.get('set-cookie') || '', /emoji_sso=.*HttpOnly/i);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  // 各品牌站、App、admin 都可以
  for (const h of ['app.emoji.tw', 'admin.emoji.tw', 'atcafe.emoji.tw', '3am.emoji.tw', 'staysquare.emoji.tw', 'restbook.emoji.tw', 'www.emoji.tw']) {
    const x = await call('/authorize?redirect=' + encodeURIComponent('https://' + h + '/'), { cookie: ssoCookie('u-1') });
    assert.match(x.headers.get('location'), new RegExp('^https://' + h.replace(/\./g, '\\.') + '/#token='), h);
  }
});

test('/authorize：未登入 prompt=none 回 #sso=none，否則轉 /login；無效 cookie 清掉', async t => {
  const { call } = await harness(t);
  const back = encodeURIComponent('https://app.emoji.tw/');
  const a = await call('/authorize?prompt=none&redirect=' + back);
  assert.equal(a.headers.get('location'), 'https://app.emoji.tw/#sso=none');
  const b = await call('/authorize?redirect=' + back);
  assert.equal(b.headers.get('location'), '/login?redirect=' + back);
  const c = await call('/authorize?prompt=none&redirect=' + back, { cookie: 'emoji_sso=forged.sig' });
  assert.equal(c.headers.get('location'), 'https://app.emoji.tw/#sso=none');
  assert.match(c.headers.get('set-cookie') || '', /emoji_sso=;/);
  // session token 不能冒充 SSO cookie（purpose 不同）
  const d = await call('/authorize?prompt=none&redirect=' + back, { cookie: 'emoji_sso=' + encodeURIComponent(sec.signToken({ sub: 'u-1', role: 'invited' }, SECRET)) });
  assert.equal(d.headers.get('location'), 'https://app.emoji.tw/#sso=none');
  // 已刪除的帳號
  const e = await call('/authorize?prompt=none&redirect=' + back, { cookie: ssoCookie('u-gone') });
  assert.equal(e.headers.get('location'), 'https://app.emoji.tw/#sso=none');
});

test('/authorize：不把 token 交給白名單外或非 https 的網址', async t => {
  const { call } = await harness(t);
  for (const bad of ['https://evil.example/', 'http://localhost:5500/', 'https://emoji.tw.evil.example/', 'javascript:alert(1)']) {
    const r = await call('/authorize?redirect=' + encodeURIComponent(bad), { cookie: ssoCookie('u-1') });
    assert.match(r.headers.get('location'), /^https:\/\/app\.emoji\.tw\/#token=/, bad);
  }
});

test('/api/sso/session：只收 sso.emoji.tw 同源，換 cookie；POS 操作人員 token 不收', async t => {
  const { call } = await harness(t);
  const tok = sec.signToken({ sub: 'u-1', role: 'invited' }, SECRET);
  assert.equal((await call('/api/sso/session', { method: 'POST', body: { token: tok } })).status, 403);
  assert.equal((await call('/api/sso/session', { method: 'POST', body: { token: tok }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/sso/session', { method: 'POST', body: { token: tok }, origin: 'https://sso.emoji.tw', host: 'www.emoji.tw' })).status, 403);
  const ok = await call('/api/sso/session', { method: 'POST', body: { token: tok }, origin: 'https://sso.emoji.tw' });
  assert.equal(ok.status, 200);
  const set = ok.headers.get('set-cookie');
  assert.match(set, /emoji_sso=/); assert.match(set, /HttpOnly/i); assert.match(set, /Secure/i); assert.match(set, /SameSite=Lax/i);
  assert.doesNotMatch(set, /Domain=/i, 'cookie 只留在 sso.emoji.tw（host-only）');
  const cookie = set.split(';')[0];
  const me = await (await call('/api/sso/me', { cookie })).json();
  assert.deepEqual(me, { authenticated: true, user: { name: '測試', email: 'm@example.test' } });
  const staff = sec.signToken({ sub: 'staff:st_1', role: 'admin', operator_staff_id: 'st_1' }, SECRET);
  assert.equal((await call('/api/sso/session', { method: 'POST', body: { token: staff }, origin: 'https://sso.emoji.tw' })).status, 401);
  assert.equal((await call('/api/sso/session', { method: 'POST', body: { token: 'x.y' }, origin: 'https://sso.emoji.tw' })).status, 401);
});

test('/logout 清 cookie 回原站 #sso=none；sso 網域只提供登入相關路徑', async t => {
  const { call } = await harness(t);
  const r = await call('/logout?redirect=' + encodeURIComponent('https://pos.emoji.tw/pos'), { cookie: ssoCookie('u-1') });
  assert.equal(r.headers.get('location'), 'https://pos.emoji.tw/pos#sso=none');
  assert.match(r.headers.get('set-cookie'), /emoji_sso=;/);
  for (const p of ['/', '/login', '/callback']) {
    const x = await call(p); assert.equal(x.status, 200, p); assert.match(await x.text(), /言文字帳號/);
  }
  assert.equal((await call('/events')).headers.get('location'), '/');
  assert.equal((await call('/admin')).headers.get('location'), '/');
  // 其他網域沒有 /authorize、/logout
  assert.equal((await call('/authorize?redirect=x', { host: 'www.emoji.tw' })).status, 404);
  assert.equal((await call('/logout', { host: 'www.emoji.tw' })).status, 404);
  // Google 登入從 sso 網域發起時，先跳到 callback 所在網域（www）
  assert.match((await call('/auth/google?redirect=x')).headers.get('location'), /^https:\/\/www\.emoji\.tw\/auth\/google/);
});

test('前端：app／admin／pos／order 都載入 sso-client.js 並接上靜默登入、登入包 SSO、全站登出', () => {
  const m = read('public/m.html'), a = read('public/admin.html'), p = read('public/pos.html'), o = read('public/order.html');
  for (const [n, s] of [['m', m], ['admin', a], ['pos', p], ['order', o]]) {
    assert.match(s, /<script src="\/sso-client\.js"><\/script>/, n);
    assert.match(s, /EmojiSSO\.silent\(/, n);
    assert.match(s, /EmojiSSO\.wrap\(/, n);
    assert.match(s, /EmojiSSO\.logout\(/, n);
  }
  assert.match(read('server.js'), /sso-client\\\.js\$/, 'App 網域要放行 sso-client.js');
  const c = read('public/sso-client.js');
  assert.match(c, /standalone/, '主畫面 App 不啟用（與 Safari 不共用 cookie）');
  assert.match(c, /emoji\\\.tw\$/, '只在 *.emoji.tw 啟用');
});

test('sso-client：*.emoji.tw 啟用、本機與主畫面 App 停用；確認連得上才包 callback', async () => {
  const load = (href, { standalone = false, fetchOk = true } = {}) => {
    const u = new URL(href), store = {}, ss = {};
    const g = {
      location: { href, hostname: u.hostname, protocol: u.protocol, hash: u.hash, pathname: u.pathname, search: u.search, replace() {} },
      navigator: { standalone }, matchMedia: () => ({ matches: false }), history: { replaceState() {} },
      localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
      sessionStorage: { getItem: k => ss[k] ?? null, setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
      document: { documentElement: { lang: 'zh-Hant' } }, URLSearchParams, fetch: () => fetchOk ? Promise.resolve({}) : Promise.reject(new Error('TLS')),
    };
    g.window = g; vm.runInNewContext(read('public/sso-client.js'), g); return g.EmojiSSO;
  };
  const on = load('https://pos.emoji.tw/pos');
  assert.equal(on.enabled, true);
  // 探測完成前不包 SSO（憑證未生效時 Safari 會整頁打不開）
  assert.equal(on.wrap('https://pos.emoji.tw/pos#x'), 'https://pos.emoji.tw/pos');
  await on.ready();
  assert.equal(on.wrap('https://pos.emoji.tw/pos#x'), 'https://sso.emoji.tw/callback?r=' + encodeURIComponent('https://pos.emoji.tw/pos'));
  const down = load('https://atcafe.emoji.tw/order', { fetchOk: false });
  assert.equal(await down.ready(), false);
  assert.equal(down.wrap('https://atcafe.emoji.tw/order'), 'https://atcafe.emoji.tw/order');
  assert.equal(down.logout('https://atcafe.emoji.tw/order'), false);
  assert.equal(load('http://localhost:8080/m').enabled, false);
  assert.equal(load('https://app.emoji.tw/', { standalone: true }).enabled, false);
  assert.equal(load('https://sso.emoji.tw/').enabled, false);
  assert.equal(load('http://localhost:8080/m').wrap('http://localhost:8080/m'), 'http://localhost:8080/m');
});

test('sso-client logout：sso.emoji.tw 連不上（DNS／憑證未就緒）時直接回原站，不跳到打不開的 SSO 登出頁（KK 11/4）', async () => {
  const run = async fetchImpl => {
    const href = 'https://pos.emoji.tw/3am', u = new URL(href), ss = {}, went = [];
    const g = {
      location: { href, hostname: u.hostname, protocol: u.protocol, hash: '', pathname: u.pathname, search: '', replace: x => went.push(x) },
      navigator: { standalone: false }, matchMedia: () => ({ matches: false }), history: { replaceState() {} },
      localStorage: { getItem: () => null, setItem() {} },
      sessionStorage: { getItem: k => ss[k] ?? null, setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
      document: { documentElement: { lang: 'zh-Hant' } }, URLSearchParams, fetch: fetchImpl, setTimeout, clearTimeout, AbortController,
    };
    g.window = g; vm.runInNewContext(read('public/sso-client.js'), g);
    assert.equal(g.EmojiSSO.logout('https://pos.emoji.tw/3am'), true);
    await new Promise(r => setTimeout(r, 20));
    return went;
  };
  assert.deepEqual(await run(() => Promise.reject(new TypeError('TLS'))), ['https://pos.emoji.tw/3am']);
  assert.deepEqual(await run(() => Promise.resolve({})), ['https://sso.emoji.tw/logout?redirect=' + encodeURIComponent('https://pos.emoji.tw/3am')]);
});
