// 資料中樞與 Hermes 排程（KK 2026-11-19）：admin 是五品牌社群／廣告／BD／KOC 唯一資料來源；所有排程由 Hermes 觸發
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const hub = require('../lib/hub');
const settings = require('../lib/system-settings');

test('五品牌與帳號對應', () => {
  assert.deepEqual(Object.keys(hub.BRANDS), ['TTH', 'CAFE', 'BAR', 'STAY', 'REST']);
  assert.equal(hub.ACCOUNTS['emoji.restbook'], 'REST');
  assert.equal(hub.ACCOUNTS['emoji.staysquare'], 'STAY');
  assert.equal(hub.ACCOUNTS.emoji0701, 'TTH');
});

test('sniffMedia：只認 JPEG／PNG／WebP／MP4 檔頭', () => {
  const b = (...x) => Buffer.from([...x, ...Array(12).fill(0)]);
  assert.equal(hub.sniffMedia(b(0xFF, 0xD8, 0xFF)), 'image/jpeg');
  assert.equal(hub.sniffMedia(b(0x89, 0x50, 0x4E, 0x47)), 'image/png');
  assert.equal(hub.sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(4)])), 'video/mp4');
  assert.equal(hub.sniffMedia(Buffer.from('<html><script>alert(1)')), null);
});

test('claimTick：同一分鐘只分派一次', async () => {
  const seen = new Set();
  const q = async (sql, v) => {
    if (/INSERT INTO cron_ticks/.test(sql)) { const k = +v[0]; if (seen.has(k)) return { rows: [] }; seen.add(k); return { rows: [{ minute: v[0] }] }; }
    return { rows: [] };
  };
  assert.equal(await hub.claimTick(q, new Date('2026-11-19T10:00:05Z')), true);
  assert.equal(await hub.claimTick(q, new Date('2026-11-19T10:00:50Z')), false, '同分鐘重送');
  assert.equal(await hub.claimTick(q, new Date('2026-11-19T10:01:00Z')), true);
});

test('recordWebsiteRuns：跳過 skipped，錯誤累計 failures', async () => {
  const calls = [];
  await hub.recordWebsiteRuns(async (sql, v) => { calls.push(v); return { rows: [] }; },
    [{ job: 'pickup', status: 'ok' }, { job: 'event-mail', status: 'skipped' }, { job: 'line-delivery', status: 'error', error: 'x' }],
    [{ job: 'pickup', cron: '* * * * *' }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'website:pickup');
  assert.equal(calls[0][2], '* * * * *');
  assert.equal(calls[1][6], 1);
});

test('系統設定：CRON_DRIVER／CRON_SECRET 為 live 鍵且有格式檢查', () => {
  assert.ok(settings.isLive('CRON_DRIVER'));
  assert.ok(settings.isLive('CRON_SECRET'));
  assert.equal(settings.validate('CRON_DRIVER', 'hermes'), 'hermes');
  assert.throws(() => settings.validate('CRON_DRIVER', 'cloud'));
  assert.throws(() => settings.validate('CRON_SECRET', 'short'));
  assert.ok(settings.byKey.get('CRON_SECRET').secret, '密鑰在後台遮罩');
});

test('server：Hermes 觸發開關、同分鐘去重、程序內排程經過 hermesDriven 閘門', () => {
  const src = read('server.js');
  assert.match(src, /const hermesDriven = \(\) => process\.env\.CRON_DRIVER === 'hermes';/);
  assert.match(src, /if \(!\(CRON_SCHEDULER \|\| hermesDriven\(\)\) \|\| ADMIN_MODE \|\| RAILWAY_MODE \|\| !cronJobs\.secretMatches\(req\.get\('x-cron-secret'\), cronSecret\(\)\)\) return res\.sendStatus\(404\);/);
  assert.match(src, /if \(name === 'tick' && !\(await hub\.claimTick\(q, at\)\)\)/);
  const boot = src.slice(src.indexOf('async function boot()'));
  assert.match(boot.slice(0, 600), /const cronRunner = \{ run: n => hermesDriven\(\) \? Promise\.resolve\(\{ job: n, status: 'skipped', reason: 'hermes' \}\)/);
  assert.match(src, /await hub\.init\(q\);/);
  assert.match(src, /hub\.register\(app, \{ auth, adminOnly, requireDb, wrap, q, uid, igPublisher, multer \}\);/);
});

test('ig-publish 只發言文字主帳；門市帳號交給 Hermes 發佈器', () => {
  assert.match(read('server.js'), /gif: 'image\/gif', mp4: 'video\/mp4' \};/, '/ig-media 以 video/mp4 回 Reels 影片');
  assert.match(read('lib/ig-publisher.js'), /coalesce\(account,''\) IN \('','emoji0701'\)/);
  assert.match(read('server.js'), /const SOCIAL_PLATFORMS = \['ig', 'x', 'threads'\];/);
});

test('hub API 全部掛 auth + adminOnly + requireDb，並寫進 API 文件', () => {
  const src = read('lib/hub.js'), docs = read('docs/API.md');
  for (const [m, p] of [['post', 'media'], ['patch', 'posts/:id'], ['get', 'interactions'], ['post', 'interactions'], ['get', 'metrics'], ['post', 'metrics'],
    ['post', 'ads'], ['get', 'leads'], ['post', 'leads'], ['get', 'automation'], ['post', 'automation'], ['get', 'overview']]) {
    assert.match(src, new RegExp(`app\\.${m}\\('/api/admin/hub/${p.replace('/', '\\/')}', \\.\\.\\.base`), `${m} ${p}`);
    assert.match(docs, new RegExp(`^### ${m.toUpperCase()} /api/admin/hub/${p.replace('/', '\\/')}$`, 'm'), `文件 ${m} ${p}`);
  }
  assert.match(src, /const base = \[auth, adminOnly, requireDb\];/);
});

test('admin：自動化分頁與社群品牌篩選', () => {
  const admin = read('public/admin.html');
  assert.match(admin, /\{ id:'automation',  label:'自動化',   render:tabAutomation \}/);
  assert.match(admin, /api\('\/admin\/hub\/automation'\)/);
  assert.match(admin, /id="sp-f-brand"/);
  assert.match(admin, /esc\(j\.last_error\|\|''\)/, '錯誤訊息要跳脫');
});
