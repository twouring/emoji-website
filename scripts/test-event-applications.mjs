import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { normalizeEventApplication } = require('../lib/event-applications.js');
const { Pool } = require('pg');
const valid = {
  community_name: '測試社群', contact_name: '測試聯絡人', contact_email: 'organizer@example.test',
  contact_phone: '', title: '測試工作坊', description: '只供本機測試的活動內容',
  starts_at: '2099-06-20T19:00', ends_at: '2099-06-20T21:00', attendees: '20',
  requirements: '投影設備', consent: true,
};

test('application normalizes text, attendees and Taiwan local time', () => {
  const { value, error } = normalizeEventApplication({ ...valid, community_name: ' 測試社群 ' });
  assert.equal(error, undefined);
  assert.equal(value.community_name, '測試社群');
  assert.equal(value.attendees, 20);
  assert.equal(value.starts_at, '2099-06-20T11:00:00.000Z');
  assert.equal(value.ends_at, '2099-06-20T13:00:00.000Z');
});

test('application rejects missing, oversized and malformed contact/content fields', () => {
  for (const body of [null, [], 'text', {},
    ...['community_name', 'contact_name', 'contact_email', 'title', 'description'].map(key => ({ ...valid, [key]: ' ' })),
    ...Object.entries({ community_name: 121, contact_name: 81, contact_email: 255, contact_phone: 41,
      title: 161, description: 5001, requirements: 2001 }).map(([key, size]) => ({ ...valid, [key]: 'x'.repeat(size) })),
    { ...valid, contact_email: 'bad@address' }, { ...valid, requirements: {} },
    { ...valid, description: 'paste\0content' },
  ]) assert.ok(normalizeEventApplication(body).error, JSON.stringify(body).slice(0, 150));
});

test('application rejects impossible dates, reversed ranges and implicit timezones', () => {
  for (const starts_at of ['2099-02-29T10:00', '2099-04-31T10:00', '2099-06-20T24:00',
    '2099-13-01T10:00', '2099-06-20', '2099-06-20T10:00Z', '2099-06-20T10:00+08:00']) {
    assert.ok(normalizeEventApplication({ ...valid, starts_at }).error, starts_at);
  }
  for (const ends_at of [valid.starts_at, '2099-06-20T18:00', '2099-06-31T21:00']) {
    assert.ok(normalizeEventApplication({ ...valid, ends_at }).error, ends_at);
  }
  assert.ok(normalizeEventApplication({ ...valid, starts_at: '2096-02-29T10:00' }).value);
});

test('application kind defaults to community on 3F; business hire must pick 2F or 3F', () => {
  assert.deepEqual([normalizeEventApplication(valid).value.kind, normalizeEventApplication(valid).value.venue], ['community', '3F']);
  assert.equal(normalizeEventApplication({ ...valid, kind: 'community', venue: '2F' }).value.venue, '3F');
  assert.ok(normalizeEventApplication({ ...valid, kind: 'business' }).error);
  assert.ok(normalizeEventApplication({ ...valid, kind: 'business', venue: '4F' }).error);
  assert.ok(normalizeEventApplication({ ...valid, kind: 'vip' }).error);
  for (const venue of ['2F', '3F']) assert.equal(normalizeEventApplication({ ...valid, kind: 'business', venue }).value.venue, venue);
});

test('application requires explicit consent and bounded integer attendance', () => {
  for (const attendees of [0, -1, 1.5, 10001, '', '1e2', true, [], null])
    assert.ok(normalizeEventApplication({ ...valid, attendees }).error, String(attendees));
  for (const consent of [false, undefined, 'true', 1])
    assert.ok(normalizeEventApplication({ ...valid, consent }).error, String(consent));
  for (const attendees of [1, 10000]) assert.ok(normalizeEventApplication({ ...valid, attendees }).value);
});

test('unified applications validate visibility and external links', () => {
  for(const registration_url of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com',{}])
    assert.ok(normalizeEventApplication({...valid,visibility:'public',registration_mode:'external',registration_url}).error);
  assert.ok(normalizeEventApplication({...valid,visibility:'secret'}).error);
  assert.ok(normalizeEventApplication({...valid,visibility:'public',registration_mode:'closed'}).error);
  assert.equal(normalizeEventApplication({...valid,visibility:'private',registration_mode:'external',registration_url:'https://example.com'}).value.registration_mode,'closed');
});

const databaseUrl = process.env.EVENT_APPLICATION_TEST_DATABASE_URL;

test('application API persists private submissions and serializes retry/review races in PostgreSQL', {
  skip: !databaseUrl && 'Set EVENT_APPLICATION_TEST_DATABASE_URL to an isolated local PostgreSQL database.',
  timeout: 45000,
}, async t => {
  const db = new URL(databaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(db.protocol), 'PostgreSQL URL required');
  assert.ok(['127.0.0.1', 'localhost', '[::1]', '::1'].includes(db.hostname), 'Only loopback PostgreSQL is allowed');
  assert.equal(db.search, '', 'Supply a plain URL without query overrides; the test sets its own search_path');
  // Explicit credentials prevent pg from falling back to inherited PGUSER/PGPASSWORD or .pgpass.
  db.username ||= 'postgres';
  db.password ||= 'local-test-password';
  db.pathname = db.pathname && db.pathname !== '/' ? db.pathname : '/postgres';
  db.port ||= '5432';
  const schema = 'test_event_applications_' + randomBytes(8).toString('hex');
  db.searchParams.set('options', '-c search_path=pg_catalog');
  const control = new Pool({ connectionString: db.href, ssl: false, max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  let schemaCreated = false, pool, child, logs = '', childError;
  const secret = randomBytes(32).toString('hex'), adminKey = randomBytes(32).toString('hex');
  const users = ['application_member_a', 'application_member_b'];
  const token = sub => {
    const iat = Date.now();
    const body = Buffer.from(JSON.stringify({ sub, role: 'invited', purpose: 'session', iat, exp: iat + 600000 })).toString('base64url');
    return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
  };
  const stopServer = async () => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  };
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    db.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({ connectionString: db.href, ssl: false, max: 2,
      connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const listener = createServer();
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      // No inherited .env, NODE_OPTIONS, database, Google, payment, AI, IG or storage credentials.
      env: { NODE_ENV: 'test', PORT: String(port), DATABASE_URL: db.href, APP_SECRET: secret,
        ADMIN_API_KEY: adminKey, SUPER_ADMIN_EMAIL: 'admin@example.test', IG_AUTOPUBLISH: '0',
        PUBLIC_ORIGIN: origin, WEB_ORIGINS: origin, TRUST_PROXY_HOPS: '0', TZ: 'Asia/Taipei' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.on('error', error => { childError = error; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.equal(childError, undefined, String(childError));
      assert.equal(child.exitCode, null, logs);
      try {
        const response = await fetch(origin + '/api/events', { signal: AbortSignal.timeout(1000) });
        await response.text();
        if (response.ok) { ready = true; break; }
      } catch { /* Server has not bound its port yet. */ }
      await delay(100);
    }
    assert.ok(ready, 'Server did not become ready:\n' + logs);
    await pool.query(`INSERT INTO users (id,name,email,status) VALUES ($1,'Member A','a@example.test','invited'),($2,'Member B','b@example.test','invited')`, users);
    const [memberA, memberB] = users.map(token);
    const api = async (path, auth, body) => {
      const response = await fetch(origin + path, {
        method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const publicContexts=[['/api/events', undefined], ['/api/state', memberA], ['/api/state', memberB], ['/api/state', adminKey]];
    const baselineEvents=await Promise.all(publicContexts.map(async([path,auth])=>(await api(path,auth)).body.events));
    const baselineEventCount=(await pool.query('SELECT COUNT(*)::int AS n FROM events')).rows[0].n;
    const submit = (auth, body) => api('/api/event-applications', auth, body);
    const input = { ...valid, request_id: randomUUID() };
    let applicationId, reviewResult, publishedEvent;

    await t.test('authentication and invalid input cannot write applications', async () => {
      assert.equal((await submit(null, input)).status, 401);
      assert.equal((await api('/api/me/event-applications')).status, 401);
      assert.equal((await api('/api/admin/event-applications', memberA)).status, 403);
      assert.equal((await submit(adminKey, input)).status, 403);
      assert.equal((await api('/api/me/event-applications', adminKey)).status, 403);
      for (const patch of [{ request_id: 'bad' }, { starts_at: '2099-02-30T19:00' },
        { starts_at: '2000-01-01T19:00', ends_at: '2000-01-01T21:00' }, { consent: false }, { description: 'paste\0content' }])
        assert.equal((await submit(memberA, { ...input, ...patch })).status, 400);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM event_applications')).rows[0].n, 0);
    });

    await t.test('concurrent identical retries create one row; changed payload conflicts', async () => {
      const results = await Promise.all([submit(memberA, input), submit(memberA, input)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
      applicationId = results[0].body.application.id;
      assert.equal(results[1].body.application.id, applicationId);
      const retried = await submit(memberA, input);
      assert.equal(retried.status, 200);
      assert.equal(retried.body.application.id, applicationId);
      assert.equal(retried.body.application.status, 'pending');
      assert.equal(retried.body.application.starts_at, '2099-06-20T11:00:00.000Z');
      assert.equal((await submit(memberA, { ...input, title: 'Changed payload' })).status, 409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM event_applications')).rows[0].n, 1);
      // The same request UUID belongs independently to each member.
      assert.equal((await submit(memberB, { ...input, title: 'Member B workshop' })).status, 201);
    });

    await t.test('a submission is a hidden draft event the applicant owns but cannot publish, re-time or delete', async () => {
      const event=(await pool.query('SELECT * FROM events WHERE id=$1',[`e_${applicationId}`])).rows[0];
      assert.deepEqual([event.status,event.review_status,event.owner_id],['草稿','pending',users[0]]);
      assert.equal((await pool.query('SELECT event_id FROM event_applications WHERE id=$1',[applicationId])).rows[0].event_id,event.id);
      assert.ok(!(await api('/api/events')).body.events.some(item=>item.id===event.id));
      assert.equal((await api('/api/events/'+event.slug)).status,404);
      const state=await api('/api/organizer/state',memberA);
      assert.equal(state.status,200);
      assert.deepEqual(state.body.events.map(item=>[item.id,item.review_status]),[[event.id,'pending']]);
      assert.deepEqual(state.body.applications.map(item=>item.id),[applicationId]);
      const mine=state.body.events[0],edit={id:event.id,title:mine.title+'（補充）',description:mine.description,location:mine.location,starts_at:mine.starts_at_iso,ends_at:mine.ends_at_iso,capacity:mine.capacity,price_twd:0,visibility:'public',status:'草稿'};
      assert.equal((await api('/api/admin/events',memberA,edit)).status,200,'content can be prepared while pending');
      assert.equal((await api('/api/admin/events',memberA,{...edit,status:'報名中'})).status,409);
      assert.equal((await api('/api/admin/events',memberA,{...edit,starts_at:'2099-06-21T19:00',ends_at:'2099-06-21T21:00'})).status,409);
      assert.equal((await api('/api/admin/events',memberB,edit)).status,404);
      const removed=await fetch(origin+'/api/admin/events/'+event.id,{method:'DELETE',headers:{Authorization:'Bearer '+memberA}});
      assert.equal(removed.status,409);
      assert.equal((await pool.query("SELECT status FROM events WHERE id=$1",[event.id])).rows[0].status,'草稿');
    });

    await t.test('only the owner sees their submission; administrators see both', async () => {
      for (const [auth, user] of [[memberA, users[0]], [memberB, users[1]]]) {
        const list = await api('/api/me/event-applications?user_id=' + users[0], auth);
        assert.equal(list.status, 200);
        assert.equal(list.body.applications.length, 1);
        assert.equal(list.body.applications[0].user_id, user);
        assert.equal(list.body.applications[0].request_hash, undefined);
      }
      const admin = await api('/api/admin/event-applications', adminKey);
      assert.equal(admin.status, 200);
      assert.equal(admin.body.applications.length, 2);
    });

    await t.test('reviews require admin access and one concurrent decision wins', async () => {
      const path = `/api/admin/event-applications/${applicationId}/review`;
      const review = { status: 'approved', expected_status: 'pending', review_note: '測試審核回覆，請聯絡確認。' };
      assert.equal((await api(path, memberB, review)).status, 403);
      assert.equal((await api(path, adminKey, { ...review, review_note: '' })).status, 400);
      assert.equal((await api('/api/admin/event-applications/missing/review', adminKey, review)).status, 404);
      const results = await Promise.all([api(path, adminKey, review), api(path, adminKey, { ...review, status: 'rejected' })]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      reviewResult = results.find(result => result.status === 200).body.application;
      assert.ok(reviewResult.reviewed_at);
      const own = await api('/api/me/event-applications', memberA);
      assert.equal(own.body.applications[0].review_note, review.review_note);
      assert.equal(own.body.applications[0].status, reviewResult.status);
      const other = await api('/api/me/event-applications', memberB);
      assert.equal(other.body.applications[0].review_note, '');
      assert.ok(!JSON.stringify(other.body).includes(review.review_note));
    });

    await t.test('every stage queues an applicant notification; progress updates and resends are admin-only', async () => {
      // Submission and review each wrote a queued notification in the same transaction as the state change.
      const queued = (await pool.query('SELECT kind,message,mail_state,mail_attempts FROM event_application_updates WHERE application_id=$1 ORDER BY created_at', [applicationId])).rows;
      assert.deepEqual(queued.map(u => [u.kind, u.mail_state, u.mail_attempts]), [['submitted', 'queued', 0], [reviewResult.status, 'queued', 0]]);
      assert.equal(queued[1].message, reviewResult.review_note);
      assert.deepEqual(reviewResult.updates.map(u => u.kind), ['submitted', reviewResult.status]);
      const own = (await api('/api/me/event-applications', memberA)).body.applications[0];
      assert.deepEqual(own.updates.map(u => u.kind), ['submitted', reviewResult.status]);
      assert.ok(own.updates.every(u => u.mail_state === 'queued' && !('mail_error' in u) && !('actor' in u)));
      const admin = (await api('/api/admin/event-applications', adminKey)).body.applications.find(a => a.id === applicationId);
      assert.equal(admin.updates[1].actor, 'admin-api-key');
      assert.equal(admin.updates[1].mail_state, 'queued');

      const path = `/api/admin/event-applications/${applicationId}/updates`;
      assert.equal((await api(path, memberA, { message: '偷看' })).status, 403);
      assert.equal((await api(path, adminKey, { message: ' ' })).status, 400);
      assert.equal((await api(path, adminKey, { message: 'x'.repeat(2001) })).status, 400);
      assert.equal((await api('/api/admin/event-applications/missing/updates', adminKey, { message: '嗨' })).status, 404);
      const update = await api(path, adminKey, { message: '檔期已確認，請於下週前匯訂金。' });
      assert.equal(update.status, 201);
      assert.equal(update.body.update.kind, 'update');
      assert.equal(update.body.update.mail_state, 'queued');
      assert.deepEqual(update.body.application.updates.map(u => u.kind), ['submitted', reviewResult.status, 'update']);
      const seen = (await api('/api/me/event-applications', memberA)).body.applications[0].updates.at(-1);
      assert.equal(seen.message, '檔期已確認，請於下週前匯訂金。');
      assert.ok(!JSON.stringify((await api('/api/me/event-applications', memberB)).body).includes('匯訂金'));

      // Only notifications the worker already finished (or gave up on) can be resent; a queued one cannot be duplicated.
      const resend = `${path}/${update.body.update.id}/resend`;
      assert.equal((await api(resend, memberA, {})).status, 403);
      assert.equal((await api(resend, adminKey, {})).status, 404);
      await pool.query(`UPDATE event_application_updates SET mail_state='failed',mail_attempts=10,mail_error='Resend 500' WHERE id=$1`, [update.body.update.id]);
      const requeued = await api(resend, adminKey, {});
      assert.equal(requeued.status, 200);
      assert.equal(requeued.body.update.mail_state, 'queued');
      assert.equal(requeued.body.update.mail_attempts, 0);
      assert.equal((await pool.query('SELECT mail_resends FROM event_application_updates WHERE id=$1', [update.body.update.id])).rows[0].mail_resends, 1);
      assert.equal((await api(`${path}/${update.body.update.id}/resend`, adminKey, {})).status, 404, 'a queued notification is not resent twice');
    });

    await t.test('an approved public application creates one public preview in the same request', async () => {
      const second=(await pool.query('SELECT id FROM event_applications WHERE user_id=$1',[users[1]])).rows[0];
      const reviewed=await api(`/api/admin/event-applications/${second.id}/review`,adminKey,{status:'approved',expected_status:'pending',review_note:'通過，後續另行確認場地。',publish_public:true});
      assert.equal(reviewed.status,200);
      assert.equal(reviewed.body.event.id,`e_${second.id}`);
      publishedEvent=reviewed.body.event;
      const event=(await pool.query('SELECT * FROM events WHERE id=$1',[publishedEvent.id])).rows[0];
      assert.equal(event.visibility,'public');
      assert.equal(event.status,'預告');
      assert.equal(event.price_twd,0);
      assert.equal(event.owner_id,users[1]);
      // 申請人（無活動主旗標）能以主辦團隊身分進活動主入口管理這場活動
      const organizerState=await api('/api/organizer/state',memberB);
      assert.equal(organizerState.status,200);assert.equal(organizerState.body.role,'organizer');assert.equal(organizerState.body.can_create_events,false);
      assert.deepEqual(organizerState.body.events.map(item=>item.id),[publishedEvent.id]);
      // 另一位申請人只看得到自己的活動；未公開的那場不出現在公開清單
      assert.deepEqual((await api('/api/organizer/state',memberA)).body.events.map(item=>item.id),[`e_${applicationId}`]);
      const decided=(await pool.query('SELECT status,review_status FROM events WHERE id=$1',[`e_${applicationId}`])).rows[0];
      assert.deepEqual([decided.status,decided.review_status],['草稿',reviewResult.status]);
      assert.ok((await api('/api/events')).body.events.some(item=>item.id===publishedEvent.id));
      const update=(await pool.query("SELECT message FROM event_application_updates WHERE application_id=$1 AND kind='approved'",[second.id])).rows[0];
      assert.ok(update.message.includes(`/events/${publishedEvent.slug}`));
    });

    await t.test('private applications and review replies never leak into public or member state', async () => {
      for (const [index,[path,auth]] of publicContexts.entries()) {
        const result = await api(path, auth);
        assert.equal(result.status, 200);
        const listsPreviews=path==='/api/events'||auth===adminKey;
        // 後台看得到兩場（含未公開草稿）；公開清單只有已發布的那一場；會員狀態都看不到
        assert.equal(result.body.events.length, baselineEvents[index].length+(auth===adminKey?2:listsPreviews?1:0));
        assert.equal(result.body.events.some(event=>event.id===publishedEvent.id),listsPreviews);
        if(auth!==adminKey)assert.ok(!JSON.stringify(result.body).includes(applicationId));
        assert.ok(!JSON.stringify(result.body).includes(reviewResult.review_note));
      }
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM events')).rows[0].n, baselineEventCount+2);
    });

    await t.test('unified approval supports native, external and private events without duplicate schedule or private leaks', async () => {
      for(const mode of ['native','external','closed']){
        const created=await api('/api/event-applications',memberA,{...valid,request_id:randomUUID(),visibility:mode==='closed'?'private':'public',registration_mode:mode,registration_url:'https://example.com/register'});
        assert.equal(created.status,201,JSON.stringify(created.body));
        const appId=created.body.application.id;
        const reviewed=await api(`/api/admin/event-applications/${appId}/review`,adminKey,{status:'approved',expected_status:'pending',review_note:'本機測試通過'});
        assert.equal(reviewed.status,200,JSON.stringify(reviewed.body));
        const event=reviewed.body.event;
        assert.equal(reviewed.body.application.event_id,event.id);
        assert.equal((await api(`/api/admin/event-applications/${appId}/review`,adminKey,{status:'approved',expected_status:'pending',review_note:'重複'})).status,409);
        const listed=(await api('/api/events')).body.events.find(e=>e.id===event.id);
        assert.ok(listed);
        assert.equal(listed.registration_mode,mode);
        if(mode==='native'){
          assert.equal(listed.status,'報名中');
          const registered=await api(`/api/events/${event.id}/register`,memberB,{});
          assert.equal(registered.status,200,JSON.stringify(registered.body));
        }else{
          assert.equal((await api(`/api/events/${event.id}/register`,memberB,{})).status,403);
          // Even changing lifecycle status cannot accidentally enable private/external registration.
          await pool.query("UPDATE events SET status='報名中' WHERE id=$1",[event.id]);
          assert.equal((await api(`/api/events/${event.id}/register`,null,{})).status,403);
        }
        if(mode==='external')assert.equal(listed.registration_url,'https://example.com/register');
        if(mode==='closed'){
          assert.equal(listed.title,'私人活動');
          assert.equal(listed.description,undefined);
          assert.equal(listed.organizer_name,undefined);
          const detail=await api('/api/events/'+event.slug);
          assert.equal(detail.body.event.description,undefined);
          for(const path of ['/events/'+event.slug,'/api/events/'+event.slug+'/calendar.ics']){
            const body=await (await fetch(origin+path)).text();
            assert.ok(!body.includes(valid.title),path);
            assert.ok(!body.includes(valid.description),path);
          }
        }
        await pool.query("UPDATE events SET starts_at=now()+interval '2 days',ends_at=now()+interval '2 days 2 hours' WHERE id=$1",[event.id]);
        const schedule=(await api('/api/venue/schedule')).body;
        assert.equal(schedule.events.filter(e=>e.slug===event.slug).length,1);
        await pool.query("UPDATE events SET status='已取消' WHERE id=$1",[event.id]);
        assert.ok(!(await api('/api/venue/schedule')).body.events.some(e=>e.slug===event.slug));
        // Keep the original persistence assertions focused on the original two requests.
        await pool.query('DELETE FROM event_applications WHERE id=$1',[appId]);
      }
    });

    await t.test('an organizer duplicate is a new pending application; an admin duplicate is not', async () => {
      const copy=await api(`/api/admin/events/${publishedEvent.id}/duplicate`,memberB,{});
      assert.equal(copy.status,200,JSON.stringify(copy.body));
      const row=(await pool.query('SELECT e.status,e.review_status,a.status AS app_status,a.user_id FROM events e JOIN event_applications a ON a.event_id=e.id WHERE e.id=$1',[copy.body.id])).rows[0];
      assert.deepEqual([row.status,row.review_status,row.app_status,row.user_id],['草稿','pending','pending',users[1]]);
      const adminCopy=await api(`/api/admin/events/${publishedEvent.id}/duplicate`,adminKey,{});
      assert.equal((await pool.query('SELECT review_status FROM events WHERE id=$1',[adminCopy.body.id])).rows[0].review_status,null);
      await pool.query('DELETE FROM event_applications WHERE event_id=$1',[copy.body.id]);
    });

    await t.test('stored submissions and consent survive server shutdown', async () => {
      await stopServer();
      const rows = (await pool.query('SELECT * FROM event_applications ORDER BY user_id')).rows;
      assert.equal(rows.length, 2);
      assert.equal(rows[0].id, applicationId);
      assert.equal(rows[0].review_note, reviewResult.review_note);
      assert.equal(rows[0].status, reviewResult.status);
      assert.ok(rows.every(row => row.consent_at instanceof Date));
    });
  } finally {
    await stopServer();
    try { if (pool) await pool.end(); }
    finally {
      try { if (schemaCreated) await control.query(`DROP SCHEMA ${schema} CASCADE`); }
      finally { await control.end(); }
    }
  }
});
