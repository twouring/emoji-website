// Cloud Scheduler 排程：CRON_MODE=scheduler 時程序內不啟動排程，改由 POST /internal/cron/* 觸發（CRON_SECRET 常數時間比對）。
// lib/cron-jobs.js 以單元測試驗；端點以隔離的 server.js（假 DB、無外網）實跑 HTTP。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const cronJobs = require('../lib/cron-jobs');
const CRON_SECRET = 'c'.repeat(40);

test('secretMatches：長度不足、缺值、不符都拒絕；相符才通過', () => {
  assert.equal(cronJobs.secretMatches(CRON_SECRET, CRON_SECRET), true);
  assert.equal(cronJobs.secretMatches('c'.repeat(39), CRON_SECRET), false);
  assert.equal(cronJobs.secretMatches(CRON_SECRET + 'x', CRON_SECRET), false);
  assert.equal(cronJobs.secretMatches('', CRON_SECRET), false);
  assert.equal(cronJobs.secretMatches(undefined, CRON_SECRET), false);
  assert.equal(cronJobs.secretMatches('short', 'short'), false, '短於 32 字元的 CRON_SECRET 視同未設定');
  assert.equal(cronJobs.secretMatches('', ''), false);
  assert.match(read('lib/cron-jobs.js'), /crypto\.timingSafeEqual\(a, b\)/);
});

test('dueJobs：依台北時間分派，與原 node-cron 表示式一致', () => {
  const at = s => new Date(s);
  const minute = ['event-webhooks', 'wallet-sync', 'authorization-expiry', 'event-mail', 'line-delivery', 'pickup'];
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T00:01:00+08:00')), minute);
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T00:05:00+08:00')), [...minute, 'linepay-recent', 'ig-publish']);
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T04:10:00+08:00')), ['ig-token-refresh', ...minute, 'linepay-recent', 'ig-publish']);
  // 04:30 每日 7 天對帳排在 5 分鐘那次之前，先拿到同步鎖
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T04:30:00+08:00')), ['linepay-daily', ...minute, 'linepay-recent', 'ig-publish']);
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T09:00:00+08:00')), ['membership-reminders', ...minute, 'linepay-recent', 'ig-publish']);
  assert.deepEqual(cronJobs.dueJobs(at('2026-10-21T18:00:30+08:00')), ['line-reminders', ...minute, 'linepay-recent', 'ig-publish']);
  assert.ok(cronJobs.dueJobs(at('2026-10-21T10:00:00Z')).includes('line-reminders'), 'UTC 10:00＝台北 18:00');
  assert.ok(!cronJobs.dueJobs(at('2026-10-21T18:00:00Z')).includes('line-reminders'), 'UTC 18:00 不是台北 18:00');
});

test('scheduleTime：採用 Cloud Scheduler 排程時間（冷啟動延遲不影響分派），偏離過大或格式錯就用現在', () => {
  const now = new Date('2026-10-21T18:00:40+08:00');
  assert.equal(+cronJobs.scheduleTime('2026-10-21T10:00:00Z', now), +new Date('2026-10-21T10:00:00Z'));
  assert.equal(+cronJobs.scheduleTime('2026-10-20T10:00:00Z', now), +now);
  assert.equal(+cronJobs.scheduleTime('garbage', now), +now);
  assert.equal(+cronJobs.scheduleTime(undefined, now), +now);
});

test('createRunner：正在跑就跳過、錯誤不外拋並走 onError、停用回 disabled、租約搶不到回 locked', async () => {
  const errors = [];
  let release;
  const leases = new Map();
  const lease = { async acquire(k) { if (leases.has(k)) return null; leases.set(k, 't'); return 't'; }, async release(k) { leases.delete(k); } };
  const r = cronJobs.createRunner({ lease, log: () => {} });
  r.define('slow', () => new Promise(res => { release = res; }));
  r.define('boom', () => { throw new Error('爆了'); }, { onError: e => errors.push(e.message) });
  r.define('off', () => 1, { enabled: () => false });
  r.define('a', () => 'A', { lockKey: 'shared' });
  r.define('b', () => 'B', { lockKey: 'shared' });
  const first = r.run('slow');
  assert.deepEqual(await r.run('slow'), { job: 'slow', status: 'skipped', reason: 'running' });
  release(7);
  assert.equal((await first).result, 7);
  const again = r.run('slow'); release(8); assert.equal((await again).status, 'ok', '結束後可再跑');
  const boom = await r.run('boom');
  assert.equal(boom.status, 'error'); assert.equal(boom.error, '爆了'); assert.deepEqual(errors, ['爆了']);
  assert.equal(r.isRunning('boom'), false, '失敗後旗標要清掉');
  assert.equal((await r.run('off')).status, 'disabled');
  assert.equal((await r.run('nope')).status, 'unknown');
  leases.set('shared', 'other');
  assert.deepEqual(await r.run('a', { lease: true }), { job: 'a', status: 'skipped', reason: 'locked' });
  assert.equal((await r.run('a')).status, 'ok', '程序內排程不用租約');
  leases.clear();
  assert.equal((await r.run('b', { lease: true })).result, 'B');
  assert.equal(leases.size, 0, '跑完釋放租約');
});

test('drain：處理到清空、次數上限或時間預算', async () => {
  let left = 5;
  assert.equal(await cronJobs.drain(async () => left-- > 0), 5);
  let n = 0;
  assert.equal(await cronJobs.drain(async () => ++n, { max: 20 }), 20);
  let clock = 0;
  assert.equal(await cronJobs.drain(async () => { clock += 10000; return true; }, { budgetMs: 50000, now: () => clock }), 5);
});

test('createLazyReloader：逾 ttl 才重載、同時只跑一次、失敗不外拋且短時間內不重試', async () => {
  let t = 1_000_000, calls = 0, fail = false;
  const logs = [];
  const r = cronJobs.createLazyReloader({ reload: async () => { calls++; if (fail) throw new Error('db down'); }, ttlMs: 60000, retryMs: 10000, now: () => t, log: (...a) => logs.push(a.join(' ')) });
  assert.equal(r.stale(), true);
  const [a, b] = await Promise.all([r.maybe(), r.maybe()]);
  assert.equal(a, true); assert.equal(b, true); assert.equal(calls, 1);
  t += 59999; assert.equal(await r.maybe(), false); assert.equal(calls, 1);
  t += 1; assert.equal(await r.maybe(), true); assert.equal(calls, 2);
  r.markFresh(t + 30000); t += 60000; assert.equal(await r.maybe(), false, 'markFresh 重設計時');
  t += 30000; fail = true;
  assert.equal(await r.maybe(), false); assert.equal(calls, 3); assert.match(logs[0], /db down/);
  t += 5000; assert.equal(await r.maybe(), false); assert.equal(calls, 3, 'retryMs 內不重試');
  t += 5000; fail = false; assert.equal(await r.maybe(), true); assert.equal(calls, 4);
});

/* 隔離的 server.js：假 DB 記錄 SQL；不 boot（不 migrate、不啟動排程） */
async function server(t, env = {}) {
  const sql = [], db = { leaseTaken: false };
  const run = async (text, params) => {
    sql.push(String(text));
    if (/INSERT INTO cron_leases/.test(text)) return db.leaseTaken ? { rows: [], rowCount: 0 } : { rows: [{ token: params[1] }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    if (name === 'node-cron') throw new Error('node-cron must not be loaded in this test');
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', PUBLIC_ORIGIN: 'https://www.emoji.tw',
      GOOGLE_CLIENT_ID: 'stub', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  const post = async (url, headers = {}) => { const r = await globalThis.fetch(base + url, { method: 'POST', headers }); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { /* 非 JSON */ } return { status: r.status, body }; };
  const get = async url => (await globalThis.fetch(base + url)).status;
  return { post, get, sql, db };
}
const SCHED = { CRON_MODE: 'scheduler', CRON_SECRET };

test('端點：未開 scheduler 模式、未設／過短 CRON_SECRET、密鑰錯誤、後台服務、Railway 一律 404', async t => {
  const h = { 'x-cron-secret': CRON_SECRET };
  for (const env of [{}, { CRON_SECRET }, { CRON_MODE: 'scheduler' }, { CRON_MODE: 'scheduler', CRON_SECRET: 'short' },
    { ...SCHED, SERVICE_ROLE: 'admin' }, { ...SCHED, RAILWAY_ENVIRONMENT: 'production' }]) {
    const s = await server(t, env);
    assert.equal((await s.post('/internal/cron/tick', h)).status, 404, JSON.stringify(env));
  }
  const s = await server(t, SCHED);
  assert.equal((await s.post('/internal/cron/tick')).status, 404, '沒帶密鑰');
  assert.equal((await s.post('/internal/cron/tick', { 'x-cron-secret': 'x'.repeat(40) })).status, 404, '密鑰錯');
  assert.equal((await s.post('/internal/cron/not-a-job', h)).status, 404, '未知 job');
  assert.equal(await s.get('/internal/cron/tick'), 404, '只收 POST');
});

test('端點：密鑰正確時等工作做完才回應，回傳每個 job 的結果；單一 job 與群組都能觸發', async t => {
  const s = await server(t, SCHED);
  const h = { 'x-cron-secret': CRON_SECRET, 'x-cloudscheduler-scheduletime': new Date().toISOString() };
  const pickup = await s.post('/internal/cron/pickup', h);
  assert.equal(pickup.status, 200);
  assert.equal(pickup.body.ok, true);
  assert.deepEqual(pickup.body.results.map(r => [r.job, r.status]), [['pickup', 'ok']]);
  assert.ok(s.sql.some(q => /INSERT INTO cron_leases/.test(q)), 'HTTP 觸發要取得 DB 租約');
  assert.ok(s.sql.some(q => /DELETE FROM cron_leases/.test(q)), '跑完釋放租約');
  assert.ok(s.sql.some(q => /FROM table_sessions WHERE status='open' AND pickup_at/.test(q)), '真的跑了 placeDuePickups');
  const minute = await s.post('/internal/cron/minute', h);
  assert.equal(minute.status, 200);
  assert.deepEqual(minute.body.results.map(r => r.job), cronJobs.GROUPS.minute);
  // 沒設定的整合（Stripe、錢包、寄信）回 disabled，不是錯誤
  const byJob = Object.fromEntries(minute.body.results.map(r => [r.job, r.status]));
  assert.equal(byJob['authorization-expiry'], 'disabled'); assert.equal(byJob['wallet-sync'], 'disabled'); assert.equal(byJob['event-mail'], 'disabled');
  const ig = await s.post('/internal/cron/ig-publish', h);
  assert.equal(ig.body.results[0].status, 'disabled', 'IG_AUTOPUBLISH!=1 時不發文');
  const tick = await s.post('/internal/cron/tick', { 'x-cron-secret': CRON_SECRET, 'x-cloudscheduler-scheduletime': '2000-01-01T00:00:00Z' });
  assert.equal(tick.status, 200, '排程時間偏離過大就用現在時間分派');
  assert.ok(tick.body.results.length >= cronJobs.GROUPS.minute.length);
});

test('端點：租約被別的執行個體持有時跳過，不重複執行', async t => {
  const s = await server(t, SCHED);
  s.db.leaseTaken = true; s.sql.length = 0;
  const r = await s.post('/internal/cron/pickup', { 'x-cron-secret': CRON_SECRET });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results, [{ job: 'pickup', status: 'skipped', reason: 'locked' }]);
  assert.ok(!s.sql.some(q => /FROM table_sessions/.test(q)), '沒搶到租約就不執行');
  assert.ok(!s.sql.some(q => /DELETE FROM cron_leases/.test(q)), '沒搶到也不能刪別人的租約');
});

test('原始碼不變式：scheduler 模式不掛 setInterval；排程與端點都在 ADMIN／RAILWAY 防護之後；webhook 迴圈約 50 秒', () => {
  const src = read('server.js');
  const boot = src.slice(src.indexOf('async function boot()'));
  assert.match(boot, /if \(dbReady && !CRON_SCHEDULER\) \{ const t = setInterval\(\(\) => refreshLiveSettings\(\)/);
  const admin = boot.indexOf('if (ADMIN_MODE) {'), railway = boot.indexOf('if (RAILWAY_MODE) {'), sched = boot.indexOf('if (CRON_SCHEDULER) {');
  assert.ok(admin > -1 && admin < railway && railway < sched && sched < boot.indexOf("require('node-cron')"));
  assert.match(src, /if \(!CRON_SCHEDULER \|\| ADMIN_MODE \|\| RAILWAY_MODE \|\| !cronJobs\.secretMatches\(req\.get\('x-cron-secret'\), CRON_SECRET\)\) return res\.sendStatus\(404\);/);
  assert.match(src, /const CRON_WEBHOOK_BUDGET_MS = Math\.min\(55000, Math\.max\(1000, Number\(process\.env\.CRON_WEBHOOK_BUDGET_MS\) \|\| 50000\)\);/);
  assert.match(src, /cronJobs\.drain\(deliverEventWebhookOnce, http \? \{ budgetMs: CRON_WEBHOOK_BUDGET_MS \} : \{ max: 20 \}\)/);
  // 端點在 express.json 與各 /api 路由之前就掛好、不受 /api 限流影響
  assert.ok(src.indexOf("app.post('/internal/cron/:job'") < src.indexOf("app.use(express.json({ limit: '256kb' }))"));
  // live 設定 lazy 重載中介層：逾 60 秒才重載
  assert.match(src, /cronJobs\.createLazyReloader\(\{ reload: \(\) => refreshLiveSettings\(\), ttlMs: 60000 \}\)/);
});

test('lazy 重載：請求進來時逾 60 秒才查 system_settings', async t => {
  const s = await server(t, SCHED);
  s.sql.length = 0;
  await s.get('/robots.txt'); await s.get('/robots.txt');
  assert.equal(s.sql.filter(q => /SELECT key,value FROM system_settings/.test(q)).length, 1, '第一個請求重載一次，第二個不重載');
  const legacy = await server(t, {});
  legacy.sql.length = 0;
  await legacy.get('/robots.txt');
  assert.equal(legacy.sql.filter(q => /system_settings/.test(q)).length, 0, '未設 CRON_MODE 時沿用計時器，請求不觸發重載');
});
