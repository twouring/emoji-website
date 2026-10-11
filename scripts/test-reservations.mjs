import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const reservations = require(path.join(root, 'lib/reservations.js'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/reserve.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/reserve.js'), 'utf8');

test('reservation page is mobile-first: tap-only slots and party size, no free-text time', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.emoji\.tw\/reserve">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
  assert.match(html, /<form id="reserveForm"/);
  assert.match(html, /name="date" type="date"/);
  assert.match(html, /id="slotGroups" role="radiogroup"/);
  assert.doesNotMatch(html, /type="time"/, '時段改為點選，不再有時間輸入框');
  assert.doesNotMatch(html, /<select name="party_size"/, '人數改為點選，不再用下拉');
  for (const n of [1, 2, 3, 4, 5, 6]) assert.match(html, new RegExp(`<input type="radio" name="party_size" value="${n}" required>`));
  assert.match(html, /name="phone" type="tel" inputmode="tel" autocomplete="tel"/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /保留至預約時間後 10 分鐘/);
  assert.match(html, /送出即完成訂位/);
  assert.doesNotMatch(html, /訂位申請/, '送出即成立訂位，不再稱申請');
});

test('reservation frontend renders 30-minute slots per brand and posts JSON safely', () => {
  assert.match(js, /slots\(8\*60,17\*60\)/);
  assert.match(js, /slots\(17\*60,24\*60\)\.concat\(slots\(0,3\*60\)\)/);
  assert.match(js, /timeZone:'Asia\/Taipei'/);
  assert.match(js, /input\.disabled=true/, '今天已過的時段要鎖住');
  assert.match(js, /fetch\('\/api\/reservations'/);
  assert.match(js, /method:'POST'/);
  assert.match(js, /email:val\('email'\)/);
  assert.match(js, /HOLD_MINUTES=10/);
  assert.match(js, /summary\.textContent=''/);
  assert.match(js, /document\.createTextNode/);
  assert.doesNotMatch(js, /innerHTML/);
});

test('reservation API confirms immediately, stores email, mails guest and staff', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS dining_reservations/);
  assert.match(server, /email TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS email/);
  assert.match(server, /CREATE INDEX IF NOT EXISTS dining_reservations_date_idx/);
  assert.match(server, /app\.post\('\/api\/reservations', rateLimit\(\{ max: 30, windowMs: 3600000 \}\), requireDb, wrap/);
  assert.match(server, /reservations\.normalizeReservation\(req\.body\)/);
  assert.match(server, /r\.email, r\.note, r\.source, 'confirmed'\]/);
  assert.match(server, /sendMailQuietly\(\{ to: r\.email, subject: `\[言文字\] 訂位確認/);
  assert.match(server, /sendMailQuietly\(\{ to: NOTIFY_EMAIL, subject: `\[訂位\]/);
  assert.match(server, /hold_until: reservations\.holdUntil\(r\.time\), hold_minutes: reservations\.HOLD_MINUTES/);
});

test('reservation slots: fixed 30-minute grid, brand derived from time, past slots rejected', () => {
  const { SLOTS, normalizeReservation, holdUntil, HOLD_MINUTES, guestMail, staffMail } = reservations;
  assert.equal(HOLD_MINUTES, 10);
  assert.equal(SLOTS.size, 18 + 14 + 6);
  assert.equal(SLOTS.get('08:00'), '在咖啡');
  assert.equal(SLOTS.get('16:30'), '在咖啡');
  assert.equal(SLOTS.get('17:00'), '三點水');
  assert.equal(SLOTS.get('23:30'), '三點水');
  assert.equal(SLOTS.get('02:30'), '三點水');
  assert.equal(SLOTS.get('03:00'), undefined);
  assert.equal(SLOTS.get('07:30'), undefined);
  assert.equal(holdUntil('19:00'), '19:10');
  assert.equal(holdUntil('23:30'), '23:40');
  assert.equal(holdUntil('02:30'), '02:40');

  const now = new Date('2026-10-11T12:00:00+08:00');
  const base = { date: '2026-10-12', time: '19:00', party_size: 2, name: '王小姐', phone: '0912-345-678', email: 'Guest@Example.com' };
  const ok = normalizeReservation(base, now);
  assert.equal(ok.period, '三點水');
  assert.equal(ok.email, 'guest@example.com');
  assert.throws(() => normalizeReservation({ ...base, time: '19:15' }, now), /時段/);
  assert.throws(() => normalizeReservation({ ...base, time: '07:30' }, now), /時段/);
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-11', time: '12:00' }, now), /已經過了/);
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-11', time: '12:30' }, now), /已經過了/);
  assert.equal(normalizeReservation({ ...base, date: '2026-10-11', time: '13:00' }, now).period, '在咖啡');
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-10' }, now), /早於今天/);
  assert.throws(() => normalizeReservation({ ...base, date: '2027-03-01' }, now), /120 天/);
  assert.throws(() => normalizeReservation({ ...base, email: 'nope' }, now), /Email/);
  assert.throws(() => normalizeReservation({ ...base, party_size: 0 }, now), /人數/);
  assert.throws(() => normalizeReservation({ ...base, party_size: 51 }, now), /人數/);
  assert.throws(() => normalizeReservation({ ...base, phone: '123' }, now), /手機/);

  const guest = guestMail(ok, 'R261011-AB12');
  assert.match(guest, /訂位已成立/);
  assert.match(guest, /座位保留至 19:10（預約時間後 10 分鐘）/);
  assert.match(guest, /R261011-AB12/);
  const staff = staffMail(ok, 'R261011-AB12', 'https://www.emoji.tw');
  assert.match(staff, /guest@example\.com/);
  assert.match(staff, /https:\/\/www\.emoji\.tw\/reserve/);
});
