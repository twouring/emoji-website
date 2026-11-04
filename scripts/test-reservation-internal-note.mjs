import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js'), ops = read('public/pos-ops.js'), docs = read('docs/API.md');
const tableOrders = createRequire(import.meta.url)(path.join(root, 'lib/table-orders.js'));

test('內部備註：獨立欄位，登記／編輯／列表都帶，客人信件與 App 不帶', () => {
  assert.match(server, /ADD COLUMN IF NOT EXISTS internal_note TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /table_no,staff_note,internal_note,COALESCE/);
  assert.match(server, /handled_by,internal_note\)\n\s*VALUES\(/);
  assert.match(server, /internal_note=COALESCE\(\$10,internal_note\)/, 'PATCH 沒帶 internal_note 不能清掉');
  const me = server.match(/const SEL_RESV_ME=`[^`]*`/)[0];
  assert.doesNotMatch(me, /internal_note/, '會員 App 不可看到內部備註');
  const mail = read('lib/table-orders.js').match(/function reservationReplyMail[\s\S]*?\n}/)[0];
  assert.doesNotMatch(mail, /internal_note/, '回覆信不可帶內部備註');
  assert.doesNotMatch(read('lib/reservations.js'), /internal_note/);
});

test('POS：登記與編輯表單有內部備註＋常用鍵（含招待），清單與桌況卡片顯示', () => {
  assert.match(ops, /const RESV_INTERNAL_PRESETS=\[[^\]]*'招待'/);
  assert.match(ops, /name="internal_note" id="resv-new-internal"/);
  assert.match(ops, /id="re-internal"/);
  assert.match(ops, /internal_note:host\.querySelector\('#re-internal'\)\.value/);
  assert.match(ops, /內部：\$\{esc\(r\.internal_note\)\}/);
  assert.match(ops, /r\.internal_note\?` <span class="resv-internal">/);
});

test('reservationsByTable 帶出 internal_note', () => {
  const now = new Date('2026-11-04T04:00:00Z');
  const out = tableOrders.reservationsByTable([{ id: 'a', status: 'confirmed', table_no: 'a3', reserve_date: '2026-11-04', reserve_time: '13:00', name: '王', party_size: 2, internal_note: '招待' }], now);
  assert.equal(out.A3[0].internal_note, '招待');
});

test('API.md 記錄 internal_note', () => {
  assert.match(docs.split('### POST /api/admin/reservations\n')[1].split(/\n### /)[0], /internal_note/);
  assert.match(docs.split('### PATCH /api/admin/reservations/:id')[1].split(/\n### /)[0], /internal_note/);
});
