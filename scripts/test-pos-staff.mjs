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

test('打卡：識別碼錯 404、停用 403；出勤統一屬於言文字；上班配對排班算遲到；重複上班 409；下班算工時與早退；沒上班卡不能下班', () => {
  const staff = { id: 'st_1', name: '小美', active: true, venues: ['CAFE'] };
  const shifts = [{ id: 'sh_1', staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', start_time: '08:00', end_time: '17:00' }];
  const now = +new Date('2026-10-13T08:12:00+08:00');
  assert.throws(() => S.punch({ type: 'in', staff: null, venue: 'CAFE', now }), e => e.status === 404);
  assert.throws(() => S.punch({ type: 'in', staff: { ...staff, active: false }, venue: 'CAFE', now }), e => e.status === 403);
  assert.equal(S.punch({ type: 'in', staff, venue: 'BAR', open: null, shifts, now }).venue, 'TTH', '打卡不受員工品牌限制，統一記言文字');
  assert.throws(() => S.punch({ type: 'x', staff, venue: 'CAFE', now }), /上班、下班或休息/);
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
  assert.equal(out.id, 'at_1'); assert.equal(out.minutes, 498); assert.equal(out.early_minutes, 30); assert.equal(out.venue, 'TTH'); assert.equal(out.day, '2026-10-13'); assert.match(out.message, /8 小時 18 分/);
  const night = S.punch({ type: 'in', staff: { ...staff, venues: null }, venue: 'BAR', open: null, shifts: [], now: +new Date('2026-10-14T01:00:00+08:00') });
  assert.equal(night.day, '2026-10-13', '凌晨 01:00 算前一營業日'); assert.equal(night.shift_id, null);
});

test('休息（勞基法第 35 條）：開始／結束休息要在班上；重複開始 409；工時扣休息；連續 4 小時沒休息標記；未滿 30 分提醒；休息中直接下班休息算到下班', () => {
  const staff = { id: 'st_1', name: '小美', active: true, venues: null };
  const t = h => +new Date(`2026-10-13T${h}:00+08:00`);
  assert.throws(() => S.punch({ type: 'break_start', staff, venue: 'CAFE', open: null, now: t('12:00') }), e => e.status === 409 && /不能休息/.test(e.message));
  const open = { id: 'at_1', staff_id: 'st_1', day: '2026-10-13', venue: 'CAFE', clock_in: new Date(t('08:00')), shift_id: null, breaks: [] };
  const b1 = S.punch({ type: 'break_start', staff, venue: 'CAFE', open, now: t('12:10') });
  assert.equal(b1.action, 'break_start'); assert.equal(b1.breaks.length, 1); assert.equal(b1.breaks[0].end, null); assert.match(b1.message, /已連續工作 4 小時 10 分/);
  const onBreak = { ...open, breaks: b1.breaks };
  assert.throws(() => S.punch({ type: 'break_start', staff, venue: 'CAFE', open: onBreak, now: t('12:20') }), e => e.status === 409 && /已在休息中/.test(e.message));
  assert.throws(() => S.punch({ type: 'break_end', staff, venue: 'CAFE', open, now: t('12:20') }), e => e.status === 409 && /不在休息中/.test(e.message));
  const short = S.punch({ type: 'break_end', staff, venue: 'CAFE', open: onBreak, now: t('12:25') });
  assert.equal(short.break_minutes, 15); assert.match(short.message, /未滿 30 分/);
  const b2 = S.punch({ type: 'break_end', staff, venue: 'CAFE', open: onBreak, now: t('13:10') });
  assert.equal(b2.break_minutes, 60); assert.doesNotMatch(b2.message, /未滿/);
  const out = S.punch({ type: 'out', staff, venue: 'CAFE', open: { ...open, breaks: b2.breaks }, now: t('17:00') });
  assert.equal(out.minutes, 480, '9 小時扣 1 小時休息'); assert.equal(out.break_minutes, 60); assert.equal(out.break_short, false); assert.match(out.message, /本班 8 小時（休息 1 小時）/);
  // 休息中直接下班：休息算到下班那一刻
  const outOnBreak = S.punch({ type: 'out', staff, venue: 'CAFE', open: onBreak, now: t('13:00') });
  assert.equal(outOnBreak.break_minutes, 50); assert.equal(outOnBreak.minutes, 250); assert.equal(outOnBreak.breaks[0].end, new Date(t('13:00')).toISOString());
  // 整班沒休息又超過 4 小時：下班提醒；不到 4 小時不提醒
  assert.equal(S.punch({ type: 'out', staff, venue: 'CAFE', open, now: t('17:00') }).break_short, true);
  assert.equal(S.punch({ type: 'out', staff, venue: 'CAFE', open, now: t('11:00') }).break_short, false);
  // 休息狀態（上班中名單用）：連續工作從上次休息結束算
  const st = S.breakState(b2.breaks, open.clock_in, t('17:15'));
  assert.equal(st.continuous_minutes, 245); assert.equal(st.needs_break, true); assert.equal(st.on_break, false);
  assert.equal(S.breakState([], open.clock_in, t('11:59')).needs_break, false);
  assert.equal(S.breakState(b1.breaks, open.clock_in, t('12:30')).on_break, true);
  // 修正出勤可改休息分鐘，工時跟著扣；報表合計已扣休息並多一欄休息
  const f = S.attendanceFix({ clock_out: '2026-10-13T17:00:00+08:00', break_minutes: 45 }, { clock_in: new Date(t('08:00')), clock_out: null, break_minutes: 0, note: '' });
  assert.equal(f.minutes, 495); assert.equal(f.break_minutes, 45);
  assert.throws(() => S.attendanceFix({ clock_out: '2026-10-13T09:00:00+08:00', break_minutes: 90 }, { clock_in: new Date(t('08:00')), note: '' }), /比整班時間還長/);
  const rows = [{ staff_id: 'st_1', name: '小美', day: '2026-10-13', venue: 'CAFE', clock_in: new Date(t('08:00')).toISOString(), clock_out: new Date(t('17:00')).toISOString(), minutes: 480, break_minutes: 60, late_minutes: 0 }];
  assert.equal(S.attendanceSummary(rows)[0].hours, 8); assert.equal(S.attendanceSummary(rows)[0].break_minutes, 60);
  assert.equal(S.attendanceCsv(rows)[0].at(-1), '休息（分）'); assert.equal(S.attendanceCsv(rows)[1].at(-1), 60);
});

test('勞基法排班檢查：一天一班、間隔 11 小時、一週最多 5 天、週 40 小時、日 12 小時、月加班 46 小時；排休輸入不可過去', () => {
  const day = (d, s, e, id = 'x') => ({ id, staff_id: 'st_1', day: d, start_time: s, end_time: e });
  assert.deepEqual(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-13', start: '08:00', end: '17:00' }, []), []);
  assert.match(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-13', start: '17:00', end: '03:00' }, [day('2026-10-13', '08:00', '17:00')]).join(), /同一天已有班/);
  assert.match(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-14', start: '08:00', end: '17:00' }, [day('2026-10-13', '17:00', '03:00')]).join(), /11 小時/, '03:00 下班 08:00 上班只隔 5 小時');
  assert.deepEqual(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-14', start: '17:00', end: '03:00' }, [day('2026-10-13', '17:00', '03:00')]), [], '隔 14 小時可排');
  const five = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d, i) => day(d, '08:00', '17:00', 's' + i));
  const w = S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-17', start: '08:00', end: '17:00' }, five);
  assert.match(w.join(), /已排 5 天/); assert.match(w.join(), /40 小時/, '5×8＝40 再加 8 超過');
  assert.match(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-13', start: '08:00', end: '22:00' }, []).join(), /12 小時/, '14 小時扣 1 小時休息＝13 > 12');
  assert.match(S.shiftWarnings({ staff_id: 'st_1', day: '2026-10-20', start: '08:00', end: '20:00' }, Array.from({ length: 16 }, (_, i) => day('2026-10-' + String(i + 1).padStart(2, '0'), '08:00', '20:00', 'm' + i))).join(), /46 小時/, '每班 3 小時加班 ×16＝48');
  assert.equal(S.shiftWarnings({ staff_id: 'st_2', day: '2026-10-13', start: '08:00', end: '17:00' }, five).length, 0, '別人的班不算');
  const now = new Date('2026-10-13T12:00:00+08:00');
  assert.deepEqual(S.dayOffInput({ staff_id: 'st_1', day: '2026-10-20', note: ' 回家 ' }, { now }), { staff_id: 'st_1', day: '2026-10-20', note: '回家' });
  assert.throws(() => S.dayOffInput({ staff_id: 'st_1', day: '2026-10-12' }, { now }), /今天以後/);
  assert.throws(() => S.dayOffInput({ day: '2026-10-20' }, { now }), /員工/);
  assert.deepEqual(S.staffingInput([{ venue: 'cafe', start: '08:00', end: '17:00', headcount: '2' }]), [{ venue: 'CAFE', start: '08:00', end: '17:00', headcount: 2 }]);
  assert.throws(() => S.staffingInput([{ venue: 'CAFE', start: '08:00', end: '17:00', headcount: 12 }]), /0–9/);
  assert.throws(() => S.staffingInput([{ venue: 'BAR', start: '17:00', end: '03:00', headcount: 1 }], { own: ['CAFE'] }), e => e.status === 403);
});

test('自動排班：排休日不排、既有班保留、每人輪流（班少的先）、依勞基法規則；排不到人留警示', () => {
  const staff = [{ id: 'a', name: '阿明', active: true, venues: null }, { id: 'b', name: '小美', active: true, venues: ['CAFE'] }, { id: 'c', name: '離職', active: false, venues: null }];
  const staffing = [{ venue: 'CAFE', start: '08:00', end: '17:00', headcount: 1 }, { venue: 'BAR', start: '17:00', end: '03:00', headcount: 1 }];
  const r = S.autoSchedule({ monday: '2026-10-12', staff, daysOff: [{ staff_id: 'b', day: '2026-10-12' }], shifts: [], staffing });
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  assert.ok(r.added.every(s => s.note === '自動排班' && days.includes(s.day)));
  assert.ok(!r.added.some(s => s.staff_id === 'c'), '停用的不排');
  assert.ok(!r.added.some(s => s.staff_id === 'b' && s.day === '2026-10-12'), '排休日不排');
  assert.ok(!r.added.some(s => s.staff_id === 'b' && s.venue === 'BAR'), '店別不含三點水的不排三點水');
  // 三點水只有阿明能排：一週 7 天 ×10 小時，受「5 天」「40 小時」限制只能排 4–5 天，其餘留警示
  const barDays = r.added.filter(s => s.venue === 'BAR').map(s => s.day);
  assert.ok(barDays.length >= 4 && barDays.length <= 5, `三點水排 ${barDays.length} 天`);
  assert.ok(r.warnings.some(w => w.venue === 'BAR' && /缺 1 人/.test(w.message)), '排不到人要有警示');
  for (const id of ['a', 'b']) assert.ok(new Set(r.added.filter(s => s.staff_id === id).map(s => s.day)).size <= 5, `${id} 一週不超過 5 天`);
  for (const s of r.added) assert.deepEqual(S.shiftWarnings({ staff_id: s.staff_id, day: s.day, start: s.start, end: s.end }, r.added.filter(x => x !== s).map((x, i) => ({ ...x, id: 'n' + i, start_time: x.start, end_time: x.end }))), [], '排出來的班彼此不違規');
  // 既有班保留：已排好的那天不會再排第二個人
  const existing = [{ id: 'e1', staff_id: 'b', name: '小美', day: '2026-10-13', venue: 'CAFE', start_time: '08:00', end_time: '17:00' }];
  const r2 = S.autoSchedule({ monday: '2026-10-12', staff, daysOff: [], shifts: existing, staffing: [staffing[0]] });
  assert.ok(!r2.added.some(s => s.day === '2026-10-13' && s.venue === 'CAFE'), '10/13 在咖啡已有人');
  assert.equal(r2.added.length, 6);
  // 只排自己店別
  const r3 = S.autoSchedule({ monday: '2026-10-12', staff, daysOff: [], shifts: [], staffing, venues: ['CAFE'] });
  assert.ok(r3.added.every(s => s.venue === 'CAFE'));
  // 沒人力需求＝什麼都不排
  assert.deepEqual(S.autoSchedule({ monday: '2026-10-12', staff, staffing: [] }), { added: [], warnings: [] });
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
  const pos = read('public/pos.html'), ops = read('public/pos-ops.js'), admin = read('public/admin.html'), server = read('server.js');
  assert.match(pos, /\{ id:'shifts',(?: icon:'users',)?\s+label:'排班' \}/); assert.match(pos, /\{ id:'clock',(?: icon:'clock',)?\s+label:'打卡' \}/);
  assert.match(pos, /else if \(TAB === 'shifts'\) loadShifts\(\);/); assert.match(pos, /else if \(TAB === 'clock'\) loadClock\(\);/);
  assert.match(server, /app\.get\(\['\/pos', '\/pos\/\*'\]/);
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|analytics\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\|yan\|reservation-hours\|inventory\)/, '子帳號可用排班打卡 API');
  for (const fn of ['tabShifts', 'tabClock', 'loadShifts', 'loadClock']) assert.match(ops, new RegExp(`function ${fn}\\(`), fn);
  assert.match(ops, /api\('\/admin\/attendance\/punch',\{method:'POST',body:\{pin/);
  assert.doesNotMatch(ops, /localStorage\.setItem\([^)]*pin/i, '識別碼不可存在平板');
  // 平板用自製數字鍵盤（不彈系統鍵盤），畫面只顯示 4 個點、不顯示數字；送出後立刻清空
  assert.match(ops, /class="clock-pin"/, '識別碼以點顯示'); assert.match(ops, /const pin=CLOCK_PIN;CLOCK_PIN='';/, '送出即清空識別碼');
  assert.doesNotMatch(ops, /\$\{CLOCK_PIN\}|esc\(CLOCK_PIN\)/, '識別碼不可印到畫面');
  // 2026-10-15 決策：員工管理（新增／編輯／停用、出勤修正）只在 admin 品牌工作區「排班打卡」，平板 POS 不放「員工」分頁，
  // 且伺服器端把用四位數密碼登入的現場人員（operator_staff_id）擋在這些寫入端點之外，避免現場亂動
  assert.match(admin, /BRAND_TABS = \{ CAFE:\['sales','staff'\], BAR:\['sales','staff'\] \}/);
  assert.match(admin, /\{ id:'staff',\s+label:'排班打卡',\s+render:tabStaff \}/); assert.match(admin, /if \(tab === 'staff'\) \{ loadStaff\(\); return; \}/);
  assert.doesNotMatch(pos, /id:'staff'/, '平板 POS 不放員工管理分頁'); assert.doesNotMatch(ops, /loadStaffPage/);
  assert.match(server, /function notOperator\(req, res, next\) \{\s*if \(req\.auth\.operator_staff_id\) return res\.status\(403\)/);
  for (const ep of ["app.post('/api/admin/staff',auth,adminOnly,notOperator,", "app.patch('/api/admin/staff/:id',auth,adminOnly,notOperator,", "app.patch('/api/admin/attendance/:id',auth,adminOnly,notOperator,", "app.delete('/api/admin/attendance/:id',auth,adminOnly,notOperator,"]) assert.ok(server.includes(ep), ep);
  assert.ok(server.includes("app.get('/api/admin/staff',auth,adminOnly,requireDb"), '員工名單仍開放給操作人員（排班／打卡要用）');
  // 休息：平板四顆鍵；上班中名單標休息中／該休息；伺服器打卡端點收 break_start／break_end、出勤表有 breaks 欄
  for (const s of ['id="clock-break-start"', 'id="clock-break-end"', "punch('break_start')", "punch('break_end')", 'on-break', 'needs-break', '休息中（']) assert.ok(ops.includes(s), s);
  assert.match(server, /ADD COLUMN IF NOT EXISTS breaks JSONB/); assert.match(server, /ADD COLUMN IF NOT EXISTS break_minutes INT/);
  assert.match(server, /if\(out\.action==='break_start'\|\|out\.action==='break_end'\)\{\s*await q\('UPDATE pos_attendance SET breaks=\$2::jsonb,break_minutes=\$3/);
  assert.match(server, /UPDATE pos_attendance SET clock_out=\$2,minutes=\$3,early_minutes=\$4,breaks=\$5::jsonb,break_minutes=\$6/, '下班同時存休息');
  // 排休與自動排班：端點、平板按鈕、人力需求
  for (const ep of ["app.post('/api/admin/shifts/auto'", "app.get('/api/admin/shifts/days-off'", "app.post('/api/admin/shifts/days-off'", "app.delete('/api/admin/shifts/days-off/:id'", "app.get('/api/admin/shifts/staffing'", "app.put('/api/admin/shifts/staffing'", 'CREATE TABLE IF NOT EXISTS pos_days_off', 'CREATE TABLE IF NOT EXISTS pos_staffing']) assert.ok(server.includes(ep), ep);
  assert.ok(server.indexOf("app.post('/api/admin/shifts/auto'") < server.indexOf("app.delete('/api/admin/shifts/:id'"), '/shifts/auto 等路由要排在 /shifts/:id 之前');
  assert.match(server, /posStaff\.shiftWarnings\(s,mine\)/, '手動排班回勞基法提醒');
  for (const s of ['id="sh-auto"', 'id="sh-staffing"', 'data-off=', 'data-off-del=', "'/admin/shifts/auto'", "'/admin/shifts/days-off'", "'/admin/shifts/staffing'", 'shift-warn', 'staffing-row']) assert.ok(ops.includes(s), s);
  // 直式平板（601–999px，如 iPad 10 吋直式）八個分頁一行放不下；.p-nav 的捲軸是隱藏的，所以要換行，不能讓「打卡」「排班」被擠到畫面外
  assert.match(pos, /@media\(min-width:601px\) and \(max-width:999px\)\{:root\{--p-top:108px\}\.p-nav-wrap\{order:3;flex:1 1 100%\}\.p-nav\{overflow-x:visible;flex-wrap:wrap/, '直式平板分頁列要換到第二行並可折行');
  // 手機（≤600px）：跟平板一樣換行會疊成 4 行、頂欄佔掉近一半螢幕（KK 回報「上半部佔比太多」）→ 分頁維持單行可滑動，不可換行
  assert.match(pos, /@media\(max-width:600px\)\{:root\{--p-top:108px\}\.p-nav-wrap\{order:3;flex:1 1 100%\}\.p-nav\{overflow-x:auto;flex-wrap:nowrap/, '手機分頁列要維持單行可滑動');
  // 「還有更多分頁可滑」要有明確提示，不能只靠隱藏捲軸或邊緣淡化（10/13 就是因為使用者看不出來而漏用「打卡」「排班」）
  assert.match(pos, /id="p-nav-more" aria-hidden="true">›</, 'HTML 要有固定的「還有更多」提示元素');
  assert.match(pos, /\.p-nav-more\.show\{display:flex\}/, '提示預設隱藏、有內容可滑才顯示');
  assert.match(pos, /navEl\.scrollWidth - navEl\.scrollLeft - navEl\.clientWidth > 4/, '要判斷分頁列是否還能往右滑');
  assert.match(pos, /navEl\.addEventListener\('scroll', updateNavMore/, '捲動分頁列要即時更新提示');
  assert.match(pos, /active\.scrollIntoView\(\{ inline: 'nearest'/, '切換分頁要把目前分頁捲進視野');
  // 手機（375px）頂欄會折成三四行：不能用 fixed＋固定高度（多出來的行往上被狀態列蓋住、往下壓到內容），要 sticky＋min-height 由內容撐高
  assert.match(pos, /\.p-top\{position:sticky;top:0;min-height:calc\(var\(--p-top\)/, '頂欄要 sticky、高度由內容撐');
  assert.doesNotMatch(pos, /\.p-top\{[^}]*position:fixed/, '頂欄不可 fixed');
  assert.doesNotMatch(pos, /body\{[^}]*padding-top:calc\(var\(--p-top\)/, 'body 不再用 padding-top 預留頂欄高度');
});

test('打卡不分品牌：上班、下班、補打卡都統一記為言文字', () => {
  const staff = { id: 'st_1', name: '小美', active: true, venues: ['CAFE'] };
  const at = h => +new Date(`2026-10-15T${h}:00+08:00`);
  const barShift = [{ id: 'sh', staff_id: 'st_1', day: '2026-10-15', venue: 'BAR', start_time: '17:00', end_time: '23:00' }];
  const inn = S.punch({ type: 'in', staff, venue: 'CAFE', shifts: barShift, now: at('17:05') });
  assert.equal(inn.venue, 'TTH');
  assert.equal(inn.shift_id, 'sh', '排班仍可用在咖啡／三點水配對，但出勤本身不分品牌');
  assert.doesNotMatch(inn.message, /在咖啡|三點水/);
  const out = S.makeupPunch({ staff, venue: 'BAR', body: { reason: '忘記打卡', clock_in: '2026-10-15 18:00', clock_out: '2026-10-15 23:00' }, open: null, existing: [], shifts: barShift, now: at('23:30') });
  assert.equal(out.venue, 'TTH');
  assert.equal(out.shift_id, 'sh');
});
test('POS 打卡頁與出勤報表不傳、不顯示品牌', () => {
  const js = read('public/pos-ops.js');
  assert.doesNotMatch(js, /CLOCK_VENUE|clock-venue|aria-label="店別"/);
  assert.match(js, /body:\{pin,type\}/);
  const attendance = js.slice(js.indexOf('async function loadAttendance'));
  assert.doesNotMatch(attendance, /BRAND_LABEL\[r\.venue\]|<th>店別<\/th>|[?&]venue=/);
  const srv = read('server.js');
  assert.match(srv, /const venue=posStaff\.ATTENDANCE_VENUE/);
  assert.match(srv, /UPDATE pos_attendance SET venue='TTH' WHERE venue<>'TTH'/);
  assert.doesNotMatch(srv.slice(srv.indexOf("'/api/admin/attendance',auth"),srv.indexOf('/* LINE Pay 同步')), /visibleVenues/);
});
