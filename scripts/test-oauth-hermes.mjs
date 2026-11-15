// 言文字會員 OAuth（/api/oauth/authorize、/api/oauth/token）：遊遊愛馬仕綁定言文字帳號
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import crypto from 'node:crypto';
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
  const call = (url, { host = 'sso.emoji.tw', method = 'GET', body, form, cookie, origin } = {}) => fetch('http://127.0.0.1:' + http.address().port + url, {
    method, redirect: 'manual',
    headers: { 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https', ...(body ? { 'content-type': 'application/json' } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  return { call, users };
}
const ssoCookie = sub => 'emoji_sso=' + encodeURIComponent(sec.signToken({ sub, role: 'invited' }, SECRET, { purpose: 'sso' }));

const CB = 'https://hermes.twouring.com/portal-api/oauth/callback';
const verifier = 'v'.repeat(50), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const authz = (extra = {}) => '/api/oauth/authorize?' + new URLSearchParams({ client_id: 'twouring-hermes', redirect_uri: CB, response_type: 'code', state: 'st1', code_challenge: challenge, code_challenge_method: 'S256', ...extra });
const token = (call, form) => call('/api/oauth/token', { method: 'POST', form });

test('言文字會員 OAuth：授權碼＋PKCE 換 session token，refresh 換新，碼只能用一次', async t => {
  const { call } = await harness(t);
  const r = await call(authz(), { cookie: ssoCookie('u-1') });
  assert.equal(r.status, 302);
  const back = new URL(r.headers.get('location'));
  assert.equal(back.origin + back.pathname, CB);
  assert.equal(back.searchParams.get('state'), 'st1');
  const code = back.searchParams.get('code');
  const form = { grant_type: 'authorization_code', client_id: 'twouring-hermes', redirect_uri: CB, code, code_verifier: verifier };
  assert.equal((await token(call, { ...form, code_verifier: 'w'.repeat(50) })).status, 400, '錯的 verifier');
  const ok = await token(call, form);
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.user.email, 'm@example.test');
  assert.equal(j.expires_in, 7 * 86400);
  const p = sec.verifyToken(j.access_token, SECRET);
  assert.equal(p.sub, 'u-1');
  assert.equal((await token(call, form)).status, 400, '授權碼不能重用');
  const re = await token(call, { grant_type: 'refresh_token', client_id: 'twouring-hermes', refresh_token: j.refresh_token });
  assert.equal(re.status, 200);
  assert.equal(sec.verifyToken((await re.json()).access_token, SECRET).sub, 'u-1');
});

test('言文字會員 OAuth：未登入轉 /login、未登記 client／網址拒絕、只在 sso 網域', async t => {
  const { call } = await harness(t);
  const a = await call(authz());
  assert.equal(a.status, 302);
  assert.match(a.headers.get('location'), /^\/login\?redirect=https%3A%2F%2Fsso\.emoji\.tw%2Fapi%2Foauth%2Fauthorize/);
  assert.equal((await call(authz({ redirect_uri: 'https://evil.example/cb' }), { cookie: ssoCookie('u-1') })).status, 400);
  assert.equal((await call(authz({ client_id: 'other' }), { cookie: ssoCookie('u-1') })).status, 400);
  const nopkce = await call(authz({ code_challenge_method: 'plain' }), { cookie: ssoCookie('u-1') });
  assert.match(nopkce.headers.get('location'), /error=invalid_request/);
  assert.equal((await call(authz(), { host: 'www.emoji.tw', cookie: ssoCookie('u-1') })).status, 404);
  assert.equal((await token(call, { grant_type: 'refresh_token', client_id: 'other', refresh_token: 'x' })).status, 401);
  const staff = sec.signToken({ sub: 'u-1', role: 'admin', operator_staff_id: 's1' }, SECRET);
  assert.equal((await token(call, { grant_type: 'refresh_token', client_id: 'twouring-hermes', refresh_token: staff })).status, 400, 'POS 操作人員 token 不能換');
});
