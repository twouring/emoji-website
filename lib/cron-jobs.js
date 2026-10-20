'use strict';
/* 排程工作的共用骨架：程序內 node-cron（預設）與 Cloud Scheduler HTTP 觸發（CRON_MODE=scheduler）走同一套。
   - createRunner：每個 job 一個「正在跑就跳過」旗標，錯誤不往外丟（回報在結果裡），兩種觸發方式共用旗標。
   - secretMatches：CRON_SECRET 常數時間比對（先 sha256 再 timingSafeEqual，長度不同也不會提早返回）。
   - createLazyReloader：取代 60 秒 setInterval，請求進來時若距上次載入超過 ttl 才重載；同時間只跑一次。
   - dueJobs：/internal/cron/tick 依（台北）排程時間決定該跑哪些 job。 */

const crypto = require('node:crypto');

const CRON_SECRET_MIN = 32;

/* 排程表：與原本 server.js boot() 內的 node-cron 表示式一致（台北時區）。 */
const SCHEDULE = [
  // 每日工作排在前面：同一個 tick 同時到期時先啟動（例如 04:30 LINE Pay 7 天對帳先拿到同步鎖，5 分鐘那次就跳過，與原本行為一致）
  { job: 'ig-token-refresh', cron: '10 4 * * *' },
  { job: 'linepay-daily', cron: '30 4 * * *' },
  { job: 'membership-reminders', cron: '0 9 * * *' },
  { job: 'line-reminders', cron: '0 18 * * *' },
  { job: 'event-webhooks', cron: '* * * * *' },          // 原 setInterval 10 秒；HTTP 觸發時迴圈處理到清空或約 50 秒
  { job: 'wallet-sync', cron: '* * * * *' },
  { job: 'authorization-expiry', cron: '* * * * *' },
  { job: 'event-mail', cron: '* * * * *' },
  { job: 'line-delivery', cron: '* * * * *' },
  { job: 'pickup', cron: '* * * * *' },
  { job: 'linepay-recent', cron: '*/5 * * * *' },
  { job: 'ig-publish', cron: '*/5 * * * *' },
];
const GROUPS = {
  minute: SCHEDULE.filter(s => s.cron === '* * * * *').map(s => s.job),
  'five-minute': SCHEDULE.filter(s => s.cron === '*/5 * * * *').map(s => s.job),
};

function secretMatches(provided, expected) {
  if (typeof expected !== 'string' || expected.length < CRON_SECRET_MIN) return false;
  if (typeof provided !== 'string' || !provided) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/* 台北時間（UTC+8，無日光節約）的分、時 */
function taipeiParts(date) {
  const t = new Date(date.getTime() + 8 * 3600e3);
  return { minute: t.getUTCMinutes(), hour: t.getUTCHours() };
}
/* 只支援本檔 SCHEDULE 用到的寫法：*、*\/n、單一數字 */
function fieldMatches(field, value) {
  if (field === '*') return true;
  const step = /^\*\/(\d+)$/.exec(field);
  if (step) return value % Number(step[1]) === 0;
  return /^\d+$/.test(field) && Number(field) === value;
}
function dueJobs(date) {
  const { minute, hour } = taipeiParts(date);
  return SCHEDULE.filter(s => { const [m, h] = s.cron.split(' '); return fieldMatches(m, minute) && fieldMatches(h, hour); }).map(s => s.job);
}
/* Cloud Scheduler 會帶 X-CloudScheduler-ScheduleTime（重試時仍是原排程時間）；冷啟動延遲不會讓 18:00 變 18:01。
   缺少或偏離現在超過 maxSkewMs 就用現在時間。 */
function scheduleTime(header, now = new Date(), maxSkewMs = 15 * 60e3) {
  const t = header ? new Date(String(header)) : null;
  if (t && Number.isFinite(+t) && Math.abs(+t - +now) <= maxSkewMs) return t;
  return now;
}

/* 反覆呼叫 once() 直到回 false（佇列清空）、達 max 次或超過 budgetMs。回傳處理次數 */
async function drain(once, { max = Infinity, budgetMs = Infinity, now = Date.now } = {}) {
  const deadline = now() + budgetMs;
  let n = 0;
  while (n < max && now() < deadline && await once()) n++;
  return n;
}

/* lease（選用）：跨執行個體的租約，{ acquire(name) → token|null, release(name, token) }。
   只在 HTTP 觸發（run(name, { lease: true })）時使用：Cloud Run 多個執行個體的記憶體旗標互相看不到。 */
function createRunner({ log = console.error, lease = null } = {}) {
  const jobs = new Map(), running = new Set();
  /* onError：沿用各排程原本的錯誤 log 格式；lockKey：共用租約的 job 填同一個（LINE Pay 兩個對帳排程共用 'linepay'，
     跨執行個體不會同時開兩個 puppeteer）；leaseSec：租約秒數，執行個體中途死掉時最久卡這麼久 */
  function define(name, fn, { enabled = () => true, onError = null, lockKey = name, leaseSec = 300 } = {}) { jobs.set(name, { fn, enabled, onError, lockKey, leaseSec }); }
  function has(name) { return jobs.has(name); }
  function isRunning(name) { return running.has(name); }
  async function run(name, options = {}) {
    const job = jobs.get(name);
    if (!job) return { job: name, status: 'unknown' };
    if (!job.enabled()) return { job: name, status: 'disabled' };
    if (running.has(name)) return { job: name, status: 'skipped', reason: 'running' };
    running.add(name);
    const started = Date.now();
    let token = null;
    try {
      if (options.lease && lease) {
        token = await lease.acquire(job.lockKey, job.leaseSec);
        if (!token) return { job: name, status: 'skipped', reason: 'locked' };
      }
      const result = await job.fn(options);
      return { job: name, status: 'ok', ms: Date.now() - started, ...(result === undefined ? {} : { result }) };
    } catch (e) {
      try { if (job.onError) job.onError(e); else log(`[cron] ${name} 失敗：`, e && e.message || String(e)); } catch { /* log 本身失敗不影響 */ }
      return { job: name, status: 'error', ms: Date.now() - started, error: String(e && e.message || e).slice(0, 300) };
    } finally {
      running.delete(name);
      if (token) { try { await lease.release(job.lockKey, token); } catch (e) { try { log(`[cron] ${name} 釋放租約失敗：`, e && e.message || String(e)); } catch { /* 略 */ } } }
    }
  }
  return { define, has, run, isRunning, names: () => [...jobs.keys()] };
}

function createLazyReloader({ reload, ttlMs = 60000, retryMs = 10000, now = Date.now, log = console.error } = {}) {
  let loadedAt = 0, failedAt = 0, inflight = null;
  function markFresh(at = now()) { loadedAt = at; failedAt = 0; }
  function stale(at = now()) { return at - loadedAt >= ttlMs && at - failedAt >= retryMs; }
  /* 永不 reject：失敗只記 log，retryMs 內不再重試，避免每個請求都打 DB */
  function maybe() {
    if (inflight) return inflight;
    if (!stale()) return Promise.resolve(false);
    inflight = Promise.resolve().then(reload)
      .then(() => { markFresh(); return true; })
      .catch(e => { failedAt = now(); try { log('[system-settings] 重載失敗：', e && e.message || String(e)); } catch { /* 略 */ } return false; })
      .finally(() => { inflight = null; });
    return inflight;
  }
  return { maybe, markFresh, stale, get loadedAt() { return loadedAt; } };
}

module.exports = { CRON_SECRET_MIN, SCHEDULE, GROUPS, secretMatches, dueJobs, scheduleTime, taipeiParts, drain, createRunner, createLazyReloader };
