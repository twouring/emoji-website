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

test('關鍵字：低消／服務費三語回覆與官網口徑一致，不搶走營業時間', () => {
  for (const q of ['請問低消多少', '有服務費嗎', 'minimum spend?', 'Is there a service charge', 'サービス料はありますか', '最低料金']) assert.equal(line.matchKeyword(q), 'minspend', q);
  assert.equal(line.matchKeyword('營業時間'), 'hours');
  const zh = line.keywordReply('minspend', { lang: 'zh' })[0].text;
  assert.match(zh, /週日至週四 NT\$300、週五週六 NT\$600/); assert.match(zh, /10% 服務費/); assert.match(zh, /週六日每人低消 NT\$300/);
  assert.match(line.keywordReply('minspend', { lang: 'en' })[0].text, /NT\$600 Fri–Sat/);
  assert.match(line.keywordReply('minspend', { lang: 'ja' })[0].text, /金土 NT\$600/);
  const site = readFileSync(path.join(root, 'tools/build-brand-sites.py'), 'utf8');
  assert.match(site, /每人週日至週四 NT\$300、週五週六 NT\$600/); assert.match(site, /週六日每人低消 NT\$300/);
  for (const l of ['zh', 'en', 'ja']) assert.match(line.T[l].help, /低消|minimum|最低料金/);
});

test('聚落卡：依台北時間標示營業中，24 小時的等等空間／約書旅永遠開著，文案同官網首頁', () => {
  const at = h => new Date(Date.UTC(2026, 10, 8, (h - 8 + 24) % 24, 0));
  const open = (card, l = 'zh') => card.contents.contents.slice(1).filter(b => /●/.test(b.body.contents[0].text)).map(b => b.header.contents[1].text.split(' ')[0]);
  assert.deepEqual(open(line.hubCard({ now: at(10) })), ['在咖啡', '等等空間', '約書旅']);
  assert.deepEqual(open(line.hubCard({ now: at(20) })), ['三點水', '等等空間', '約書旅']);
  assert.deepEqual(open(line.hubCard({ now: at(5) })), ['等等空間', '約書旅']);
  const c = line.hubCard({ now: at(5) });
  assert.equal(c.contents.type, 'carousel'); assert.equal(c.contents.contents.length, 5);
  assert.match(JSON.stringify(c), /今天 08:00 開門/); assert.match(JSON.stringify(c), /今天 17:00 開門/);
  assert.match(JSON.stringify(line.hubCard({ now: at(20) })), /明天 08:00 開門/);
  const home = readFileSync(path.join(root, 'public/index.html'), 'utf8'), en = readFileSync(path.join(root, 'public/en/index.html'), 'utf8');
  for (const b of line.HUB) { assert.ok(home.includes(b.copy.zh), b.k); assert.ok(en.includes(b.copy.en.replace(/'/g, '’')) || en.includes(b.copy.en), b.k + ' en'); }
  assert.ok(Buffer.byteLength(JSON.stringify(c.contents)) < 50000);
  for (const l of ['en', 'ja']) for (const lbl of JSON.stringify(line.hubCard({ lang: l })).match(/"label":"[^"]+"/g)) assert.ok(lbl.length - 10 <= 20, lbl);
  for (const q of ['現在', '現在去哪', 'what\'s open', 'now', '今どこ']) assert.equal(line.matchKeyword(q), 'hub', q);
  assert.equal(line.matchKeyword('現在哪裡開著'), 'hub');
  assert.equal(line.matchKeyword('營業時間'), 'hours');
});

test('問卷：加好友回歡迎＋聚落卡＋來源題；來源 key 與 POS 結帳調查一致；複選興趣、可選不收', async () => {
  const pos = require('../lib/table-orders').SOURCE_OPTIONS.map(([k]) => k);
  for (const [k] of line.SURVEY_SOURCES) assert.ok(pos.includes(k), k);
  const h = harness();
  await h.svc.handleEvent({ type: 'follow', replyToken: 'r', source: { userId: 'U' + 'a'.repeat(32) } });
  const rep = h.calls.find(c => /reply$/.test(c.url));
  assert.equal(rep.body.messages.length, 3);
  assert.equal(rep.body.messages[1].contents.type, 'carousel');
  assert.equal(rep.body.messages[2].quickReply.items.length, line.SURVEY_SOURCES.length);
  assert.ok(h.sql.some(x => /INSERT INTO line_profiles/.test(x.text)));
  const q2 = line.surveyInterestQuestion('zh', []);
  assert.equal(q2.quickReply.items.at(-1).action.data, 'a=int_none');
  const q3 = line.surveyInterestQuestion('zh', ['cafe']);
  assert.ok(!q3.quickReply.items.some(i => i.action.data === 'a=int&id=cafe'));
  assert.equal(q3.quickReply.items.at(-1).action.data, 'a=int_done');
  for (const l of ['zh', 'en', 'ja']) for (const i of [...line.surveySourceQuestion(l).quickReply.items, ...line.surveyInterestQuestion(l).quickReply.items]) assert.ok(i.action.label.length <= 20, i.action.label);
});

test('問卷 postback：存來源、累加興趣、拒收；白名單外的值不寫入', async () => {
  const uidL = 'U' + 'b'.repeat(32), sql = [], replies = [];
  let row = { lang: 'zh', interests: [] };
  const q = async (text, args = []) => { sql.push({ text, args }); if (/SELECT lang,interests FROM line_profiles/.test(text)) return { rows: [row], rowCount: 1 };
    if (/SET interests=\$2/.test(text)) row = { ...row, interests: args[1] }; return { rows: [], rowCount: 1 }; };
  const fetcher = async (url, init) => { replies.push(JSON.parse(init.body)); return { ok: true, text: async () => '{}' }; };
  const svc = createLineService({ q, uid: p => p + 'x', origin: () => 'https://www.emoji.tw', yanBalance: async () => 0, fetcher, log: { error() {} }, env: () => env });
  const pb = data => svc.handleEvent({ type: 'postback', replyToken: 'r', source: { userId: uidL }, postback: { data } });
  await pb('a=src&id=friend');
  assert.ok(sql.some(x => /SET source=\$2/.test(x.text) && x.args[1] === 'friend'));
  assert.match(JSON.stringify(replies.at(-1)), /想在言文字做什麼/);
  await pb('a=int&id=bar'); await pb('a=int&id=work');
  assert.deepEqual(row.interests, ['bar', 'work']);
  const n = sql.length; await pb('a=src&id=hacker'); await pb('a=int&id=drop');
  assert.ok(!sql.slice(n).some(x => /UPDATE line_profiles/.test(x.text)));
  await pb('a=int_none');
  assert.ok(sql.some(x => /SET opted_out=true/.test(x.text)));
  assert.match(JSON.stringify(replies.at(-1)), /不會主動傳邀請/);
});

test('邀請：依時段＋標籤挑一則；額度只用到 80%；無標籤／關閉時不送；活動邀請要有活動', async () => {
  assert.equal(line.pickInvite(11, ['cafe']), 'cafe');
  assert.equal(line.pickInvite(11, ['events', 'cafe']), 'cafe');
  assert.equal(line.pickInvite(11, ['events', 'cafe'], { hasEvent: true }), 'events');
  assert.equal(line.pickInvite(18, ['bar']), 'bar');
  assert.equal(line.pickInvite(14, ['bar']), null);
  assert.equal(line.pickInvite(3, ['bar']), null);
  for (const k of ['cafe', 'work', 'rest', 'bar']) for (const l of ['zh', 'en', 'ja']) {
    const m = line.inviteMessage(k, { lang: l, origin: 'https://www.emoji.tw' });
    assert.match(JSON.stringify(m), /utm_campaign=invite_/); assert.match(JSON.stringify(m), /喜好|preferences|好み/);
    for (const lbl of JSON.stringify(m).match(/"label":"[^"]+"/g)) assert.ok(lbl.length - 10 <= 20, lbl);
  }
  assert.throws(() => line.inviteMessage('events', {}), /沒有活動/);
  const ev = line.inviteMessage('events', { event: { slug: 'a b', title: 'sciwork talk', starts_at: '2026-11-20T11:00:00Z' }, origin: 'https://www.emoji.tw' });
  assert.match(JSON.stringify(ev), /events\/a%20b/); assert.match(JSON.stringify(ev), /19:00/);
  const run = async ({ used = 0, limit = 200, e = env, people }) => {
    const sql = [], calls = [];
    const q = async (text, args = []) => { sql.push({ text, args });
      if (/FROM line_profiles WHERE unfollowed_at IS NULL/.test(text)) return { rows: people, rowCount: people.length };
      if (/FROM events/.test(text)) return { rows: [], rowCount: 0 }; return { rows: [], rowCount: 1 }; };
    const fetcher = async (url, init) => { calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      const body = /quota\/consumption/.test(url) ? { totalUsage: used } : /quota$/.test(url) ? { type: 'limited', value: limit } : {};
      return { ok: true, text: async () => JSON.stringify(body) }; };
    const svc = createLineService({ q, uid: p => p + 'x', origin: () => 'https://www.emoji.tw', yanBalance: async () => 0, fetcher, log: { error() {} }, env: () => e });
    return { out: await svc.sendInvites({ now: new Date('2026-11-09T10:05:00Z') }), sql, calls };
  };
  const people = Array.from({ length: 30 }, (_, i) => ({ line_user_id: 'U' + String(i).padStart(32, '0'), lang: i % 2 ? 'en' : 'zh', interests: i < 25 ? ['bar'] : [] }));
  const a = await run({ people });
  assert.equal(a.out.sent, 25);
  const mc = a.calls.filter(c => /multicast/.test(c.url));
  assert.equal(mc.length, 2); assert.match(JSON.stringify(mc), /三點水 17:00 開門/); assert.match(JSON.stringify(mc), /3AM opens at 17:00/);
  assert.ok(a.sql.some(x => /SET last_invited_at=now\(\)/.test(x.text)));
  assert.ok(a.sql.some(x => /INSERT INTO line_invites/.test(x.text)));
  const b = await run({ people, used: 150 });
  assert.equal(b.out.sent, 10);
  const c = await run({ people, used: 160 });
  assert.equal(c.out.skipped, 'quota');
  const d = await run({ people, e: { ...env, LINE_INVITES_ENABLED: '0' } });
  assert.equal(d.out.skipped, 'disabled'); assert.equal(d.calls.length, 0);
  assert.equal(settings.validate('LINE_INVITES_ENABLED', '0'), '0');
  assert.throws(() => settings.validate('LINE_INVITES_ENABLED', 'yes'), /0 或 1/);
  assert.ok(settings.isLive('LINE_INVITES_ENABLED'));
  assert.match(line.audienceSql('want_bar'), /FROM line_profiles p/);
  assert.match(line.audienceSql('want_bar'), /NOT p.opted_out/);
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
  assert.equal(spec.areas.length, 7);
  assert.deepEqual(spec.areas.slice(0, 4).map(a => a.action.label), ['在咖啡', '三點水', '等等空間', '約書旅']);
  assert.equal(spec.areas.reduce((n, a) => n + a.bounds.width * a.bounds.height, 0), 2500 * 1686);
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
async function boot(t, extraEnv = {}, dbRun) {
  // lib/line.js 在呼叫當下讀真實 process.env（與正式環境一致），所以路由測試要把 LINE 設定放進真實 env，結束後還原
  const keys = Object.keys(process.env).filter(k => k.startsWith('LINE_')), saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(extraEnv)) if (k.startsWith('LINE_')) process.env[k] = v;
  t.after(() => { for (const k of Object.keys(process.env)) if (k.startsWith('LINE_')) delete process.env[k]; Object.assign(process.env, saved); });
  const run = dbRun || (async () => ({ rows: [], rowCount: 0 }));
  const localRequire = name => name === 'pg' ? { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } } : createRequire(path.join(root, 'server.js'))(name);
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root, process: { env: { NODE_ENV: 'test', APP_SECRET: 'test-secret', ADMIN_API_KEY: 'k', DATABASE_URL: 'x', PUBLIC_ORIGIN: 'http://127.0.0.1', ...extraEnv } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, fetch: () => { throw new Error('network forbidden'); }, console: { log() {}, warn() {}, error() {} } });
  new vm.Script(readFileSync(path.join(root, 'server.js'), 'utf8') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(r => { http.close(r); http.closeAllConnections(); }));
  return `http://127.0.0.1:${http.address().port}`;
}

test('會員 LINE 綁定入口要求登入，QR 拒絕偽造票券', async t => {
  const base = await boot(t, {...env,EVENT_QR_SECRET:'qr-secret'});
  assert.equal((await fetch(base+'/api/me/line-link',{method:'POST'})).status,401);
  assert.equal((await fetch(base+'/api/line/qr/forged.png')).status,400);
});

test('會員綁定 state 鎖定已登入會員，callback 不會以另一個 Email 綁錯帳號',async t=>{
  const {signToken,verifyToken}=require('../lib/security');
  const sql=[];
  const run=async(text,args)=>{sql.push({text,args});
    if(text.startsWith('UPDATE users SET line_user_id'))return {rows:[],rowCount:1};
    if(text==='SELECT id,email,is_admin,admin_brand FROM users WHERE id=$1')return {rows:[{id:'existing-member',email:'old@example.com',is_admin:false}],rowCount:1};
    if(text==='SELECT id,name,email FROM users WHERE id=$1')return {rows:[{id:'existing-member',name:'Member',email:'old@example.com'}],rowCount:1};
    if(text.includes('COUNT(*)'))return {rows:[{n:0}],rowCount:1};
    return {rows:[],rowCount:0};
  };
  const base=await boot(t,{...env,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:'x'},run);
  const oldExchange=line.exchangeCode;line.exchangeCode=async()=>({sub:'U'+'a'.repeat(32),email:'different@example.com',name:'LINE'});
  t.after(()=>{line.exchangeCode=oldExchange;});
  const member=signToken({sub:'existing-member',role:'invited'},'test-secret');
  const start=await fetch(base+'/api/me/line-link',{method:'POST',headers:{authorization:'Bearer '+member}});
  assert.equal(start.status,200);
  // App 在 app 網域呼叫：API 不種 cookie，回 www 的 /auth/line/bind，由 www 種 line_state（callback 同網域才讀得到）
  assert.equal(start.headers.get('set-cookie'),null);
  const bounce=new URL((await start.json()).url);assert.equal(bounce.pathname,'/auth/line/bind');
  const hop=await fetch(base+bounce.pathname+bounce.search,{redirect:'manual'});assert.equal(hop.status,302);
  assert.match(hop.headers.get('set-cookie'),/line_state=.*Path=\/auth\/line/);
  const url=new URL(hop.headers.get('location')),state=url.searchParams.get('state'),cookie=hop.headers.get('set-cookie').split(';')[0];
  assert.equal(verifyToken(state,'test-secret',{purpose:'line-oauth'}).b,'existing-member');
  const callback=base+'/auth/line/callback?state='+encodeURIComponent(state)+'&code=test';
  // 沒 cookie（LINE App 回跳到別的瀏覽器）：不直接綁，顯示確認頁讓本人核對帳號
  const noCookie=await fetch(callback,{redirect:'manual'});assert.equal(noCookie.status,200);
  const page=await noCookie.text();assert.match(page,/確認綁定/);assert.match(page,/o\*\*\*@example\.com/);
  assert.ok(!sql.some(x=>x.text.startsWith('UPDATE users SET line_user_id')),'確認前不得綁定');
  const done=await fetch(callback,{redirect:'manual',headers:{cookie}});assert.equal(done.status,302);
  const update=sql.find(x=>x.text.startsWith('UPDATE users SET line_user_id'));
  assert.equal(update.args[0],'existing-member');
  assert.ok(!sql.some(x=>x.text.includes('lower(email)')));
});

test('LINE 登入回跳到另一個瀏覽器（沒有 line_state cookie）仍可登入；綁定、逾時、偽造仍拒絕',async t=>{
  const {signToken}=require('../lib/security');
  const run=async text=>{
    if(text.includes('line_user_id'))return {rows:[{id:'u1',name:'LINE',email:null}],rowCount:1};
    if(text.includes('COUNT(*)'))return {rows:[{n:0}],rowCount:1};
    return {rows:[],rowCount:0};
  };
  const base=await boot(t,{...env,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:'x'},run);
  const oldExchange=line.exchangeCode;line.exchangeCode=async()=>({sub:'U'+'b'.repeat(32),email:'',name:'LINE'});
  t.after(()=>{line.exchangeCode=oldExchange;});
  const start=await fetch(base+'/auth/line?redirect='+encodeURIComponent('http://127.0.0.1/m'),{redirect:'manual'});
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  const cb=s=>fetch(base+'/auth/line/callback?state='+encodeURIComponent(s)+'&code=test',{redirect:'manual'});
  const ok=await cb(state);assert.equal(ok.status,302);assert.match(ok.headers.get('location'),/#token=/);
  const old=signToken({r:'http://127.0.0.1/m',n:'x',v:''},'test-secret',{purpose:'line-oauth',now:Date.now()-11*60*1000});
  assert.equal((await cb(old)).status,400);
  const bind=signToken({b:'someone',r:'http://127.0.0.1/m',n:'x'},'test-secret',{purpose:'line-oauth',now:Date.now()-11*60*1000});
  assert.equal((await cb(bind)).status,400,'逾時的綁定連結仍拒絕');
  assert.equal((await cb(state.slice(0,-2)+'xx')).status,400);
});

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

test('LINE 綁定跨瀏覽器確認：確認頁按下才綁；票券逾時、偽造、bind 起點逾時都拒絕',async t=>{
  const {signToken}=require('../lib/security');
  const sql=[];
  const run=async(text,args)=>{sql.push({text,args});
    if(text.startsWith('UPDATE users SET line_user_id'))return {rows:[],rowCount:1};
    return {rows:[],rowCount:0};
  };
  const base=await boot(t,{...env,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:'x'},run);
  const post=b=>fetch(base+'/auth/line/bind/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
  const lid='U'+'c'.repeat(32);
  assert.equal((await post({t:signToken({b:'m1',l:lid},'test-secret',{purpose:'line-bind-confirm',now:Date.now()-11*60*1000})})).status,400);
  assert.equal((await post({t:signToken({b:'m1',l:lid},'wrong-secret',{purpose:'line-bind-confirm'})})).status,400);
  assert.equal((await post({t:signToken({b:'m1',l:lid},'test-secret',{purpose:'line-oauth'})})).status,400,'不同用途的票券不能拿來綁');
  assert.ok(!sql.some(x=>x.text.startsWith('UPDATE users SET line_user_id')));
  const ok=await post({t:signToken({b:'m1',l:lid},'test-secret',{purpose:'line-bind-confirm'})});assert.equal(ok.status,200);
  const up=sql.find(x=>x.text.startsWith('UPDATE users SET line_user_id'));assert.deepEqual(up.args,['m1',lid]);
  const stale=signToken({b:'m1'},'test-secret',{purpose:'line-bind-start',now:Date.now()-6*60*1000});
  assert.equal((await fetch(base+'/auth/line/bind?t='+encodeURIComponent(stale),{redirect:'manual'})).status,400);
  assert.equal((await fetch(base+'/auth/line/bind?t=forged',{redirect:'manual'})).status,400);
});
