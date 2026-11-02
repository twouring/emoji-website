// 大家來找碴（lib/bug-reports.js、server.js 路由、POS 審核頁）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../lib/bug-reports.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('驗證：類型、位置必填；照片或說明至少一項；照片上限 4', () => {
  assert.throws(() => B.validate({ location: 'x', text: 'abc' }), /類型/);
  assert.throws(() => B.validate({ kind: 'ux', text: 'abc' }), /位置/);
  assert.throws(() => B.validate({ kind: 'ux', location: '2F' }, 0), /拍照或寫/);
  assert.equal(B.validate({ kind: 'ux', location: '2F' }, 1).text, '');
  assert.throws(() => B.validate({ kind: 'ux', location: '2F' }, 5), /最多 4/);
  const v = B.validate({ kind: 'better', location: ' 3F 茶水間\u0000 ', text: '水槽太低', lang: 'xx' }, 0);
  assert.deepEqual(v, { kind: 'better', location: '3F 茶水間', text: '水槽太低', lang: 'zh' });
  assert.equal(B.validate({ kind: 'ux', location: 'a'.repeat(99), text: 'ok' }).location.length, B.MAX_LOCATION);
});

test('審核狀態只接受四種', () => {
  for (const s of ['pending', 'accepted', 'rejected', 'duplicate']) assert.equal(B.reviewStatus(s), s);
  assert.throws(() => B.reviewStatus('approve'), /審核狀態/);
});

test('排行：只算認可，件數多到少，同分先達成者在前', () => {
  const rows = [
    { user_id: 'a', user_name: 'A', status: 'accepted', reviewed_at: '2026-11-01T08:10:00Z' },
    { user_id: 'b', user_name: 'B', status: 'accepted', reviewed_at: '2026-11-01T08:05:00Z' },
    { user_id: 'a', user_name: 'A', status: 'rejected', reviewed_at: '2026-11-01T08:01:00Z' },
    { user_id: 'c', user_name: 'C', status: 'accepted', reviewed_at: '2026-11-01T08:20:00Z' },
    { user_id: 'c', user_name: 'C', status: 'accepted', reviewed_at: '2026-11-01T08:21:00Z' },
  ];
  assert.deepEqual(B.leaderboard(rows), [{ user_id: 'c', name: 'C', points: 2 }, { user_id: 'b', name: 'B', points: 1 }, { user_id: 'a', name: 'A', points: 1 }]);
});

test('server.js：建表、會員送出走 multipart＋檔頭驗證、後台審核', () => {
  const s = read('server.js');
  assert.match(s, /CREATE TABLE IF NOT EXISTS bug_reports \(/);
  assert.match(s, /app\.post\('\/api\/me\/bug-reports',rateLimit\(\{max:20\}\),auth,requireDb/);
  assert.match(s, /bugUpload\.array\('photos',bugReports\.MAX_PHOTOS\)/);
  assert.match(s, /sniffImageType\(x\.buffer\)/);
  assert.match(s, /app\.get\('\/api\/admin\/bug-reports',auth,adminOnly,requireDb/);
  assert.match(s, /app\.post\('\/api\/admin\/bug-reports\/:id\/review',auth,adminOnly,requireDb/);
  assert.match(s, /yan\.applyBugPoint\(before,\{userId:r\.user_id,reportId:r\.id,accepted:status==='accepted'/);
  assert.doesNotMatch(s, /不進會員點數帳本/);
});

test('App：不提供大家來找碴入口或直達參數', () => {
  const m = read('public/m.html');
  for (const marker of ['bug-open', 'openBug', "query.get('bug')", '/api/me/bug-reports']) assert.doesNotMatch(m, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('POS：設定裡有「找碴」，審核鍵四種狀態', () => {
  const pos = read('public/pos.html'), js = read('public/pos-bugs.js');
  assert.match(pos, /<script src="\/pos-bugs\.js"><\/script>/);
  assert.match(pos, /\{ id:'bugs', icon:'search',\s+label:'找碴', group:'settings'/);
  for (const s of ['accepted', 'duplicate', 'rejected', 'pending']) assert.match(js, new RegExp(`data-review="${s}"`));
  assert.match(js, /body: \{ status: b\.dataset\.review, note \}/);
});
