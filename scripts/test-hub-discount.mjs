import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const hub = require('../lib/hub-discount.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('資格：在其他品牌消費過才適用', () => {
  assert.equal(hub.eligible(['CAFE'], ['BAR']), true);
  assert.equal(hub.eligible(['CAFE'], ['CAFE']), false);
  assert.equal(hub.eligible([], ['BAR']), false);
  assert.equal(hub.eligible(['STAY', 'CAFE'], ['CAFE']), true);
  assert.equal(hub.eligible(['CAFE'], null), false);
});

test('單據品牌：排除取消、打賞、預收抵扣', () => {
  const v = hub.paidVenues([{ items: [{ venue: 'CAFE' }, { venue: 'BAR', cancelled: true }, { venue: 'REST', tip: { id: 1 } }] }, { items: [{ venue: 'STAY', credit_of: 'x' }] }]);
  assert.deepEqual(v, ['CAFE']);
});

test('營業日起點 03:00', () => {
  assert.equal(hub.since(Date.parse('2026-11-23T01:00:00+08:00'), 1).toISOString(), '2026-11-21T19:00:00.000Z');
  assert.equal(hub.since(Date.parse('2026-11-23T10:00:00+08:00'), 1).toISOString(), '2026-11-22T19:00:00.000Z');
});

test('折扣 9 折', () => { assert.deepEqual(hub.discount(), { type: 'percent', value: 10, reason: '聚落跨品牌', tag: 'hub' }); });

test('接線：lookup 回 hub、結帳伺服器重查、POS 自動帶入', () => {
  const s = read('server.js');
  assert.match(s, /res\.json\(\{ tag: verified \? memberTags\.tagOf\(user\.member_tag\) : null, hub, ok: true,/);
  assert.match(s, /const hub = verified \? \{ paid: hubPaid, eligible:/);
  assert.match(s, /req\.body\.discount\.tag==='hub'[\s\S]{0,600}hubDiscount\.eligible\(await hubPaidVenues\(client,memberUser\.id\)/);
  const ops = read('public/pos-ops.js');
  assert.match(ops, /out\.hub&&out\.hub\.eligible\?\{key:'hub'/);
});
