// scripts/test-pos-makeup.mjs — POS 補打卡：純邏輯（只能補自己／過去 7 天／要原因／不重疊）＋ POS 與 server 接線
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-staff');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const NOW = new Date('2026-10-15T08:00:00Z').getTime(); // 台北 10/15 16:00
const staff = { id: 'st_1', name: '小美', venues: ['CAFE'], active: true };
const mk = (body, extra = {}) => S.makeupPunch({ staff, venue: 'CAFE', body: { reason: '忘記打卡', ...body }, open: null, existing: [], shifts: [], now: NOW, ...extra });

test('補整班：台北時間字串、工時＝下班－上班－休息、備註與補登人', () => {
  const r = mk({ clock_in: '2026-10-15T08:00', clock_out: '2026-10-15T15:00', break_minutes: 60 });
  assert.equal(r.mode, 'both'); assert.equal(r.clock_in, '2026-10-15T00:00:00.000Z'); assert.equal(r.clock_out, '2026-10-15T07:00:00.000Z');
  assert.equal(r.minutes, 360); assert.equal(r.break_minutes, 60); assert.equal(r.day, '2026-10-15');
  assert.equal(r.note, '補打卡：忘記打卡'); assert.equal(r.edited_by, '補打卡：小美');
  assert.match(r.message, /補打卡/);
});

test('補打卡配對排班算遲到／早退', () => {
  const shifts = [{ id: 'sh_1', staff_id: 'st_1', day: '2026-10-15', venue: 'CAFE', start_time: '08:00', end_time: '17:00' }];
  const r = mk({ clock_in: '2026-10-15 08:10', clock_out: '2026-10-15 15:30' }, { shifts });
  assert.equal(r.shift_id, 'sh_1'); assert.equal(r.late_minutes, 10); assert.equal(r.early_minutes, 90);
});

test('只補上班：開一筆未下班；已有未下班的要先補下班', () => {
  const r = mk({ clock_in: '2026-10-15T12:00' });
  assert.equal(r.mode, 'in'); assert.equal(r.clock_out, null); assert.equal(r.minutes, null);
  assert.throws(() => mk({ clock_in: '2026-10-15T12:00' }, { open: { id: 'at_1', clock_in: '2026-10-14T00:00:00Z', day: '2026-10-14', breaks: [] } }), e => e.status === 409);
});

test('只補下班：替未下班的那筆補，休息中的休息算到下班', () => {
  const open = { id: 'at_1', day: '2026-10-15', venue: 'CAFE', clock_in: '2026-10-15T00:00:00Z', breaks: [{ start: '2026-10-15T04:00:00Z', end: null }] };
  const r = mk({ clock_out: '2026-10-15 13:00' }, { open });
  assert.equal(r.mode, 'out'); assert.equal(r.id, 'at_1'); assert.equal(r.minutes, 300 - 60); assert.equal(r.break_minutes, 60);
  assert.equal(r.breaks[0].end, '2026-10-15T05:00:00.000Z');
  assert.throws(() => mk({ clock_out: '2026-10-15 13:00' }), e => e.status === 409, '沒有未下班的不能只補下班');
  assert.throws(() => mk({ clock_out: '2026-10-15 07:00' }, { open }), /晚於上班/);
});

test('防濫用：要原因、不能是未來、只能 7 天內、一班 ≤ 16 小時、不得與既有出勤重疊、休息不超過整班', () => {
  assert.throws(() => mk({ clock_in: '2026-10-15 08:00', clock_out: '2026-10-15 12:00', reason: '' }), /原因/);
  assert.throws(() => mk({ clock_in: '2026-10-15 08:00', clock_out: '2026-10-15 12:00', reason: '嗯'.slice(0, 1) }), /原因/);
  assert.throws(() => mk({}), /上班時間或下班時間/);
  assert.throws(() => mk({ clock_in: '2026-10-15 12:00', clock_out: '2026-10-15 18:00' }), /未來/);
  assert.throws(() => mk({ clock_in: '2026-10-01 08:00', clock_out: '2026-10-01 12:00' }), /7 天內/);
  assert.throws(() => mk({ clock_in: '2026-10-14 08:00', clock_out: '2026-10-14 08:00' }), /晚於上班/);
  assert.throws(() => mk({ clock_in: '2026-10-14 01:00', clock_out: '2026-10-14 20:00' }), /16 小時/);
  assert.throws(() => mk({ clock_in: '2026-10-15 08:00', clock_out: '2026-10-15 09:00', break_minutes: 90 }), /休息不能/);
  assert.throws(() => mk({ clock_in: '2026-10-15 08:00', clock_out: '2026-10-15 09:00', break_minutes: -5 }), /0 以上/);
  assert.throws(() => mk({ clock_in: 'abc', clock_out: '2026-10-15 09:00' }), /格式/);
  const existing = [{ id: 'at_9', clock_in: '2026-10-15T01:00:00Z', clock_out: '2026-10-15T05:00:00Z' }];
  assert.throws(() => mk({ clock_in: '2026-10-15 11:00', clock_out: '2026-10-15 14:00' }, { existing }), e => e.status === 409 && /重疊/.test(e.message));
  assert.ok(mk({ clock_in: '2026-10-15 13:00', clock_out: '2026-10-15 15:00' }, { existing }), '緊接在後面不算重疊');
  const live = [{ id: 'at_9', clock_in: '2026-10-15T01:00:00Z', clock_out: null }];
  assert.throws(() => mk({ clock_in: '2026-10-15 10:00', clock_out: '2026-10-15 11:00' }, { existing: live }), e => e.status === 409, '上班中的也算重疊');
});

test('員工檢查：錯碼 404、停用／不屬於該店 403', () => {
  assert.throws(() => S.makeupPunch({ staff: null, venue: 'CAFE', body: {}, now: NOW }), e => e.status === 404);
  assert.throws(() => mk({ clock_in: '2026-10-15 08:00' }, { staff: { ...staff, active: false } }), e => e.status === 403);
  assert.throws(() => S.makeupPunch({ staff, venue: 'BAR', body: { reason: '忘記打卡', clock_in: '2026-10-15 08:00' }, now: NOW }), e => e.status === 403);
});

test('server 接線：端點限流＋識別碼、不需 notOperator（現場人員可補自己）、記補登人；API 文件有寫', () => {
  const server = read('server.js');
  assert.match(server, /app\.post\('\/api\/admin\/attendance\/makeup',rateLimit\(\{max:12\}\),auth,adminOnly,requireDb/);
  const route = server.slice(server.indexOf("'/api/admin/attendance/makeup'"), server.indexOf("'/api/admin/attendance',auth"));
  assert.doesNotMatch(route, /notOperator/);
  assert.match(route, /posStaff\.makeupPunch\(/); assert.match(route, /edited_by/); assert.match(route, /識別碼不正確/);
  assert.match(read('docs/API.md'), /### POST \/api\/admin\/attendance\/makeup/);
});

test('POS 接線：打卡頁有補打卡入口、識別碼不進 localStorage／DOM、表單欄位與原因必填', () => {
  const js = read('public/pos-ops.js');
  assert.match(js, /id="clock-makeup"/); assert.match(js, /function openMakeup\(pin,venue,done\)/);
  assert.match(js, /api\('\/admin\/attendance\/makeup',\{method:'POST',body\}\)/);
  const fn = js.slice(js.indexOf('function openMakeup('), js.indexOf('/* ===== 加點選項'));
  assert.doesNotMatch(fn, /localStorage/); assert.match(fn, /datetime-local/); assert.match(fn, /id="mk-reason"/);
  assert.match(js.slice(js.indexOf("'#clock-makeup'") - 40, js.indexOf('function openMakeup(')), /CLOCK_PIN='';/, '開表單就清掉記憶體裡的識別碼');
  assert.match(read('public/pos-sw.js'), /VERSION = 'pos-v(1[89]|[2-9]\d)'/);
});
