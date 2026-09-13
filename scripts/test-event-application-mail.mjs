import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mail = require('../lib/event-application-mail.js');

const application = {
  id: 'ea_test', kind: 'business', venue: '2F', community_name: '測試公司', contact_name: '王小明',
  contact_email: 'applicant@example.test', title: '年度聚會', starts_at: '2099-06-20T11:00:00.000Z', ends_at: '2099-06-20T13:00:00.000Z',
};

test('every progress kind produces a personal mail with the application id and portal link', () => {
  for (const kind of mail.KINDS) {
    const { subject, text } = mail.applicationUpdateMail({ application, update: { kind, message: '請於下週前補件。' }, origin: 'https://www.emoji.tw' });
    assert.match(subject, /^\[言文字\] 企業包場申請/);
    assert.match(subject, /年度聚會/);
    assert.match(text, /^王小明 您好，/);
    assert.match(text, /申請編號：ea_test/);
    assert.match(text, /https:\/\/www\.emoji\.tw\/event-application/);
  }
  const submitted = mail.applicationUpdateMail({ application, update: { kind: 'submitted' } }).text;
  assert.match(submitted, /二樓交誼廳/);
  assert.match(submitted, /2099\/06\/20\D{1,3}19:00/);
  assert.match(submitted, /2099\/06\/20\D{1,3}21:00/);
  assert.match(submitted, /不代表場地已保留/);
  const approved = mail.applicationUpdateMail({ application, update: { kind: 'approved', message: '請聯絡確認檔期。' } });
  assert.match(approved.subject, /初步通過（場地尚未保留）/);
  assert.match(approved.text, /回覆：\n請聯絡確認檔期。/);
  const rejected = mail.applicationUpdateMail({ application, update: { kind: 'rejected', message: '檔期已滿。' } });
  assert.match(rejected.subject, /未通過/);
  assert.match(rejected.text, /檔期已滿。/);
  const update = mail.applicationUpdateMail({ application, update: { kind: 'update', message: '訂金已收到，檔期確認。' } });
  assert.match(update.subject, /進度更新/);
  assert.match(update.text, /訂金已收到，檔期確認。/);
});

test('retry backoff grows and then plateaus', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(mail.retryDelayMs), [60e3, 300e3, 900e3, 3600e3, 6 * 3600e3, 6 * 3600e3]);
});

function fakeQueue(rows, clock = () => Date.now()) {
  const log = [];
  const q = async (sql, args = []) => {
    log.push([sql, args]);
    if (/^UPDATE event_application_updates u SET mail_state='processing'/.test(sql)) {
      const row = rows.find(r => ['queued', 'retry', 'processing'].includes(r.mail_state) && r.mail_next_attempt_at <= clock());
      if (!row) return { rows: [] };
      row.mail_state = 'processing'; row.mail_attempts += 1;
      return { rows: [{ ...row }] };
    }
    const row = rows.find(r => r.id === args[0]);
    if (/mail_state='sent'/.test(sql)) Object.assign(row, { mail_state: 'sent', mail_provider_id: args[1], mail_error: null });
    else if (/mail_state='failed'/.test(sql)) Object.assign(row, { mail_state: 'failed', mail_error: args[1] });
    else if (/mail_state='retry'/.test(sql)) Object.assign(row, { mail_state: 'retry', mail_error: args[1], mail_next_attempt_at: Date.parse(args[2]) });
    return { rows: [] };
  };
  return { q, log };
}

test('worker sends due notifications with an idempotency key and records the provider id', async () => {
  const rows = [{ id: 'eau_1', application, kind: 'submitted', message: '', mail_state: 'queued', mail_attempts: 0, mail_resends: 0, mail_next_attempt_at: 0 }];
  const { q } = fakeQueue(rows);
  const sent = [];
  const send = async msg => { sent.push(msg); return { id: 'resend_1' }; };
  assert.equal(await mail.deliverApplicationMailOnce(q, send, { origin: 'https://www.emoji.tw', replyTo: 'us@emoji.tw' }), true);
  assert.equal(await mail.deliverApplicationMailOnce(q, send, {}), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'applicant@example.test');
  assert.equal(sent[0].replyTo, 'us@emoji.tw');
  assert.equal(sent[0].idempotencyKey, 'application-update/eau_1');
  assert.equal(rows[0].mail_state, 'sent');
  assert.equal(rows[0].mail_provider_id, 'resend_1');
});

test('worker leaves the queue untouched without a mail provider and retries provider failures with backoff', async () => {
  const rows = [{ id: 'eau_2', application, kind: 'update', message: '補件', mail_state: 'queued', mail_attempts: 0, mail_resends: 2, mail_next_attempt_at: 0 }];
  let now = 1_000_000;
  const { q, log } = fakeQueue(rows, () => now);
  assert.equal(await mail.deliverApplicationMailOnce(q, null, {}), false);
  assert.equal(log.length, 0);
  const failing = async () => { throw new Error('Resend 500: boom'); };
  assert.equal(await mail.deliverApplicationMailOnce(q, failing, { now: () => now }), true);
  assert.equal(rows[0].mail_state, 'retry');
  assert.equal(rows[0].mail_error, 'Resend 500: boom');
  assert.equal(rows[0].mail_next_attempt_at, now + 60e3);
  assert.equal(await mail.deliverApplicationMailOnce(q, failing, { now: () => now }), false, 'not due until the backoff passes');
  now += 60e3;
  assert.equal(await mail.deliverApplicationMailOnce(q, failing, { now: () => now }), true);
  assert.equal(rows[0].mail_next_attempt_at, now + 300e3);
  const skipped = async () => ({ skipped: 'no-recipient' });
  rows[0].mail_next_attempt_at = 0;
  assert.equal(await mail.deliverApplicationMailOnce(q, skipped, { now: () => now }), true);
  assert.match(rows[0].mail_error, /no-recipient/);
  // Exhausted attempts stop retrying and are surfaced for a manual resend.
  rows[0].mail_attempts = mail.MAX_ATTEMPTS - 1; rows[0].mail_next_attempt_at = 0;
  assert.equal(await mail.deliverApplicationMailOnce(q, failing, { now: () => now }), true);
  assert.equal(rows[0].mail_state, 'failed');
  // A manual resend uses a fresh idempotency key so the provider does not deduplicate it.
  rows[0].mail_state = 'queued'; rows[0].mail_attempts = 0; rows[0].mail_next_attempt_at = 0;
  const sent = [];
  await mail.deliverApplicationMailOnce(q, async m => { sent.push(m); return { id: 'x' }; }, {});
  assert.equal(sent[0].idempotencyKey, 'application-update/eau_2/r2');
});

test('public view hides provider details from applicants but keeps them for admins', () => {
  const row = { id: 'eau_3', kind: 'approved', message: 'ok', actor: 'u_1', created_at: 'now', mail_state: 'processing', mail_sent_at: null, mail_attempts: 2, mail_error: 'boom', mail_provider_id: 'p' };
  assert.deepEqual(mail.publicUpdate(row), { id: 'eau_3', kind: 'approved', message: 'ok', created_at: 'now', mail_state: 'queued', mail_sent_at: null });
  const admin = mail.publicUpdate(row, { admin: true });
  assert.equal(admin.mail_error, 'boom');
  assert.equal(admin.actor, 'u_1');
  assert.equal(admin.mail_provider_id, undefined);
});
