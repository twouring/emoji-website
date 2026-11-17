import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-staff');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const route = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));
const staff = { id: 's1', name: '小美', active: true };
const now = new Date('2026-11-11T08:00:00Z');

test('打卡依 POS 品牌，僅配同品牌排班；跨品牌未下班拒絕', () => {
  const shifts = [{ id: 'bar', staff_id: 's1', day: '2026-11-11', venue: 'BAR', start_time: '16:00', end_time: '20:00' }];
  const cafe = S.punch({ type: 'in', staff, venue: 'CAFE', shifts, now });
  assert.equal(cafe.venue, 'CAFE'); assert.equal(cafe.shift_id, null);
  const bar = S.punch({ type: 'in', staff, venue: 'BAR', shifts, now });
  assert.equal(bar.venue, 'BAR'); assert.equal(bar.shift_id, 'bar');
  const open = { id: 'a1', venue: 'BAR', day: '2026-11-11', clock_in: now, breaks: [] };
  assert.throws(() => S.punch({ type: 'in', staff, venue: 'CAFE', open, now }), e => e.status === 409 && /三點水/.test(e.message));
  assert.throws(() => S.punch({ type: 'out', staff, venue: 'CAFE', open, now }), e => e.status === 409 && /三點水/.test(e.message));
});

test('補卡只配當前品牌排班且不得補另一品牌下班', () => {
  const body = { reason: '忘記打卡', clock_in: '2026-11-11T14:00', clock_out: '2026-11-11T15:00' };
  const shifts = [{ id: 'bar', staff_id: 's1', day: '2026-11-11', venue: 'BAR', start_time: '14:00', end_time: '18:00' }];
  const r = S.makeupPunch({ staff, venue: 'CAFE', body, shifts, now: '2026-11-11T08:00:00Z' });
  assert.equal(r.venue, 'CAFE'); assert.equal(r.shift_id, null);
  const open = { id: 'a1', venue: 'BAR', day: '2026-11-11', clock_in: '2026-11-11T04:00:00Z', breaks: [] };
  assert.throws(() => S.makeupPunch({ staff, venue: 'CAFE', body: { reason: '忘記打卡', clock_out: '2026-11-11T15:00' }, open, now: '2026-11-11T08:00:00Z' }), e => e.status === 409 && /三點水/.test(e.message));
});

test('server：無開機洗回、以登入品牌查 PIN 並寫實際品牌', () => {
  assert.doesNotMatch(server, /UPDATE pos_attendance SET venue='TTH'/);
  const punch = route("app.post('/api/admin/attendance/punch'", "app.post('/api/admin/attendance/makeup'");
  const makeup = route("app.post('/api/admin/attendance/makeup'", "app.get('/api/admin/attendance'");
  assert.match(punch, /venue:out\.venue/); assert.match(punch, /out\.venue,out\.shift_id/);
  assert.match(makeup, /const venue=pinVenue\(/);
  assert.doesNotMatch(punch + makeup, /ATTENDANCE_VENUE/);
});

test('server：報表與 CSV 同範圍，編修刪除按出勤品牌而非員工品牌', () => {
  const list = route("app.get('/api/admin/attendance'", "app.patch('/api/admin/attendance/:id'");
  const patch = route("app.patch('/api/admin/attendance/:id'", "app.delete('/api/admin/attendance/:id'");
  const del = route("app.delete('/api/admin/attendance/:id'", '/* LINE Pay 同步');
  assert.match(list, /av\.includes\(a\.venue\)/);
  assert.match(list, /attendanceCsv\(rows2\)/);
  for (const r of [patch, del]) { assert.match(r, /venues\.includes\(r\.venue\)/); assert.doesNotMatch(r, /staffVisible/); }
});

test('舊 TTH 未下班卡：任一品牌可下班／休息，並改記為該品牌；不擋上班重複', () => {
  const open = { id: 'a1', venue: 'TTH', day: '2026-11-17', clock_in: '2026-11-17T08:45:00Z', breaks: [] };
  const n = '2026-11-17T17:50:00Z';
  const out = S.punch({ type: 'out', staff, venue: 'BAR', open, now: n });
  assert.equal(out.action, 'out'); assert.equal(out.venue, 'BAR'); assert.equal(out.id, 'a1');
  assert.equal(S.punch({ type: 'break_start', staff, venue: 'CAFE', open, now: n }).venue, 'CAFE');
  assert.throws(() => S.punch({ type: 'in', staff, venue: 'BAR', open, now: n }), e => e.status === 409);
  const mk = S.makeupPunch({ staff, venue: 'BAR', body: { reason: '舊卡補下班', clock_out: '2026-11-17T17:00' }, open, now: n });
  assert.equal(mk.mode, 'out'); assert.equal(mk.venue, 'BAR');
  const punchRoute = route("app.post('/api/admin/attendance/punch'", "app.post('/api/admin/attendance/makeup'");
  assert.match(punchRoute, /break_minutes=\$6,venue=\$7/);
});
