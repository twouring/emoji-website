import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { deliverApplicationMailOnce, MAX_ATTEMPTS } = require('../lib/event-application-mail');
const application = { id: 'a', kind: 'business', venue: '2F', title: '測試', contact_name: '測試', contact_email: 'a@example.test' };

for (const outcome of ['success', 'failure']) test(`stale ${outcome} cannot overwrite a newer claim or manual resend`, async () => {
  for (const manual of [false, true]) {
    const current = { id: 'u', application, kind: 'update', message: '內容', mail_state: 'processing', mail_attempts: 1, mail_resends: 0 };
    let claimed = false;
    const q = async (sql, args = []) => {
      if (!claimed) { claimed = true; return { rows: [{ ...current }] }; }
      const fenced = /mail_state='processing'/.test(sql) && /AND mail_attempts=\$4 AND mail_resends=\$5/.test(sql);
      if (!fenced || (current.mail_state === 'processing' && args[3] === current.mail_attempts && args[4] === current.mail_resends)) current.mail_state = /SET mail_state='sent'/.test(sql) ? 'sent' : 'retry';
      return { rows: [] };
    };
    await deliverApplicationMailOnce(q, async () => {
      if (manual) { current.mail_resends++; current.mail_attempts = 1; }
      else current.mail_attempts++;
      if (outcome === 'failure') throw new Error('network');
      return { id: 'provider' };
    });
    assert.equal(current.mail_state, 'processing');
  }
});

test('expired final processing lease does not send an eleventh time', async () => {
  let sends = 0, state;
  const q = async (sql) => {
    if (!state) { state = 'processing'; return { rows: [{ id: 'u', application, kind: 'update', mail_attempts: MAX_ATTEMPTS + 1, mail_resends: 0 }] }; }
    state = /SET mail_state='failed'/.test(sql) ? 'failed' : 'sent';
    return { rows: [] };
  };
  await deliverApplicationMailOnce(q, async () => { sends++; return { id: 'x' }; });
  assert.equal(sends, 0);
  assert.equal(state, 'failed');
});

test('provider response bodies containing personal data are not stored as mail_error', async () => {
  let claimed = false, stored;
  const q = async (sql, args = []) => {
    if (!claimed) { claimed = true; return { rows: [{ id: 'u', application, kind: 'update', mail_attempts: 1, mail_resends: 0 }] }; }
    stored = args[1]; return { rows: [] };
  };
  await deliverApplicationMailOnce(q, async () => { throw new Error('Resend 422: a@example.test Bearer secret-payload'); });
  assert.equal(stored, 'Resend 422');
});

test('PostgreSQL locks and fenced completions deduplicate concurrent workers without sending real email', {
  skip: !process.env.EVENT_APPLICATION_TEST_DATABASE_URL,
}, async () => {
  const { Pool } = require('pg');
  const url = new URL(process.env.EVENT_APPLICATION_TEST_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /_test/);
  assert.equal(url.search, '', 'Query overrides are not allowed on the isolated test database');
  url.username ||= 'postgres';
  url.password ||= 'local-test-password';
  const control = new Pool({ connectionString: url.href, ssl: false });
  const schema = 'test_application_mail_' + require('node:crypto').randomBytes(8).toString('hex');
  let pool;
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({ connectionString: url.href, ssl: false, max: 8 });
    const q = (sql, args) => pool.query(sql, args);
    await q(`CREATE TABLE event_applications (id text PRIMARY KEY, kind text, venue text, title text, contact_name text, contact_email text);
      CREATE TABLE event_application_updates (id text PRIMARY KEY, application_id text REFERENCES event_applications(id), kind text, message text DEFAULT '',
      mail_state text DEFAULT 'queued', mail_attempts int DEFAULT 0, mail_resends int DEFAULT 0, mail_next_attempt_at timestamptz DEFAULT now(),
      mail_sent_at timestamptz, mail_provider_id text, mail_error text)`);
    await q('INSERT INTO event_applications VALUES ($1,$2,$3,$4,$5,$6)', Object.values(application));
    const enqueue = async () => { await q('TRUNCATE event_application_updates'); await q("INSERT INTO event_application_updates (id,application_id,kind) VALUES ('u','a','update')"); };
    const current = async () => (await q("SELECT * FROM event_application_updates WHERE id='u'")).rows[0];
    await enqueue();
    const sent = [];
    await Promise.all(Array.from({ length: 8 }, () => deliverApplicationMailOnce(q, async msg => { sent.push(msg); return { id: 'accepted' }; })));
    assert.equal(sent.length, 1);
    assert.equal((await current()).mail_state, 'sent');
    // Provider accepted but recording success failed: retry must reuse the exact key.
    await enqueue();
    let failRecord = true;
    const flaky = async (sql, args) => {
      if (failRecord && /SET mail_state='sent'/.test(sql)) { failRecord = false; throw new Error('database unavailable'); }
      return q(sql, args);
    };
    const keys = [];
    const send = async msg => { keys.push(msg.idempotencyKey); return { id: 'same-provider-id' }; };
    await deliverApplicationMailOnce(flaky, send);
    assert.equal((await current()).mail_state, 'retry');
    await q("UPDATE event_application_updates SET mail_next_attempt_at=now()-interval '1 second'");
    await deliverApplicationMailOnce(q, send);
    assert.deepEqual(keys, ['application-update/u', 'application-update/u']);
    // A late success and a late failure must both leave a reclaimed, successful lease untouched.
    for (const failure of [false, true]) {
      await enqueue();
      await deliverApplicationMailOnce(q, async () => {
        await q("UPDATE event_application_updates SET mail_next_attempt_at=now()-interval '1 second'");
        await deliverApplicationMailOnce(q, async () => ({ id: 'new-worker' }));
        if (failure) throw new Error('late failure');
        return { id: 'stale-worker' };
      });
      assert.equal((await current()).mail_state, 'sent');
      assert.equal((await current()).mail_provider_id, 'new-worker');
    }
    await enqueue();
    await q("UPDATE event_application_updates SET mail_state='processing',mail_attempts=$1,mail_next_attempt_at=now()-interval '1 second'", [MAX_ATTEMPTS]);
    let exhaustedSends = 0;
    await deliverApplicationMailOnce(q, async () => { exhaustedSends++; return { id: 'unexpected' }; });
    assert.equal(exhaustedSends, 0);
    assert.equal((await current()).mail_state, 'failed');
  } finally {
    if (pool) await pool.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  }
});
