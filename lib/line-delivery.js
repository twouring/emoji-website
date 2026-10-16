'use strict';
const line = require('./line');
// No message bodies, names, emails, tokens or API responses are persisted in this outbox.
const SCHEMA = `CREATE TABLE IF NOT EXISTS line_deliveries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('ticket','review')), source_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, retry_key UUID NOT NULL DEFAULT gen_random_uuid(),
  state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(), first_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
const TICKETS = `INSERT INTO line_deliveries(id,kind,source_id,version)
 SELECT 'ticket:'||COALESCE(a.id,r.id)||':'||r.ticket_version,'ticket',COALESCE(a.id,r.id),r.ticket_version
 FROM event_regs r JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id
 LEFT JOIN event_attendees a ON a.registration_id=r.id LEFT JOIN event_ticket_orders o ON o.id=a.order_id
 WHERE r.status='registered' AND e.status NOT IN ('已取消','草稿') AND u.line_user_id IS NOT NULL
 AND COALESCE(e.event_details->>'mode','offline')<>'online'
 AND COALESCE(e.ends_at,e.starts_at,now()+interval '1 day')>now()
 AND (a.order_id IS NULL OR o.status='registered') AND (a.id IS NOT NULL OR r.quantity=1)
 AND ($1::text IS NULL OR r.user_id=$1) AND ($2::text IS NULL OR r.event_id=$2)
 ON CONFLICT DO NOTHING`;
// Completion (done), not a booking date, is evidence of a real visit. One invitation per member / Taipei day.
const REVIEWS = `INSERT INTO line_deliveries(id,kind,source_id)
 SELECT DISTINCT ON (o.user_id,(COALESCE(o.done_at,o.paid_at) AT TIME ZONE 'Asia/Taipei')::date)
 'review:'||o.user_id||':'||(COALESCE(o.done_at,o.paid_at) AT TIME ZONE 'Asia/Taipei')::date,'review',o.id
 FROM table_orders o JOIN users u ON u.id=o.user_id
 WHERE o.status='done' AND COALESCE(o.done_at,o.paid_at)<=now()-interval '24 hours' AND COALESCE(o.done_at,o.paid_at)>now()-interval '72 hours'
 AND o.amount>0 AND u.line_user_id IS NOT NULL
 ORDER BY o.user_id,(COALESCE(o.done_at,o.paid_at) AT TIME ZONE 'Asia/Taipei')::date,COALESCE(o.done_at,o.paid_at) DESC,o.id
 ON CONFLICT DO NOTHING`;
// A single atomic statement claims one job, across processes. Never hold a DB transaction during HTTP.
const CLAIM = `WITH picked AS (SELECT id FROM line_deliveries WHERE state='pending' AND available_at<=now()
 AND attempts<12 AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours')
 ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE line_deliveries d SET available_at=now()+interval '2 minutes',attempts=attempts+1,
 first_attempt_at=COALESCE(first_attempt_at,now()) FROM picked WHERE d.id=picked.id RETURNING d.*`;
function createLineDelivery({ q, origin, buildTicket, fetcher = fetch, env = () => process.env, log = console }) {
  async function enqueueTickets(userId = null, eventId = null) {
    if (!line.config(env())) return;
    await q(TICKETS, [userId,eventId]);
  }
  async function deliver(job) {
    const c = line.config(env()); if (!c) return 'paused';
    let recipient, message;
    if (job.kind === 'ticket') {
      const row = (await q(`SELECT u.line_user_id,r.language,r.ticket_version FROM event_regs r
        JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id
        LEFT JOIN event_attendees a ON a.registration_id=r.id LEFT JOIN event_ticket_orders o ON o.id=a.order_id
        WHERE (a.id=$1 OR (a.id IS NULL AND r.id=$1 AND r.quantity=1)) AND r.status='registered'
        AND e.status NOT IN ('已取消','草稿') AND COALESCE(e.event_details->>'mode','offline')<>'online'
        AND COALESCE(e.ends_at,e.starts_at,now()+interval '1 day')>now()
        AND (a.order_id IS NULL OR o.status='registered') AND r.ticket_version=$2 LIMIT 1`, [job.source_id,job.version])).rows[0];
      if (!row?.line_user_id) return 'skipped';
      const data = await buildTicket(job.source_id, row.language);
      if (!data || !data.ticket?.token) return 'paused';
      recipient = row.line_user_id;
      message = line.ticketCard({ ...data.event, ticket_name:data.ticket.ticket_name,
        qrUrl: origin() + '/api/line/qr/' + encodeURIComponent(data.ticket.token) + '.png',
        url: origin() + '/events/' + encodeURIComponent(data.event.slug || data.event.id) }, row.language);
    } else {
      const url = String(env().LINE_REVIEW_URL || '').trim();
      if (!url) return 'paused';
      message = line.reviewCard(url);
      const row = (await q(`SELECT u.line_user_id FROM table_orders o JOIN users u ON u.id=o.user_id
        WHERE o.id=$1 AND o.status='done' AND o.amount>0 AND COALESCE(o.done_at,o.paid_at)<=now()-interval '24 hours'
        AND COALESCE(o.done_at,o.paid_at)>now()-interval '72 hours'`, [job.source_id])).rows[0];
      if (!row?.line_user_id) return 'skipped';
      recipient = row.line_user_id;
    }
    await line.push(c, recipient, message, { fetcher, retryKey:job.retry_key });
    return 'sent';
  }
  async function run() {
    if (!line.config(env())) return 0;
    await enqueueTickets();
    if (String(env().LINE_REVIEW_URL || '').trim()) { line.reviewCard(env().LINE_REVIEW_URL); await q(REVIEWS); }
    // Retry keys are only guaranteed for 24h by LINE. Stop before that window, never mint another key.
    await q(`UPDATE line_deliveries SET state='failed',last_error='retry_exhausted' WHERE state='pending'
      AND (attempts>=12 OR first_attempt_at<=now()-interval '23 hours') AND available_at<=now()`);
    let sent=0;
    for (let i=0;i<100;i++) {
      const job=(await q(CLAIM)).rows[0]; if (!job) break;
      try {
        const state=await deliver(job);
        if(state==='paused') {
          await q("UPDATE line_deliveries SET available_at=now()+interval '10 minutes',first_attempt_at=CASE WHEN attempts=1 THEN NULL ELSE first_attempt_at END,attempts=attempts-1 WHERE id=$1 AND attempts=$2",[job.id,job.attempts]);
          continue;
        }
        await q(`UPDATE line_deliveries SET state=$3,sent_at=CASE WHEN $3='sent' THEN now() ELSE NULL END,last_error=NULL
          WHERE id=$1 AND attempts=$2 AND state='pending'`,[job.id,job.attempts,state]);
        if(state==='sent') sent++;
      } catch (error) {
        // Deliberately omit error.message / provider bodies: either may contain PII or bearer tokens.
        log.error('[line-delivery] delivery_failed kind=' + job.kind);
        await q(`UPDATE line_deliveries SET last_error=$3,available_at=now()+interval '10 minutes'
          WHERE id=$1 AND attempts=$2 AND state='pending'`,[job.id,job.attempts,'delivery_failed']);
      }
    }
    return sent;
  }
  return { enqueueTickets, run, deliver };
}
module.exports = { createLineDelivery, SCHEMA, TICKETS, REVIEWS, CLAIM };
