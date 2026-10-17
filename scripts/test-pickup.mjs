// 預約取餐（lib/pickup.js）：時段格、驗證、自動送單時機
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const pickup = require('../lib/pickup');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const at = (d, t) => new Date(`${d}T${t}:00+08:00`);

test('時段：08:00–23:45 每 15 分鐘，今天剔除 20 分鐘內；凌晨不開放', () => {
  const now = at('2026-10-20', '10:07');
  assert.deepEqual(pickup.dates(now), ['2026-10-20', '2026-10-21', '2026-10-22']);
  const today = pickup.slotsFor('2026-10-20', now);
  assert.equal(today[0].time, '10:30'); assert.equal(today[0].venue, 'CAFE');
  assert.equal(today.at(-1).time, '23:45'); assert.equal(today.at(-1).venue, 'BAR');
  assert.ok(!today.some(s => s.time === '10:15'), '10:15 在 20 分鐘內');
  const tomorrow = pickup.slotsFor('2026-10-21', now);
  assert.equal(tomorrow[0].time, '08:00'); assert.equal(tomorrow.length, 16 * 4);
  assert.equal(pickup.venueOfTime('02:00'), null); assert.equal(pickup.venueOfTime('16:45'), 'CAFE'); assert.equal(pickup.venueOfTime('17:00'), 'BAR');
});

test('normalizePickup：日期／時間／品項驗證', () => {
  const now = at('2026-10-20', '10:00');
  const ok = pickup.normalizePickup({ date: '2026-10-20', time: '11:00', items: [{ item_id: 'm_a', qty: 2, note: ' 去冰 ' }], note: 'x' }, now);
  assert.equal(ok.venue, 'CAFE'); assert.equal(ok.items[0].note, '去冰'); assert.equal(+ok.pickupAt, +at('2026-10-20', '11:00'));
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-23', time: '11:00', items: [{ item_id: 'a', qty: 1 }] }, now), /三天內/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-20', time: '11:10', items: [{ item_id: 'a', qty: 1 }] }, now), /15 分鐘/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-20', time: '10:15', items: [{ item_id: 'a', qty: 1 }] }, now), /20 分鐘後/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-21', time: '01:00', items: [{ item_id: 'a', qty: 1 }] }, now), /沒有營業/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-20', time: '11:00', items: [] }, now), /1–20 種/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-20', time: '11:00', items: [{ item_id: 'a', qty: 0 }] }, now), /1–20/);
  assert.throws(() => pickup.normalizePickup({ date: '2026-10-20', time: '11:00', items: [{ item_id: 'a', qty: 20 }, { item_id: 'b', qty: 20 }, { item_id: 'c', qty: 1 }] }, now), /40 件/);
});

test('guestOf 符合 addLine 的來賓識別格式；送單時機＝取餐前 20 分鐘；過期 4 小時', () => {
  assert.match(pickup.guestOf('u_ABC-123'), /^[a-z0-9]{8,32}$/);
  assert.match(pickup.guestOf('u'), /^[a-z0-9]{8,32}$/);
  const p = at('2026-10-20', '12:00');
  assert.equal(pickup.dueToPlace(p, at('2026-10-20', '11:39')), false);
  assert.equal(pickup.dueToPlace(p, at('2026-10-20', '11:40')), true);
  assert.equal(pickup.expired(p, at('2026-10-20', '15:59')), false);
  assert.equal(pickup.expired(p, at('2026-10-20', '16:00')), true);
  assert.equal(pickup.clock(p), '12:00');
});

test('server：預約單開外帶號、品項不先送單、排程送單並出單、取消限未送單；POS 桌況帶取餐時間', () => {
  assert.match(server, /tableOrders\.nextTakeoutTable\(used\)/);
  assert.match(server, /INSERT INTO table_sessions\(id,table_no,items,user_id,pickup_at,pickup_note,opened_by_staff_name\)/);
  assert.match(server, /async function placeDuePickups/); assert.match(server, /tableOrders\.placeLines\(cur\.items, now\)/); assert.match(server, /kitchenPrint\.enqueue\(client\.query\.bind\(client\), \[\{ \.\.\.cur, items: placed\.lines \}\]\)/);
  assert.match(server, /schedule\('\* \* \* \* \*',async\(\)=>\{if\(pickupRunning\)return;/);
  assert.match(server, /pickup_placed_at IS NULL AND NOT EXISTS \(SELECT 1 FROM jsonb_array_elements\(items\)/);
  assert.match(server, /tableOrders\.menuIndex\(await contentValue\('menu'\), p\.venue, \{ now: p\.pickupAt \}\)/, '菜單依取餐時段品牌');
  assert.match(server, /pickup_at:s\.pickup_at\|\|null,pickup_note:s\.pickup_note\|\|'',pickup_placed:!!s\.pickup_placed_at/);
  assert.match(fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8'), /預約取餐<\/span> \$\{esc\(clockText\(s\.pickup_at\)\)\}/);
});

test('會員訂位：綁 user_id、Email 可空、來源 member-app、取消通知員工', () => {
  const R = require('../lib/reservations');
  const now = at('2026-10-20', '10:00');
  const base = { date: '2026-10-21', time: '12:00', party_size: 2, name: '王小明', phone: '0912345678', email: '' };
  assert.throws(() => R.normalizeReservation(base, now), /Email/);
  assert.equal(R.normalizeReservation(base, now, { member: true }).email, '');
  assert.throws(() => R.normalizeReservation({ ...base, time: '10:30', date: '2026-10-20' }, now, { member: true }), /已經過了/, '會員端仍擋 30 分鐘內');
  assert.match(server, /source: 'member-app' \}, new Date\(\), \{ member: true \}/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS user_id TEXT/);
  assert.match(server, /lineService\.notifyStaff\(`❌ 訂位已由客人在會員 App 取消/);
});
