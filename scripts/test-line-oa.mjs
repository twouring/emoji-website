import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const line = require('../lib/line');
const { createLineService } = require('../lib/line-service');
const settings = require('../lib/system-settings');

const env = { LINE_CHANNEL_SECRET: 's3cret', LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_STAFF_GROUP_ID: 'C' + 'a'.repeat(32) };
const sign = (body, secret = 's3cret') => crypto.createHmac('sha256', secret).update(body).digest('base64');

/* 假 DB：依 SQL 關鍵字回資料，記錄所有呼叫 */
function harness({ resv, user, balance = 0, seen = new Set(), e = env } = {}) {
  const sql = [], calls = [];
  const q = async (text, args = []) => {
    sql.push({ text, args });
    if (/INSERT INTO line_events/.test(text)) { if (seen.has(args[0])) return { rows: [], rowCount: 0 }; seen.add(args[0]); return { rows: [], rowCount: 1 }; }
    if (/FROM dining_reservations WHERE id=\$1/.test(text)) return { rows: resv ? [resv] : [], rowCount: resv ? 1 : 0 };
    if (/FROM users WHERE line_user_id/.test(text)) return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    if (/UPDATE dining_reservations SET status='cancelled'/.test(text)) return { rows: [], rowCount: resv && ['new', 'confirmed'].includes(resv.status) ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  };
  const fetcher = async (url, init) => { calls.push({ url, body: init.body ? JSON.parse(init.body) : null }); return { ok: true, text: async () => '{}' }; };
  const svc = createLineService({ q, uid: p => p + 'x', origin: () => 'https://www.emoji.tw', yanBalance: async () => balance, fetcher, log: { error() {} }, env: () => e });
  return { svc, sql, calls };
}
const RESV = { id: 'dr_1', request_id: '1016-01', reserve_date: '2026-10-17', reserve_time: '19:00', period: '三點水', party_size: 2, name: 'KK', lang: 'zh', status: 'confirmed', line_user_id: 'U' + '1'.repeat(32) };

test('簽章驗證：正確通過、錯誤或缺少一律拒絕', () => {
  const body = Buffer.from('{"events":[]}');
  assert.equal(line.verifySignature(body, sign(body), 's3cret'), true);
  assert.equal(line.verifySignature(body, sign(body, 'other'), 's3cret'), false);
  assert.equal(line.verifySignature(body, '', 's3cret'), false);
  assert.equal(line.verifySignature('str', sign(body), 's3cret'), false);
});

test('沒設定金鑰時 config() 為 null，所有通知靜默退化', async () => {
  assert.equal(line.config({}), null);
  const { svc, calls } = harness({ e: {} });
  assert.equal(await svc.notifyStaff('x'), null);
  assert.equal(await svc.sendReminders(), 0);
  await svc.handleEvent({ type: 'follow', replyToken: 'r', source: { userId: 'U1' } });
  assert.equal(calls.length, 0);
});

test('webhook：關鍵字用 Reply（免費）、沒對到的不回、重複事件只處理一次', async () => {
  const seen = new Set(), h = harness({ seen });
  const ev = id => ({ webhookEventId: id, type: 'message', replyToken: 'rt', source: { userId: 'U' + '2'.repeat(32) }, message: { type: 'text', text: '請問營業時間' } });
  await h.svc.handleWebhook({ events: [ev('e1'), ev('e1'), { ...ev('e2'), message: { type: 'text', text: '今天天氣好' } }] });
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/v2\/bot\/message\/reply$/);
  assert.match(h.calls[0].body.messages[0].text, /在咖啡/);
});

test('webhook：點數查詢綁定會員回餘額、未綁定回登入邀請', async () => {
  const user = { id: 'u1', name: 'A' }, ev = { type: 'message', replyToken: 'rt', source: { userId: 'U' + '3'.repeat(32) }, message: { type: 'text', text: '點數' } };
  const bound = harness({ user, balance: 42 });
  await bound.svc.handleEvent(ev);
  assert.match(JSON.stringify(bound.calls[0].body), /"42"/);
  const unbound = harness({});
  await unbound.svc.handleEvent(ev);
  assert.match(JSON.stringify(unbound.calls[0].body), /\/m\?utm_source=line/);
});

test('員工群組：加入或輸入「群組ID」回報 ID，不處理其他群組訊息', async () => {
  const h = harness();
  const src = { type: 'group', groupId: 'C' + 'b'.repeat(32) };
  await h.svc.handleEvent({ type: 'join', replyToken: 'r1', source: src });
  await h.svc.handleEvent({ type: 'message', replyToken: 'r2', source: src, message: { type: 'text', text: '群組ID' } });
  await h.svc.handleEvent({ type: 'message', replyToken: 'r3', source: src, message: { type: 'text', text: '營業時間' } });
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[0].body.messages[0].text, /C[b]{32}/);
});

test('訂位提醒的取消按鈕：只有綁定本人能取消，取消後通知員工群組', async () => {
  const owner = RESV.line_user_id;
  const ok = harness({ resv: RESV });
  await ok.svc.handleEvent({ type: 'postback', replyToken: 'r', source: { userId: owner }, postback: { data: 'a=resv_cancel&id=dr_1' } });
  assert.ok(ok.sql.some(s => /status='cancelled'/.test(s.text)));
  const push = ok.calls.find(c => /\/push$/.test(c.url));
  assert.equal(push.body.to, env.LINE_STAFF_GROUP_ID);
  assert.match(push.body.messages[0].text, /1016-01/);
  const stranger = harness({ resv: RESV });
  await stranger.svc.handleEvent({ type: 'postback', replyToken: 'r', source: { userId: 'U' + '9'.repeat(32) }, postback: { data: 'a=resv_cancel&id=dr_1' } });
  assert.ok(!stranger.sql.some(s => /status='cancelled'/.test(s.text)));
  const done = harness({ resv: { ...RESV, status: 'cancelled' } });
  await done.svc.handleEvent({ type: 'postback', replyToken: 'r', source: { userId: owner }, postback: { data: 'a=resv_cancel&id=dr_1' } });
  assert.match(done.calls[0].body.messages[0].text, /已經結束或已取消/);
});

test('綁定訂位後推確認卡；LINE 出錯不丟例外', async () => {
  const h = harness({ resv: RESV });
  await h.svc.linkReservation('dr_1', RESV.line_user_id);
  assert.equal(h.calls[0].body.to, RESV.line_user_id);
  assert.equal(h.calls[0].body.messages[0].type, 'flex');
  const bad = createLineService({ q: async () => ({ rows: [RESV], rowCount: 1 }), uid: p => p, origin: () => 'https://x', yanBalance: async () => 0, fetcher: async () => ({ ok: false, status: 500, text: async () => '{"message":"boom"}' }), log: { error() {} }, env: () => env });
  assert.equal(await bad.notifyStaff('hi'), null);
});

test('推播：分眾 SQL 白名單、文字與連結驗證、multicast 以 500 人分批', async () => {
  assert.throws(() => line.audienceSql("x'; DROP TABLE users;--"), /未知的分眾/);
  assert.throws(() => line.normalizeBroadcast({ segment: 'linked', text: '' }), /1–1000/);
  assert.throws(() => line.normalizeBroadcast({ segment: 'linked', text: 'a', url: 'http://x' }), /https/);
  const calls = [];
  const sent = await line.multicast({ accessToken: 't' }, Array.from({ length: 1100 }, (_, i) => 'U' + i), 'hi', { fetcher: async (u, i) => { calls.push(JSON.parse(i.body).to.length); return { ok: true, text: async () => '{}' }; } });
  assert.deepEqual(calls, [500, 500, 100]); assert.equal(sent, 1100);
});

test('提醒只掃「明天、已綁定、尚未提醒」，成功後標記已送', async () => {
  const sql = [], calls = [];
  const q = async (t, a) => { sql.push(t); return /FROM dining_reservations/.test(t) ? { rows: [RESV] } : { rows: [], rowCount: 1 }; };
  const svc = createLineService({ q, uid: p => p, origin: () => 'https://www.emoji.tw', yanBalance: async () => 0, fetcher: async (u, i) => { calls.push(JSON.parse(i.body)); return { ok: true, text: async () => '{}' }; }, log: { error() {} }, env: () => env });
  assert.equal(await svc.sendReminders(), 1);
  assert.match(sql[0], /reminder_sent_at IS NULL/); assert.match(sql[0], /\+1/);
  assert.ok(sql.some(t => /SET reminder_sent_at=now\(\)/.test(t)));
  assert.match(JSON.stringify(calls[0].messages[0]), /resv_cancel/);
});

test('Flex 與圖文選單：三語都有、postback 與按鈕標籤在 LINE 限制內', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const card = line.reservationCard({ id: 'dr_1', date: '2026-10-17', time: '19:00', period: '三點水', partySize: 2, request_id: '1016-01' }, { lang, origin: 'https://www.emoji.tw', kind: 'reminder' });
    const labels = JSON.stringify(card).match(/"label":"([^"]+)"/g).map(x => x.slice(9, -1));
    for (const l of labels) assert.ok(l.length <= 20, l);
    assert.ok(Buffer.byteLength(JSON.stringify(card.contents)) < 30000);
  }
  const spec = line.richMenuSpec('https://www.emoji.tw', {});
  assert.equal(spec.areas.length, 6);
  for (const a of spec.areas) assert.ok(a.bounds.x + a.bounds.width <= 2500 && a.bounds.y + a.bounds.height <= 1686);
  const png = line.qrPng('https://www.emoji.tw/e/abc');
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('系統設定：LINE 金鑰為即時載入、機敏值加密、格式在存檔時就擋', () => {
  for (const k of ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_STAFF_GROUP_ID']) assert.ok(settings.byKey.has(k) && settings.isLive(k), k);
  assert.equal(settings.byKey.get('LINE_CHANNEL_SECRET').secret, true);
  assert.throws(() => settings.validate('LINE_STAFF_GROUP_ID', 'not-a-group'), /33 碼/);
  assert.throws(() => settings.validate('LINE_REVIEW_URL', 'http://x'), /https/);
  assert.equal(settings.validate('LINE_STAFF_GROUP_ID', 'C' + 'a'.repeat(32)), 'C' + 'a'.repeat(32));
});

/* ---- 路由層：真的 server.js 跑在 vm 沙盒，DB／外網都是替身 ---- */
async function boot(t, extraEnv = {}) {
  // lib/line.js 在呼叫當下讀真實 process.env（與正式環境一致），所以路由測試要把 LINE 設定放進真實 env，結束後還原
  const keys = Object.keys(process.env).filter(k => k.startsWith('LINE_')), saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(extraEnv)) if (k.startsWith('LINE_')) process.env[k] = v;
  t.after(() => { for (const k of Object.keys(process.env)) if (k.startsWith('LINE_')) delete process.env[k]; Object.assign(process.env, saved); });
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => name === 'pg' ? { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } } : createRequire(path.join(root, 'server.js'))(name);
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root, process: { env: { NODE_ENV: 'test', APP_SECRET: 'test-secret', ADMIN_API_KEY: 'k', DATABASE_URL: 'x', PUBLIC_ORIGIN: 'http://127.0.0.1', ...extraEnv } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, fetch: () => { throw new Error('network forbidden'); }, console: { log() {}, warn() {}, error() {} } });
  new vm.Script(readFileSync(path.join(root, 'server.js'), 'utf8') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(r => { http.close(r); http.closeAllConnections(); }));
  return `http://127.0.0.1:${http.address().port}`;
}

test('POST /api/line/webhook：未設定 503、簽章錯 401、簽章對 200', async t => {
  const none = await boot(t);
  assert.equal((await fetch(none + '/api/line/webhook', { method: 'POST', body: '{}' })).status, 503);
  const base = await boot(t, env);
  const body = JSON.stringify({ events: [] });
  assert.equal((await fetch(base + '/api/line/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-line-signature': 'bad' } })).status, 401);
  assert.equal((await fetch(base + '/api/line/webhook', { method: 'POST', body })).status, 401);
  assert.equal((await fetch(base + '/api/line/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) } })).status, 200);
});

test('LINE 後台 API 僅超管；/auth/line 未設定 LINE Login 回 503', async t => {
  const base = await boot(t, env);
  for (const p of ['/api/admin/line/status']) assert.equal((await fetch(base + p)).status, 401);
  assert.equal((await fetch(base + '/auth/line', { redirect: 'manual' })).status, 503);
  const withLogin = await boot(t, { ...env, LINE_LOGIN_CHANNEL_ID: '1234567890', LINE_LOGIN_CHANNEL_SECRET: 'x' });
  const r = await fetch(withLogin + '/auth/line', { redirect: 'manual' });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin, 'https://access.line.me'); assert.equal(loc.searchParams.get('bot_prompt'), 'aggressive'); assert.ok(loc.searchParams.get('state'));
  assert.match(r.headers.get('set-cookie'), /line_state=.*HttpOnly/);
});

test('原始碼不變式：webhook 在 express.json 之前、排程在 ADMIN_MODE return 之後', () => {
  const s = readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(s.indexOf("app.post('/api/line/webhook', express.raw") < s.indexOf("app.use(express.json({ limit: '256kb' }))"));
  assert.ok(s.indexOf("schedule('0 18 * * *'") > s.indexOf("if (ADMIN_MODE) { console.log('[boot] SERVICE_ROLE=admin"));
});
