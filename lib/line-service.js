'use strict';
/* LINE 官方帳號的「有 DB」那一層：webhook 事件處理、訂位通知／提醒、員工群組通知、LINE Login 綁定、後台推播。
 * 純邏輯（Flex、關鍵字、簽章）在 lib/line.js；這裡只負責把它們接到資料表。
 * 所有對 LINE 的呼叫都走 quiet：沒設定金鑰或 LINE 出錯都不得影響訂位、結帳等主流程。 */
const line = require('./line');

function createLineService({ q, uid, origin, yanBalance, fetcher = fetch, log = console, env = () => process.env }) {
  const cfg = () => line.config(env());
  const opts = () => ({ fetcher });
  const quiet = async (label, fn) => { try { return await fn(); } catch (e) { log.error(`[line] ${label}：operation_failed`); return null; } };

  /* ---- 使用者綁定 ---- */
  const userByLine = async lineUserId => (await q('SELECT id,name,email,phone_e164 FROM users WHERE line_user_id=$1 LIMIT 1', [lineUserId])).rows[0] || null;
  async function bindUser(userId, lineUserId) {
    const conflict = () => Object.assign(Error('此 LINE 或會員已綁定其他帳號，請聯絡店家處理。'), { status:409 });
    if (!/^U[0-9a-f]{32}$/.test(lineUserId)) throw Object.assign(Error('LINE ID 無效。'), {status:400});
    try {
      const out = await q(`UPDATE users SET line_user_id=$2,line_linked_at=now() WHERE id=$1
        AND (line_user_id IS NULL OR line_user_id=$2)
        AND NOT EXISTS(SELECT 1 FROM users other WHERE other.line_user_id=$2 AND other.id<>$1)`, [userId,lineUserId]);
      if (!out.rowCount) throw conflict();
    } catch (e) { if(e.code==='23505') throw conflict(); throw e; }
  }
  /* LINE Login 回來：用 line_user_id → email → 新建，找到對應會員；回 user row。accountByEmail 由 server 注入（含重複信箱檢查） */
  async function resolveLoginUser(profile, accountByEmailFn) {
    let user = await userByLine(profile.sub);
    if (!user && profile.email) user = await accountByEmailFn(profile.email, profile.name);
    if (!user) {
      user = { id: uid('u_'), name: profile.name || 'LINE 會員', email: null };
      await q(`INSERT INTO users(id,name,email,status) VALUES($1,$2,NULL,'已查看')`, [user.id, user.name]);
    }
    await bindUser(user.id, profile.sub);
    return user;
  }

  /* ---- 訂位 ---- */
  const resvById = async id => (await q(`SELECT id,request_id,to_char(reserve_date,'YYYY-MM-DD') AS reserve_date,reserve_time,period,party_size,name,lang,status,line_user_id FROM dining_reservations WHERE id=$1 AND deleted_at IS NULL`, [id])).rows[0] || null;
  const cardOf = (r, kind) => line.reservationCard({ id: r.id, date: r.reserve_date, time: r.reserve_time, period: r.period, partySize: r.party_size, request_id: r.request_id }, { lang: r.lang, origin: origin(), kind });
  async function linkReservation(resvId, lineUserId) {
    const changed = await q('UPDATE dining_reservations SET line_user_id=$2 WHERE id=$1 AND deleted_at IS NULL AND (line_user_id IS NULL OR line_user_id=$2)', [resvId, lineUserId]);
    if (!changed.rowCount) return null;
    const r = await resvById(resvId), c = cfg();
    if (r && r.line_user_id !== lineUserId) return null;
    if (r && c) await quiet('訂位確認卡', () => line.push(c, lineUserId, cardOf(r, 'confirmed'), opts()));
    return r;
  }
  async function notifyStaff(text) {
    const c = cfg(); if (!c || !c.staffGroupId) return null;
    return quiet('員工群組通知', () => line.push(c, c.staffGroupId, text, opts()));
  }
  const notifyStaffReservation = (r, requestId, source) => notifyStaff(line.staffReservationText(r, requestId, { origin: origin(), source }));
  /* 前一日提醒：每天 18:00 跑；一筆只提醒一次 */
  async function sendReminders() {
    const c = cfg(); if (!c) return 0;
    const rows = (await q(`SELECT id,request_id,to_char(reserve_date,'YYYY-MM-DD') AS reserve_date,reserve_time,period,party_size,lang,line_user_id FROM dining_reservations
      WHERE line_user_id IS NOT NULL AND deleted_at IS NULL AND status IN ('new','confirmed') AND reminder_sent_at IS NULL
        AND reserve_date=(now() AT TIME ZONE 'Asia/Taipei')::date+1 ORDER BY reserve_time LIMIT 200`)).rows;
    let n = 0;
    for (const r of rows) {
      const ok = await quiet('訂位提醒', () => line.push(c, r.line_user_id, cardOf(r, 'reminder'), opts()));
      if (ok) { await q('UPDATE dining_reservations SET reminder_sent_at=now() WHERE id=$1', [r.id]); n++; }
    }
    return n;
  }
  async function cancelByLine(resvId, lineUserId) {
    const r = await resvById(resvId);
    if (!r || r.line_user_id !== lineUserId || !['new', 'confirmed'].includes(r.status)) return { ok: false, lang: r?.lang };
    const res = await q(`UPDATE dining_reservations SET status='cancelled',updated_at=now() WHERE id=$1 AND line_user_id=$2 AND deleted_at IS NULL AND status IN ('new','confirmed') AND reserve_date>=(now() AT TIME ZONE 'Asia/Taipei')::date`, [r.id,lineUserId]);
    if (!res.rowCount) return { ok: false, lang: r.lang };
    await notifyStaff(`❌ 訂位已由客人在 LINE 取消 ${r.request_id}\n${r.reserve_date} ${r.reserve_time}｜${r.party_size} 位｜${r.name}`);
    return { ok: true, lang: r.lang };
  }

  /* ---- webhook ---- */
  async function handleEvent(ev) {
    const c = cfg(); if (!c || !ev || !ev.type) return;
    const src = ev.source || {}, uidL = src.userId || '';
    const reply = msgs => ev.replyToken ? line.reply(c, ev.replyToken, msgs, opts()) : null;
    if (src.type === 'group' || src.type === 'room') {
      // 員工群組：加入時、或有人輸入「群組ID」時回報 ID，貼進後台系統設定
      const gid = src.groupId || src.roomId;
      if (ev.type === 'join' || (ev.type === 'message' && ev.message?.type === 'text' && /^(群組ID|group ?id)$/i.test(ev.message.text.trim())))
        await reply(`這個群組的 ID：\n${gid}\n貼到後台「系統設定 → LINE 官方帳號 → 員工通知群組 ID」，之後新訂位會通知這裡。`);
      return;
    }
    if (ev.type === 'follow') {
      const lang = await followLang(c, uidL);
      if (uidL) await q(`INSERT INTO line_profiles(line_user_id,lang,followed_at,asked_at) VALUES($1,$2,now(),now())
        ON CONFLICT(line_user_id) DO UPDATE SET lang=EXCLUDED.lang,followed_at=now(),unfollowed_at=NULL,asked_at=now(),updated_at=now()`, [uidL, lang]);
      await reply([...line.welcomeMessages({ origin: origin(), lang }), line.surveySourceQuestion(lang)]); return;
    }
    if (ev.type === 'unfollow') { if (uidL) await q('UPDATE line_profiles SET unfollowed_at=now(),updated_at=now() WHERE line_user_id=$1', [uidL]); return; }
    if (ev.type === 'postback') {
      const pb = line.parsePostback(ev.postback?.data); if (!pb) return;
      if (['src', 'int', 'int_done', 'int_none'].includes(pb.a)) { if (uidL) await reply(await answerSurvey(uidL, pb)); return; }
      const r = pb.id ? await resvById(pb.id) : null, lang = r?.lang || 'zh', t = line.T[line.pickLang(lang)];
      if (pb.a === 'resv_confirm') { if (r && r.line_user_id === uidL) await reply(t.thanksComing); return; }
      if (pb.a === 'resv_cancel') {
        const out = await cancelByLine(pb.id, uidL);
        await reply(out.ok ? t.cancelled + origin() + (lang === 'zh' ? '' : '/' + lang) + '/reserve' : (r && ['cancelled', 'arrived', 'no_show'].includes(r.status) ? t.alreadyDone : t.cantCancel + line.PHONE));
      }
      return;
    }
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = ev.message.text, key = line.matchKeyword(text), lang = line.guessLang(text);
      /* 舊好友（問卷上線前加入的）第一次互動時補建檔；關鍵字回覆時順便問一次問卷（Reply 免費），30 天內不重問 */
      const prof = uidL ? await touchProfile(uidL, lang) : null;
      if (!key) return; // 沒對到不回，留給吧台真人
      if (key === 'prefs') { if (uidL) { await q('UPDATE line_profiles SET asked_at=now(),updated_at=now() WHERE line_user_id=$1', [uidL]); await reply(line.surveySourceQuestion(lang)); } return; }
      let balance = null;
      if (key === 'points' && uidL) { const u = await userByLine(uidL); if (u) balance = await yanBalance(u.id); }
      const msgs = line.keywordReply(key, { lang, origin: origin(), balance, wifi: String(env().LINE_WIFI_NOTE || '').trim() });
      if (prof && !prof.answered_at && (!prof.asked_at || Date.now() - new Date(prof.asked_at) > 30 * 864e5) && msgs.length && msgs.length < 5) {
        msgs.push(line.surveySourceQuestion(lang));
        await q('UPDATE line_profiles SET asked_at=now(),updated_at=now() WHERE line_user_id=$1', [uidL]);
      }
      if (msgs.length) await reply(msgs);
    }
  }

  /* ---- 問卷：怎麼認識我們（單選）→ 想做什麼（複選，一次一個 quick reply）---- */
  async function followLang(c, uidL) {
    if (!uidL) return 'zh';
    const p = await quiet('好友語言', () => line.profile(c, uidL, opts()));
    return line.pickLang(p?.language);
  }
  async function touchProfile(uidL, lang) {
    const r = await q(`INSERT INTO line_profiles(line_user_id,lang) VALUES($1,$2) ON CONFLICT(line_user_id) DO UPDATE SET unfollowed_at=NULL
      RETURNING lang,answered_at,asked_at,interests`, [uidL, line.pickLang(lang)]);
    return r.rows?.[0] || null;
  }
  async function answerSurvey(uidL, pb) {
    const cur = (await q('SELECT lang,interests FROM line_profiles WHERE line_user_id=$1', [uidL])).rows[0];
    const lang = line.pickLang(cur?.lang), t = line.SURVEY_T[lang];
    if (!cur) await q('INSERT INTO line_profiles(line_user_id,lang) VALUES($1,$2) ON CONFLICT DO NOTHING', [uidL, lang]);
    if (pb.a === 'src') {
      if (!line.SOURCE_KEYS.has(pb.id)) return [];
      await q('UPDATE line_profiles SET source=$2,interests=$3,opted_out=false,updated_at=now() WHERE line_user_id=$1', [uidL, pb.id, []]);
      return line.surveyInterestQuestion(lang, []);
    }
    if (pb.a === 'int') {
      if (!line.INTEREST_KEYS.has(pb.id)) return [];
      const set = [...new Set([...(cur?.interests || []), pb.id])];
      await q('UPDATE line_profiles SET interests=$2,answered_at=now(),opted_out=false,updated_at=now() WHERE line_user_id=$1', [uidL, set]);
      return set.length >= line.SURVEY_INTERESTS.length ? t.done : line.surveyInterestQuestion(lang, set);
    }
    if (pb.a === 'int_done') { await q('UPDATE line_profiles SET answered_at=COALESCE(answered_at,now()),updated_at=now() WHERE line_user_id=$1', [uidL]); return t.done; }
    await q('UPDATE line_profiles SET opted_out=true,answered_at=COALESCE(answered_at,now()),updated_at=now() WHERE line_user_id=$1', [uidL]);
    return t.optout;
  }

  /* ---- 不定時邀請（Push 計費）：11／14／18 點各跑一次，依問卷標籤挑一則 ----
     護欄：每人至少間隔 7–10 天（依 ID 雜湊錯開，才不會同一天全部收到）；本月推播額度只用到 80%，留給訂位提醒與票券；
     LINE_INVITES_ENABLED=0 可整個停掉；未填問卷、選「先不用通知」、已封鎖的人不送。 */
  async function sendInvites({ now = new Date() } = {}) {
    const c = cfg(); if (!c || String(env().LINE_INVITES_ENABLED || '1').trim() === '0') return { sent: 0, skipped: 'disabled' };
    const hour = new Date(+now + 8 * 3600e3).getUTCHours(), kinds = line.INVITE_SLOTS[hour];
    if (!kinds) return { sent: 0, skipped: 'not_slot' };
    const qt = await quiet('額度', () => line.quota(c, opts()));
    let budget = qt && qt.limit != null ? Math.floor(qt.limit * 0.8) - (qt.used || 0) : 500;
    if (budget <= 0) return { sent: 0, skipped: 'quota' };
    const event = kinds.includes('events') ? (await q(`SELECT id,slug,title,starts_at FROM events WHERE status IN ('預告','報名中') AND visibility='public' AND slug IS NOT NULL
      AND starts_at > now() + interval '3 hours' AND starts_at < now() + interval '7 days' ORDER BY starts_at LIMIT 1`)).rows[0] || null : null;
    const rows = (await q(`SELECT line_user_id,lang,interests FROM line_profiles WHERE unfollowed_at IS NULL AND NOT opted_out AND answered_at IS NOT NULL
      AND cardinality(interests)>0 AND (last_invited_at IS NULL OR last_invited_at < now() - make_interval(days => 7 + abs(hashtext(line_user_id)) % 4))
      ORDER BY last_invited_at NULLS FIRST LIMIT 2000`)).rows;
    const groups = new Map();
    for (const r of rows) {
      const kind = line.pickInvite(hour, r.interests || [], { hasEvent: !!event }); if (!kind) continue;
      const key = kind + ':' + line.pickLang(r.lang); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r.line_user_id);
    }
    let sent = 0;
    for (const [key, ids] of groups) {
      const [kind, lang] = key.split(':'), batch = ids.slice(0, budget - sent); if (!batch.length) break;
      const msg = line.inviteMessage(kind, { lang, origin: origin(), event });
      const ok = await quiet('邀請 ' + key, () => line.multicast(c, batch, [msg], opts()));
      if (ok == null) continue;
      await q(`UPDATE line_profiles SET last_invited_at=now(),updated_at=now() WHERE line_user_id=ANY($1)`, [batch]);
      await q(`INSERT INTO line_invites(id,kind,lang,event_id,recipients) VALUES($1,$2,$3,$4,$5)`, [uid('li_'), kind, lang, kind === 'events' ? event?.id : null, batch.length]);
      sent += batch.length;
    }
    return { sent, budget };
  }
  async function surveyStats() {
    const one = async (sql) => (await q(sql)).rows;
    const [tot] = await one(`SELECT COUNT(*)::int AS profiles, COUNT(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered, COUNT(*) FILTER (WHERE opted_out)::int AS opted_out, COUNT(*) FILTER (WHERE unfollowed_at IS NOT NULL)::int AS unfollowed FROM line_profiles`);
    const src = await one(`SELECT source AS k, COUNT(*)::int AS n FROM line_profiles WHERE source IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
    const int = await one(`SELECT unnest(interests) AS k, COUNT(*)::int AS n FROM line_profiles GROUP BY 1 ORDER BY 2 DESC`);
    const inv = await one(`SELECT kind AS k, SUM(recipients)::int AS n FROM line_invites WHERE sent_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`);
    return { ...(tot || {}), by_source: src, by_interest: int, invites_30d: inv };
  }
  /* 去重：LINE 會重送；以 webhookEventId 入表，已處理過就跳過 */
  async function handleWebhook(body) {
    const events = Array.isArray(body?.events) ? body.events : [];
    for (const ev of events) {
      const id = ev.webhookEventId;
      if (id) { const ins = await q('INSERT INTO line_events(id) VALUES($1) ON CONFLICT DO NOTHING', [id]); if (!ins.rowCount) continue; }
      await quiet('處理事件 ' + ev.type, () => handleEvent(ev));
    }
    return events.length;
  }

  /* ---- 後台 ---- */
  async function status() {
    const c = cfg();
    const out = { configured: !!c, login: !!line.loginConfig(env()), oa_id: line.oaId(env()), staff_group: !!c?.staffGroupId, webhook_url: origin() + '/api/line/webhook', linked: Number((await q(`SELECT COUNT(*)::int AS n FROM users WHERE line_user_id IS NOT NULL`)).rows[0]?.n || 0),
      segments: Object.entries(line.AUDIENCES).map(([key, a]) => ({ key, label: a.label })) };
    out.survey = await quiet('問卷統計', surveyStats);
    if (c) { out.webhook = await line.webhookInfo(c, opts()).catch(e => ({ error: String(e.message || '').slice(0, 120) }));
      out.bot = await quiet('bot info', () => line.botInfo(c, opts())); out.quota = await quiet('quota', () => line.quota(c, opts())); out.followers = await quiet('followers', () => line.followers(c, opts())); }
    return out;
  }
  async function broadcast(body, { preview = false } = {}) {
    const c = cfg(); if (!c) throw Object.assign(new Error('尚未設定 LINE Channel secret／access token。'), { status: 409 });
    const b = line.normalizeBroadcast(body);
    const rows = (await q(line.audienceSql(b.segment))).rows, ids = rows.map(r => r.line_user_id);
    if (preview) return { count: ids.length };
    if (!ids.length) throw Object.assign(new Error('這個分眾目前沒有人。'), { status: 409 });
    const msgs = [{ type: 'text', text: b.text + (b.url ? '\n' + b.url : '') }];
    const sent = await line.multicast(c, ids, msgs, opts());
    await q('INSERT INTO line_broadcasts(id,segment,text,url,recipients) VALUES($1,$2,$3,$4,$5)', [uid('lb_'), b.segment, b.text, b.url, sent]);
    return { sent };
  }
  async function publishRichMenu({ port, render = line.renderRichMenuPng } = {}) {
    const c = cfg(); if (!c) throw Object.assign(new Error('尚未設定 LINE Channel secret／access token。'), { status: 409 });
    const png = await render({ port });
    return line.publishRichMenu(c, line.richMenuSpec(origin(), { liffId: c.liffId }), png, opts());
  }

  return { cfg, quiet, userByLine, bindUser, resolveLoginUser, linkReservation, notifyStaff, notifyStaffReservation, sendReminders, cancelByLine, handleEvent, handleWebhook, status, broadcast, publishRichMenu, sendInvites, answerSurvey, surveyStats };
}

module.exports = { createLineService };
