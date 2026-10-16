'use strict';
/* 預約取餐（會員 App）：客人先選取餐時間與品項，店家在取餐前 PREP_MIN 分鐘自動送進出餐看板，到店付款。
   純函式：時段格、驗證；DB 與出單在 server.js。時間一律台北（UTC+8，無日光節約）。 */
const { taipeiNowParts } = require('./reservations');

const LEAD_MIN = 20;   // 最早可選：現在起 20 分鐘後
const STEP_MIN = 15;   // 時段格 15 分鐘
const PREP_MIN = 20;   // 取餐前 20 分鐘自動送單（出餐看板＋出餐單）
const EXPIRE_HOURS = 4; // 取餐時間過 4 小時沒來、沒結帳 → 自動收掉外帶單（釋出號碼）
const MAX_OPEN_PER_USER = 3;

const pad = n => String(n).padStart(2, '0');
const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* 取餐時段歸哪個品牌：08:00–16:45 在咖啡、17:00–23:45 三點水；凌晨（00:00–02:45）不開放預約取餐 */
function venueOfTime(time) {
  const m = mins(time);
  if (m >= 8 * 60 && m < 17 * 60) return 'CAFE';
  if (m >= 17 * 60) return 'BAR';
  return null;
}
const addDays = (date, n) => new Date(new Date(date + 'T00:00:00+08:00').getTime() + n * 86400e3).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
/* 可選日期：今天、明天 */
function dates(now = new Date()) { const t = taipeiNowParts(now).date; return [t, addDays(t, 1)]; }
/* 某天還能選的時段（今天會剔除「現在 + LEAD_MIN」以前的格） */
function slotsFor(date, now = new Date()) {
  const t = taipeiNowParts(now), out = [];
  for (let m = 8 * 60; m < 24 * 60; m += STEP_MIN) {
    if (date === t.date && m < t.minutes + LEAD_MIN) continue;
    const time = hhmm(m), venue = venueOfTime(time);
    if (venue) out.push({ time, venue });
  }
  return out;
}
const toInstant = (date, time) => new Date(date + 'T' + time + ':00+08:00');

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
function normalizePickup(body = {}, now = new Date()) {
  const date = String(body.date || '').trim(), time = String(body.time || '').trim();
  if (!DATE_RE.test(date) || !dates(now).includes(date)) throw bad('只能預約今天或明天取餐。');
  if (!TIME_RE.test(time)) throw bad('請選擇取餐時間（15 分鐘一格）。');
  const venue = venueOfTime(time);
  if (!venue) throw bad('這個時間沒有營業，請改選 08:00–23:45。');
  const pickupAt = toInstant(date, time);
  if (pickupAt.getTime() < now.getTime() + LEAD_MIN * 60e3) throw bad(`取餐時間至少要在 ${LEAD_MIN} 分鐘後。`);
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length || raw.length > 20) throw bad('請選擇 1–20 種品項。');
  let total = 0;
  const items = raw.map(x => {
    const item_id = String(x && x.item_id || '').trim(), qty = Number(x && x.qty);
    if (!item_id || item_id.length > 40) throw bad('品項格式不正確。');
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad('每種品項數量為 1–20。');
    total += qty;
    return { item_id, qty, note: String(x && x.note || '').replace(/[\x00-\x1f]/g, '').trim().slice(0, 160) };
  });
  if (total > 40) throw bad('一張取餐單最多 40 件。');
  const note = String(body.note || '').replace(/[\x00-\x1f]/g, '').trim().slice(0, 200);
  return { date, time, venue, pickupAt, items, note };
}
/* 來賓識別（table-orders.addLine 要 /^[a-z0-9]{8,32}$/）：由會員 id 推出，同一人同單合併數量 */
const guestOf = userId => ('app' + String(userId || '').toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 32).padEnd(8, '0');
/* 到了該送單的時間：取餐前 PREP_MIN 分鐘 */
const dueToPlace = (pickupAt, now = new Date()) => new Date(pickupAt).getTime() - PREP_MIN * 60e3 <= now.getTime();
const expired = (pickupAt, now = new Date()) => new Date(pickupAt).getTime() + EXPIRE_HOURS * 3600e3 <= now.getTime();
const clock = iso => new Date(iso).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' });

module.exports = { LEAD_MIN, STEP_MIN, PREP_MIN, EXPIRE_HOURS, MAX_OPEN_PER_USER, venueOfTime, dates, slotsFor, toInstant, normalizePickup, guestOf, dueToPlace, expired, clock };
