// scripts/test-pos-staff.mjs — 排班與打卡純邏輯：員工識別碼、店別權限、排班跨日與衝突、上下班打卡與遲到早退、報表彙總；加 POS／後台接線
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-staff');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

test('員工：姓名必填、識別碼 4 位數、店別空＝兩店、子帳號只能設自己店別；部分更新保留舊值', () => {
  assert.deepEqual(S.staffInput({ name: ' 小美 ', pin: '0427', venues: 'CAFE', role: '正職' }), { name: '小美', pin: '0427', venues: ['CAFE'], role: '正職', note: '', active: true });
  assert.equal(S.staffInput({ name: 'A', venues: ['CAFE', 'BAR'] }).venues, null, '兩店都勾＝不限');
  assert.equal(S.staffInput({ name: 'A' }).pin, undefined, '沒填識別碼交給系統抽');
  assert.throws(() => S.staffInput({ name: '' }), /姓名/);
  assert.throws(() => S.staffInput({ name: 'A', pin: '12a4' }), /4 位數字/);
  assert.throws(() => S.staffInput({ name: 'A', venues: 'BAR' }, { own: ['CAFE'] }), e => e.status === 403);
  assert.deepEqual(S.staffInput({ name: 'A' }, { own: ['CAFE'] }).venues, ['CAFE'], '子帳號沒指定就是自己店');
  const existing = { name: '舊', venues: ['BAR'], role: '工讀', note: 'n', active: true };
  assert.deepEqual(S.staffInput({ active: false }, { existing }), { name: '舊', pin: undefined, venues: ['BAR'], role: '工讀', note: 'n', active: false });
  assert.ok(S.staffVisible({ venues: null }, ['CAFE'])); assert.ok(S.staffVisible({ venues: ['BAR'] }, null)); assert.ok(!S.staffVisible({ venues: ['BAR'] }, ['CAFE']));
});

test('抽識別碼：避開已用與太好猜的；用完回 409', () => {
  const seq = [0.0001, 0.1234, 0.5678];
  let i = 0;
  assert.equal(S.randomPin(['5678'], () => seq[i++ % 3]), '0001'); // 0001 可用
  i = 1; assert.equal(S.randomPin(['0001'], () => seq[i++ % 3]), '5678', '1234 太好猜要跳過');
  assert.throws(() => S.randomPin([], () => 0.1234), e => e.status === 409);
});

test('排班：跨日（三點水 17:00–03:00）算 10 小時、凌晨開始的班算前一營業日；同員工重疊擋下；一班不超過 16 小時', () => {
  const s = S.shiftInput({ staff_id: 'st_1', day: '2026-10-13', venue: 'bar', start: '17:00', end: '03:00' });
  assert.equal(s.venue, 'BAR'); assert.equal(s.minutes, 600);
  const b = S.shiftBounds('2026-10-13', '17:00', '03:00');
  assert.equal(b.from.toISOString(), '2026-10-13T09:00:00.000Z'); assert.equal(b.to.toISOString(), '2026-10-13T19:00:00.000Z');
  const night = S.shiftBounds('2026-10-13', '00:30', '03:00');
  assert.equal(night.from.toISOString(), '2026-10-13T16:30:00.000Z', '營業日 10/13 的 00:30 是日曆 10/14 凌晨');
  assert.throws(() => S.shiftInput({ staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start: '08:00', end: '08:00' }), /不能等於/);
  assert.throws(() => S.shiftInput({ staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start: '08:00', end: '01:00' }), /16 小時/);
  assert.throws(() => S.shiftInput({ staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start: '8:00', end: '17:00' }), /HH:MM/);
  assert.throws(() => S.shiftInput({ staff_id: 'st_1', day: '2026-10-13', venue: 'BAR', start: '17:00', end: '23:00' }, { own: ['CAFE'] }), e => e.status === 403);
  const others = [{ id: 'sh_a', staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start_time: '08:00', end_time: '13:00' }, { id: 'sh_b', staff_id: 'st_2', day: '2026-10-13', venue: 'CAFE', start_time: '08:00', end_time: '17:00' }];
  assert.equal(S.shiftConflicts({ staff_id: 'st_1', day: '2026-10-13', start: '12:00', end: '17:00' }, others)?.id, 'sh_a');
  assert.equal(S.shiftConflicts({ staff_id: 'st_1', day: '2026-10-13', start: '13:00', end: '17:00' }, others), null, '緊接著不算重疊');
  assert.equal(S.shiftConflicts({ staff_id: 'st_1', day: '2026-10-13', start: '12:00', end: '17:00' }, others, 'sh_a'), null, '編輯自己那班排除');
  assert.equal(S.shiftConflicts({ staff_id: 'st_1', day: '2026-10-12', start: '17:00', end: '03:00' }, others), null, '前一營業日 17:00–03:00 結束於 10/13 03:00，不與 08:00 重疊');
});

test('週與區間：週一起算 7 天；預設最近 7 天；超過 93 天從結束日往前截', () => {
  assert.equal(S.weekOf('2026-10-13'), '2026-10-12'); assert.equal(S.weekOf('2026-10-12'), '2026-10-12'); assert.equal(S.weekOf('2026-10-18'), '2026-10-12');
  assert.deepEqual(S.weekDays('2026-10-12').slice(-1), ['2026-10-18']);
  const now = new Date('2026-10-13T05:00:00+08:00');
  assert.deepEqual(S.dateRange(undefined, undefined, { now }), { from: '2026-10-07', to: '2026-10-13' });
  assert.deepEqual(S.dateRange('2026-10-13', '2026-10-01', { now }), { from: '2026-10-01', to: '2026-10-13' }, '顛倒自動換');
  assert.deepEqual(S.dateRange('2025-01-01', '2026-10-13', { now }), { from: '2026-07-13', to: '2026-10-13' });
});

test('打卡：識別碼錯 404、停用 403、不在該店 403；上班配對排班算遲到；重複上班 409；下班算工時與早退；沒上班卡不能下班', () => {
  const staff = { id: 'st_1', name: '小美', active: true, venues: ['CAFE'] };
  const shifts = [{ id: 'sh_1', staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start_time: '08:00', end_time: '17:00' }];
  const now = +new Date('2026-10-13T08:12:00+08:00');
  assert.throws(() => S.punch({ type: 'in', staff: null, venue: 'CAFE', now }), e => e.status === 404);
  assert.throws(() => S.punch({ type: 'in', staff: { ...staff, active: false }, venue: 'CAFE', now }), e => e.status === 403);
  assert.throws(() => S.punch({ type: 'in', staff, venue: 'BAR', now }), e => e.status === 403 && /三點水/.test(e.message));
  assert.throws(() => S.punch({ type: 'x', staff, venue: 'CAFE', now }), /上班或下班/);
  const inn = S.punch({ type: 'in', staff, venue: 'CAFE', open: null, shifts, now });
  assert.equal(inn.day, '2026-10-13'); assert.equal(inn.shift_id, 'sh_1'); assert.equal(inn.late_minutes, 12); assert.match(inn.message, /晚 12 分/);
  const early = S.punch({ type: 'in', staff, venue: 'CAFE', open: null, shifts, now: +new Date('2026-10-13T07:50:00+08:00') });
  assert.equal(early.late_minutes, 0); assert.match(early.message, /排班 08:00/);
  const open = { id: 'at_1', staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', clock_in: new Date('2026-10-13T08:12:00+08:00'), shift_id: 'sh_1' };
  assert.throws(() => S.punch({ type: 'in', staff, venue: 'CAFE', open, shifts, now: now + 3600e3 }), e => e.status === 409 && /上班中/.test(e.message));
  const stale = { ...open, clock_in: new Date('2026-10-12T08:00:00+08:00') };
  const again = S.punch({ type: 'in', staff, venue: 'CAFE', open: stale, shifts, now });
  assert.equal(again.forgot_out, true, '昨天忘了打下班卡：今天仍可上班，但標記補登');
  assert.throws(() => S.punch({ type: 'out', staff, venue: 'CAFE', open: null, now }), e => e.status === 409 && /還沒打上班卡/.test(e.message));
  const out = S.punch({ type: 'out', staff, venue: 'CAFE', open, shifts, now: +new Date('2026-10-13T16:30:00+08:00') });
  assert.equal(out.id, 'at_1'); assert.equal(out.minutes, 498); assert.equal(out.early_minutes, 30); assert.equal(out.venue, 'CAFE'); assert.equal(out.day, '2026-10-13'); assert.match(out.message, /8 小時 18 分/);
  const night = S.punch({ type: 'in', staff: { ...staff, venues: null }, venue: 'BAR', open: null, shifts: [], now: +new Date('2026-10-14T01:00:00+08:00') });
  assert.equal(night.day, '2026-10-13', '凌晨 01:00 算前一營業日'); assert.equal(night.shift_id, null);
});

test('管理員修正出勤：下班要晚於上班、不超過 24 小時；pg 回 Date 也能處理', () => {
  const row = { clock_in: new Date('2026-10-13T08:00:00+08:00'), clock_out: null, note: '' };
  const f = S.attendanceFix({ clock_out: '2026-10-13T17:00:00+08:00', note: '補登' }, row);
  assert.equal(f.minutes, 540); assert.equal(f.note, '補登'); assert.equal(f.day, '2026-10-13'); assert.equal(f.clock_in, '2026-10-13T00:00:00.000Z');
  assert.throws(() => S.attendanceFix({ clock_out: '2026-10-13T07:00:00+08:00' }, row), /晚於/);
  assert.throws(() => S.attendanceFix({ clock_out: '2026-10-14T09:00:00+08:00' }, row), /24 小時/);
  assert.throws(() => S.attendanceFix({ clock_in: 'abc' }, row), /格式/);
  assert.equal(S.attendanceFix({ clock_out: null }, { ...row, clock_out: new Date() }).clock_out, null, '可清掉下班卡');
});

test('報表：每人班數／總工時只算已下班、遲到次數、漏卡；CSV 含明細與合計；排班 CSV', () => {
  const rows = [
    { staff_id: 'st_1', name: '小美', day: new Date('2026-10-13T00:00:00Z'), venue: 'CAFE', clock_in: '2026-10-13T00:00:00.000Z', clock_out: '2026-10-13T09:00:00.000Z', minutes: 540, late_minutes: 5, early_minutes: 0, shift_start: '08:00', shift_end: '17:00', note: '' },
    { staff_id: 'st_1', name: '小美', day: '2026-10-14', venue: 'CAFE', clock_in: '2026-10-14T00:00:00.000Z', clock_out: null, minutes: null, late_minutes: 0 },
    { staff_id: 'st_2', name: '阿明', day: '2026-10-13', venue: 'BAR', clock_in: '2026-10-13T09:00:00.000Z', clock_out: '2026-10-13T19:00:00.000Z', minutes: 600, late_minutes: 0 },
  ];
  const sum = S.attendanceSummary(rows);
  assert.deepEqual(sum.map(s => [s.name, s.shifts, s.hours, s.late, s.open, s.days]), [['阿明', 1, 10, 0, 0, 1], ['小美', 2, 9, 1, 1, 2]]);
  const csv = S.attendanceCsv(rows);
  assert.equal(csv[0][0], '營業日'); assert.equal(csv[1][1], '小美'); assert.equal(csv[1][5], 9); assert.equal(csv[1][6], '08:00–17:00'); assert.equal(csv[2][4], '（未打下班卡）');
  assert.deepEqual(csv.at(-1), ['小美', 2, 9, 1, 1]);
  const sc = S.shiftsCsv([{ day: '2026-10-13', name: '小美', venue: 'CAFE', start_time: '08:00', end_time: '17:00', note: '' }]);
  assert.deepEqual(sc[1], ['2026-10-13', '小美', '在咖啡', '08:00', '17:00', 9, '']);
  assert.equal(S.hoursText(0), '0 小時'); assert.equal(S.hoursText(null), '—');
});

test('接線：POS 多「排班」「打卡」分頁、後台餐飲工作區多「排班打卡」、API 子帳號白名單含 staff；pos-ops 打卡用識別碼不落 localStorage', () => {
  const pos = read('public/pos.html'), ops = read('public/pos-ops.js'), admin = read('public/admin.html'), server = read('server.js'), sw = read('public/pos-sw.js');
  assert.match(pos, /\{ id:'shifts',\s+label:'排班' \}/); assert.match(pos, /\{ id:'clock',\s+label:'打卡' \}/);
  assert.match(pos, /else if \(TAB === 'shifts'\) loadShifts\(\);/); assert.match(pos, /else if \(TAB === 'clock'\) loadClock\(\);/);
  assert.match(server, /app\.get\(\['\/pos', '\/pos\/\*'\]/);
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|registers\|staff\|shifts\|attendance\|payment-methods\)/, '子帳號可用排班打卡 API');
  for (const fn of ['tabShifts', 'tabClock', 'loadShifts', 'loadClock']) assert.match(ops, new RegExp(`function ${fn}\\(`), fn);
  assert.match(ops, /api\('\/admin\/attendance\/punch',\{method:'POST',body:\{pin/);
  assert.doesNotMatch(ops, /localStorage\.setItem\([^)]*pin/i, '識別碼不可存在平板');
  // 平板用自製數字鍵盤（不彈系統鍵盤），畫面只顯示 4 個點、不顯示數字；送出後立刻清空
  assert.match(ops, /class="clock-pin"/, '識別碼以點顯示'); assert.match(ops, /const pin=CLOCK_PIN;CLOCK_PIN='';/, '送出即清空識別碼');
  assert.doesNotMatch(ops, /\$\{CLOCK_PIN\}|esc\(CLOCK_PIN\)/, '識別碼不可印到畫面');
  assert.match(admin, /CAFE:\['pos','orders','reservations','history','sales','staff','menu'\]/);
  assert.match(admin, /BAR:\['pos','orders','reservations','history','sales','staff','menu'\]/);
  assert.match(admin, /\{ id:'staff',\s+label:'排班打卡',\s+render:tabStaff \}/); assert.match(admin, /if \(tab === 'staff'\) \{ loadStaff\(\); return; \}/);
  assert.match(sw, /VERSION = 'pos-v[4-9]\d*'/, '新分頁要換 service worker 快取版本（≥ v4）');
  // 直式平板（768–999px）八個分頁一行放不下；.p-nav 的捲軸是隱藏的，所以要換行，不能讓「打卡」「排班」被擠到畫面外
  assert.match(pos, /@media\(max-width:999px\)\{[^}]*--p-top:108px/, '直式平板頂欄要加高');
  assert.match(pos, /@media\(max-width:999px\)\{(?:[^@]*?)\.p-nav\{[^}]*order:3;[^}]*flex:1 1 100%;[^}]*flex-wrap:wrap/, '直式平板分頁列要換到第二行並可折行');
});
