// POS 訂位分頁顯示包場（KK 11/24）：event_applications 的包場依品牌列在訂位清單與今天看板
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buyoutsFor, buyoutVenue, taipeiParts } = require('../lib/reservation-buyouts.js');
const A = (o) => ({ id: 'ea_' + (o.zone || o.venue), visibility: 'private', status: 'approved', deposit_twd: 1000, deposit_paid_at: '2026-11-20T00:00:00Z', title: 'T', community_name: 'C', contact_name: '王', contact_phone: '0912', attendees: 8, starts_at: '2026-11-27T03:00:00Z', ends_at: '2026-11-27T05:00:00Z', ...o });

test('品牌歸屬：zone 優先，1F 依開始時間', () => {
  assert.equal(buyoutVenue(A({ zone: 'CAFE', venue: '1F' })), 'CAFE');
  assert.equal(buyoutVenue(A({ zone: 'BAR', venue: '1F' })), 'BAR');
  assert.equal(buyoutVenue(A({ zone: 'LOUNGE', venue: '2F' })), 'REST');
  assert.equal(buyoutVenue(A({ zone: 'D', venue: '3F' })), 'STAY');
  assert.equal(buyoutVenue(A({ zone: null, venue: '1F', starts_at: '2026-11-27T11:00:00Z' })), 'BAR');
  assert.equal(buyoutVenue(A({ zone: null, venue: '1F' })), 'CAFE');
});

test('只列已通過或已付款；未付款、婉拒、公開活動不列；依品牌過濾', () => {
  const rows = [A({ zone: 'D', venue: '3F' }), A({ zone: 'A', venue: '3F', status: 'pending', deposit_paid_at: null }), A({ zone: 'B', venue: '3F', status: 'pending' }),
    A({ zone: 'C', venue: '3F', status: 'rejected' }), A({ zone: 'CAFE', venue: '1F', visibility: 'public' }), A({ zone: 'BAR', venue: '1F', starts_at: '2026-11-27T12:00:00Z', ends_at: '2026-11-27T14:00:00Z' })];
  const all = buyoutsFor(rows, null);
  assert.deepEqual(all.map(b => b.zone), ['D', 'B', 'BAR']);
  assert.equal(all.find(b => b.zone === 'B').status, 'pending');
  assert.deepEqual(buyoutsFor(rows, ['STAY']).map(b => b.zone), ['D', 'B']);
  assert.deepEqual(buyoutsFor(rows, ['CAFE']), []);
  const d = all[0];
  assert.equal(d.date, '2026-11-27'); assert.equal(d.start, '11:00'); assert.equal(d.end, '13:00'); assert.equal(d.place, '等等空間 D 榻榻米區');
});

test('凌晨 03:00 前算前一個營業日', () => {
  assert.deepEqual(taipeiParts('2026-11-27T17:30:00Z'), { date: '2026-11-27', time: '01:30' });
});

test('API 與 POS 接線', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  const doc = fs.readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
  assert.match(server, /reservationBuyouts\.buyoutsFor\(/);
  assert.match(server, /res\.json\(\{reservations:rows,buyouts,/);
  assert.match(ops, /resvTodayHtml\(todayRows,Date\.now\(\),todayBuyouts\)/);
  assert.match(ops, /resv-buyout-row/);
  assert.match(doc, /`buyouts\[\]`/);
});
