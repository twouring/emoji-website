import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../lib/reservation-hours.js');
const R = require('../lib/reservations.js');
const NOW = new Date('2026-10-18T02:00:00Z'); // 週日 10:00 台北
const body = (date, time) => ({ date, time, party_size: 2, name: '王', phone: '0912345678', email: 'a@b.co' });

test('沒設定＝全部開放', () => {
  assert.deepEqual(H.slotsFor(H.parse(''), '2026-10-20'), H.ALL);
});
test('每週設定、特定日期優先、空陣列＝公休', () => {
  const cfg = H.parse({ weekly: { 1: ['08:00', '08:30', 'bogus'] }, dates: { '2026-10-26': [] , '2026-10-19': ['19:00'] } });
  assert.deepEqual(H.slotsFor(cfg, '2026-10-26'), []);            // 週一但日期例外＝公休
  assert.deepEqual(H.slotsFor(cfg, '2026-10-19'), ['19:00']);
  assert.deepEqual(H.slotsFor(cfg, '2026-11-02'), ['08:00', '08:30']); // 一般週一
  assert.deepEqual(H.slotsFor(cfg, '2026-10-20'), H.ALL);         // 週二沒設定
});
test('normalize：丟過期日期、全開的星期不存', () => {
  const c = H.normalize({ weekly: { 2: H.ALL }, dates: { '2026-10-01': ['08:00'], '2026-10-30': [] } }, '2026-10-18');
  assert.deepEqual(c, { weekly: {}, dates: { '2026-10-30': [] } });
});
test('客人訂位被擋、櫃檯不擋', () => {
  const hours = H.parse({ dates: { '2026-10-20': ['19:00'] } });
  assert.throws(() => R.normalizeReservation(body('2026-10-20', '12:00'), NOW, { hours }), /不開放訂位/);
  assert.equal(R.normalizeReservation(body('2026-10-20', '19:00'), NOW, { hours }).time, '19:00');
  assert.equal(R.normalizeReservation(body('2026-10-20', '12:00'), NOW, { hours, staff: true }).time, '12:00');
  assert.throws(() => R.normalizeReservation(body('2026-10-20', '12:00'), NOW, { hours, member: true }), /不開放訂位/);
});
