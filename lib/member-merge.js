/* POS 合併會員：把「刪除方」帳號的所有資料搬到「保留方」，再刪掉刪除方。
   常見情境：客人在店內結帳報手機（POS 自動建立的手機會員），之後又用 Google／LINE／Email 登入會員 App，形成兩個帳號。 */
'use strict';

// 沒有外鍵、但存會員 id 的欄位（外鍵欄位執行時從 pg_constraint 自動找）
const EXTRA_COLUMNS = [
  ['table_orders', 'user_id'], ['table_sessions', 'user_id'], ['dining_reservations', 'user_id'],
  ['pos_membership_grants', 'user_id'], ['event_registration_history', 'user_id'],
];
// 以 (event_id,user_id) 或 (user_id,provider) 為唯一鍵、可以直接以保留方為準的表：刪除方重複的那筆捨棄
const DEDUPE = [
  ['event_notification_preferences', 'event_id'], ['event_feedback', 'event_id'],
  ['event_online_joins', 'event_id'], ['event_meeting_connections', 'provider'],
];

const blank = v => v === null || v === undefined || String(v).trim() === '';
const phoneLike = v => /^\+?\d[\d\s-]{6,}$/.test(String(v || '').trim());

/* 合併後保留方的個人資料：保留方有的優先，空的才用刪除方補。姓名若只是手機號碼（POS 建的），用另一方的真名 */
function mergedProfile(keep, drop) {
  const pick = k => (blank(keep[k]) ? (drop[k] ?? null) : keep[k]);
  let name = keep.name;
  if (blank(name) || (phoneLike(name) && !blank(drop.name) && !phoneLike(drop.name))) name = drop.name || keep.name || '';
  const phoneFromDrop = blank(keep.phone_e164) && !blank(drop.phone_e164);
  return {
    name,
    email: pick('email'),
    phone: phoneFromDrop ? drop.phone : pick('phone'),
    phone_e164: pick('phone_e164'),
    phone_verified_at: phoneFromDrop ? (drop.phone_verified_at || null) : (keep.phone_verified_at || null),
    line_user_id: pick('line_user_id'),
    line_linked_at: blank(keep.line_user_id) ? (drop.line_linked_at || null) : (keep.line_linked_at || null),
  };
}

/* 合併前的硬性檢查；回傳錯誤訊息或 null */
function mergeBlocker(keep, drop) {
  if (!keep || !drop) return '找不到這位會員。';
  if (keep.id === drop.id) return '請選兩個不同的會員帳號。';
  if (keep.is_admin || drop.is_admin || keep.admin_password_hash || drop.admin_password_hash || keep.admin_brand || drop.admin_brand)
    return '管理員／後台帳號不能在 POS 合併，請由言文字管理員處理。';
  if (!blank(keep.email) && !blank(drop.email) && String(keep.email).toLowerCase() !== String(drop.email).toLowerCase())
    return '兩個帳號各有不同的 Email 登入，合併後只能留一個，請由言文字管理員處理。';
  if (!blank(keep.line_user_id) && !blank(drop.line_user_id) && keep.line_user_id !== drop.line_user_id)
    return '兩個帳號各綁了不同的 LINE，請由言文字管理員處理。';
  if (!blank(keep.phone_e164) && !blank(drop.phone_e164) && keep.phone_e164 !== drop.phone_e164)
    return '兩個帳號的手機不同，確認是同一人後請先在會員 App 改成同一支，或由言文字管理員處理。';
  return null;
}

const qi = s => '"' + String(s).replace(/"/g, '""') + '"';

/* 在交易內執行；client 已 BEGIN，呼叫端負責 COMMIT/ROLLBACK。回傳 {moved:{table.col:n}} */
async function mergeMembers(client, keep, drop) {
  const keepId = keep.id, dropId = drop.id, moved = {};
  // 同一場活動兩邊都報名：無法自動決定留哪張票
  const both = (await client.query('SELECT 1 FROM event_regs a JOIN event_regs b ON a.event_id=b.event_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1', [dropId, keepId])).rows[0];
  if (both) throw Object.assign(Error('兩個帳號都報名了同一場活動，請由言文字管理員處理。'), { status: 409 });
  for (const [t, k] of DEDUPE) {
    await client.query(`DELETE FROM ${qi(t)} d USING ${qi(t)} k WHERE d.user_id=$1 AND k.user_id=$2 AND d.${qi(k)}=k.${qi(k)}`, [dropId, keepId]);
  }
  const fks = (await client.query(`SELECT c.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.contype='f' AND c.confrelid='users'::regclass AND c.conrelid<>'users'::regclass`)).rows;
  const cols = new Map();
  for (const { tbl, col } of fks) cols.set(tbl + '.' + col, [tbl, col, true]);
  for (const [t, c] of EXTRA_COLUMNS) if (!cols.has(t + '.' + c)) cols.set(t + '.' + c, [t, c, false]);
  for (const [key, [t, c, quoted]] of cols) {
    const r = await client.query(`UPDATE ${quoted ? t : qi(t)} SET ${qi(c)}=$1 WHERE ${qi(c)}=$2`, [keepId, dropId]);
    if (r.rowCount) moved[key] = r.rowCount;
  }
  // JSON 裡的會員 id：付款單的 payer.member_id（報表算不重複會員）、桌上未結 App 兌換行的 redeem_user（退點用）
  const p = await client.query(`UPDATE table_orders SET payer=jsonb_set(payer,'{member_id}',to_jsonb($1::text)) WHERE payer->>'member_id'=$2`, [keepId, dropId]);
  if (p.rowCount) moved['table_orders.payer.member_id'] = p.rowCount;
  const s = await client.query(`UPDATE table_sessions SET items=(SELECT jsonb_agg(CASE WHEN e->>'redeem_user'=$2 THEN jsonb_set(e,'{redeem_user}',to_jsonb($1::text)) ELSE e END) FROM jsonb_array_elements(items) e)
    WHERE status='open' AND jsonb_typeof(items)='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(items) e WHERE e->>'redeem_user'=$2)`, [keepId, dropId]);
  if (s.rowCount) moved['table_sessions.items.redeem_user'] = s.rowCount;
  // 個人資料：先清掉刪除方的唯一欄位（手機、LINE）再寫到保留方，然後刪掉刪除方
  const prof = mergedProfile(keep, drop);
  await client.query('UPDATE users SET phone_e164=NULL,line_user_id=NULL,email=NULL WHERE id=$1', [dropId]);
  await client.query(`UPDATE users SET name=$2,email=$3,phone=$4,phone_e164=$5,phone_verified_at=$6,line_user_id=$7,line_linked_at=$8 WHERE id=$1`,
    [keepId, prof.name, prof.email, prof.phone, prof.phone_e164, prof.phone_verified_at, prof.line_user_id, prof.line_linked_at]);
  await client.query('DELETE FROM users WHERE id=$1', [dropId]);
  return { moved, profile: prof };
}

module.exports = { mergedProfile, mergeBlocker, mergeMembers, EXTRA_COLUMNS, DEDUPE };
