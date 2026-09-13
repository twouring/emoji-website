'use strict';
/* 場地申請通知信：每次進度（送出／通過／未通過／其他更新）都先寫入 event_application_updates，
 * 再由背景工作以冪等金鑰寄給申請者並記錄結果；寄失敗自動退避重試，不會因寄信服務暫時異常而遺漏。 */

const KINDS = ['submitted', 'approved', 'rejected', 'update'];
const MAX_ATTEMPTS = 10;
const CONTACT = '言文字｜台灣人才聚落\nus@emoji.tw · +886 921 102 067';

const fmtTaipei = d => d ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d)) : '';
const appKind = a => a.kind === 'business' ? '企業包場' : '社群活動';
const appVenue = a => a.venue === '2F' ? '二樓交誼廳' : '三樓共享空間';

/** 重試退避（毫秒）：1 分、5 分、15 分、1 小時、之後每 6 小時。 */
function retryDelayMs(attempts) {
  return [60e3, 300e3, 900e3, 3600e3][attempts - 1] ?? 6 * 3600e3;
}

/** 依進度種類組出給申請者的信；純函式，供測試與寄送共用。 */
function applicationUpdateMail({ application: a, update: u, origin = '' }) {
  const kind = appKind(a), portal = origin ? `${origin}/event-application` : '/event-application';
  const footer = `\n\n申請編號：${a.id}\n可登入 ${portal} 查看完整進度紀錄。\n\n${CONTACT}`;
  if (u.kind === 'submitted') return {
    subject: `[言文字] ${kind}申請已收到 · ${a.title}`,
    text: `${a.contact_name} 您好，\n\n我們已收到您的${kind}申請「${a.title}」。\n場地：${appVenue(a)}\n時段：${fmtTaipei(a.starts_at)} – ${fmtTaipei(a.ends_at)}（台灣時間）\n\n送出申請不代表場地已保留；檔期、費用與使用條件將另行書面確認。審核結果與後續進度都會以 Email 通知。\n\nWe have received your venue application. This does not reserve the venue; dates, fees and terms will be confirmed in writing. Review results and updates will be sent by email.${footer}`,
  };
  if (u.kind === 'approved' || u.kind === 'rejected') {
    const result = u.kind === 'approved' ? '初步通過（場地尚未保留）' : '未通過';
    return {
      subject: `[言文字] ${kind}申請審核結果：${result} · ${a.title}`,
      text: `${a.contact_name} 您好，\n\n您的${kind}申請「${a.title}」審核結果：${result}\n\n回覆：\n${u.message}\n\n${u.kind === 'approved' ? '初步通過不代表場地已保留，我們會再與您確認檔期、費用與使用條件並完成書面確認；後續進度會再以 Email 通知。' : '如有疑問可直接回覆此信。'}${footer}`,
    };
  }
  return {
    subject: `[言文字] ${kind}申請進度更新 · ${a.title}`,
    text: `${a.contact_name} 您好，\n\n您的${kind}申請「${a.title}」有新的進度更新：\n\n${u.message}\n\n如有疑問可直接回覆此信。${footer}`,
  };
}

/**
 * 寄出一封到期的申請通知；回傳 true 表示有處理一筆（成功或排入重試），false 表示目前沒有待寄。
 * send：lib/mail 的 sendMail（未設定寄信服務時傳 null，佇列原封不動等待）。
 */
async function deliverApplicationMailOnce(q, send, { origin = '', replyTo = '', now = () => Date.now() } = {}) {
  if (typeof send !== 'function') return false;
  const row = (await q(`UPDATE event_application_updates u SET mail_state='processing', mail_attempts=mail_attempts+1, mail_next_attempt_at=now()+interval '5 minutes'
    WHERE id=(SELECT id FROM event_application_updates WHERE mail_state IN ('queued','retry','processing') AND mail_next_attempt_at<=now() ORDER BY mail_next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING u.*, (SELECT row_to_json(a) FROM event_applications a WHERE a.id=u.application_id) AS application`)).rows[0];
  if (!row) return false;
  if (!row.application) {
    await q(`UPDATE event_application_updates SET mail_state='failed', mail_error='申請已不存在' WHERE id=$1`, [row.id]);
    return true;
  }
  try {
    const mail = applicationUpdateMail({ application: row.application, update: row, origin });
    const out = await send({ to: row.application.contact_email, subject: mail.subject, text: mail.text, replyTo: replyTo || undefined,
      idempotencyKey: `application-update/${row.id}` + (row.mail_resends ? `/r${row.mail_resends}` : '') });
    if (!out || out.skipped || !out.id) throw new Error(out?.skipped ? `寄信服務略過：${out.skipped}` : '寄信服務未接受訊息');
    await q(`UPDATE event_application_updates SET mail_state='sent', mail_sent_at=now(), mail_provider_id=$2, mail_error=NULL WHERE id=$1`, [row.id, String(out.id)]);
  } catch (e) {
    const error = String(e?.message || e).slice(0, 500);
    if (row.mail_attempts >= MAX_ATTEMPTS)
      await q(`UPDATE event_application_updates SET mail_state='failed', mail_error=$2 WHERE id=$1`, [row.id, error]);
    else
      await q(`UPDATE event_application_updates SET mail_state='retry', mail_error=$2, mail_next_attempt_at=$3 WHERE id=$1`,
        [row.id, error, new Date(now() + retryDelayMs(row.mail_attempts)).toISOString()]);
  }
  return true;
}

/** 對外呈現的進度紀錄；申請者看不到寄信錯誤細節與寄信服務 ID。 */
function publicUpdate(u, { admin = false } = {}) {
  const out = { id: u.id, kind: u.kind, message: u.message, created_at: u.created_at,
    mail_state: u.mail_state === 'processing' ? 'queued' : u.mail_state, mail_sent_at: u.mail_sent_at };
  if (admin) { out.actor = u.actor; out.mail_attempts = u.mail_attempts; out.mail_error = u.mail_error; }
  return out;
}

module.exports = { KINDS, MAX_ATTEMPTS, retryDelayMs, applicationUpdateMail, deliverApplicationMailOnce, publicUpdate };
