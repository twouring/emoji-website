'use strict';
/* POS 營業情境（KK 11/15）：餐飲（在咖啡、三點水）／空間（等等空間、約書旅）。
   空間情境＝共享空間計時制：一張入場單＝一組客人（headcount 人），先付費，收款當下開始計時；
   方案品項帶 space_role:'plan'＋space_minutes（0＝不限時，例：會員入場）；超時品項 space_role:'overtime'，與方案同店別同分類。
   設定存 site_content `pos_mode:<VENUE>`；入場單資料存 table_sessions.space（{seat,headcount,in_at,out_at,overtime}）。
   本檔只放純函式（可單測），路由在 server.js「POS 空間情境」區塊。 */

const VENUES = ['CAFE', 'BAR', 'STAY', 'REST'];
const MODES = ['dining', 'space'];
const MODE_LABEL = { dining: '餐飲', space: '空間' };
const DEFAULTS = {
  CAFE: { mode: 'dining' },
  BAR: { mode: 'dining' },
  // 約書旅：靜讀室對外 10 席要指定席號；連續 8 小時須離席（KK 11/11 定案）
  REST: { mode: 'space', max_hours: 8, seats: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'], seat_cats: ['QUIET'] },
  // 等等空間：3F 自由座，不指定席號（KK 11/15：4h 200／12h 500／超時 50）
  STAY: { mode: 'space', max_hours: 0, seats: [], seat_cats: [] },
};
const BASE = { grace_min: 15, unit_min: 60, max_hours: 0, warn_min: 10, capacity: 0, seats: [], seat_cats: [] };
const SEAT_RE = /^[A-Za-z0-9-]{1,8}$/;
const ENTRY_RE = /^E\d{2}$/;   // 不指定席號的入場單編號 E01–E99
const LEAVE_UNCONFIRMED_MIN = 120;   // 超過預計離場＋寬限再 2 小時仍未按離場＝列入「待確認離場」

const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const minutesOf = ms => Math.max(0, Math.floor(ms / 60000));

function contentKey(venue) { return 'pos_mode:' + venue; }

function normalizeSettings(raw, venue) {
  let j = raw;
  if (typeof raw === 'string') { try { j = raw ? JSON.parse(raw) : {}; } catch { j = {}; } }
  j = j && typeof j === 'object' ? j : {};
  const d = { ...BASE, ...(DEFAULTS[venue] || { mode: 'dining' }) };
  const seats = Array.isArray(j.seats) ? j.seats : d.seats;
  const cats = Array.isArray(j.seat_cats) ? j.seat_cats : d.seat_cats;
  return {
    mode: MODES.includes(j.mode) ? j.mode : d.mode,
    grace_min: int(j.grace_min, 0, 120, d.grace_min),
    unit_min: int(j.unit_min, 15, 240, d.unit_min),
    max_hours: int(j.max_hours, 0, 24, d.max_hours),
    warn_min: int(j.warn_min, 0, 60, d.warn_min),
    capacity: int(j.capacity, 0, 500, d.capacity),
    seats: [...new Set(seats.map(s => String(s || '').trim().toUpperCase()).filter(s => SEAT_RE.test(s) && !ENTRY_RE.test(s)))].slice(0, 100),
    seat_cats: [...new Set(cats.map(c => String(c || '').trim().toUpperCase()).filter(c => /^[A-Z]{2,12}$/.test(c)))].slice(0, 10),
  };
}
/* 設定頁送來的部分欄位合併進現有設定 */
function mergeSettings(cur, body, venue) {
  const b = body && typeof body === 'object' ? body : {};
  const next = { ...cur };
  for (const k of ['mode', 'grace_min', 'unit_min', 'max_hours', 'warn_min', 'capacity', 'seats', 'seat_cats']) if (b[k] !== undefined) next[k] = b[k];
  if (typeof next.seats === 'string') next.seats = next.seats.split(/[\s,，、]+/);
  return normalizeSettings(next, venue);
}

/* 超時計算：超過寬限才收；每 unit 分鐘以寬限為界（4h 方案：4:14 不收、4:16 收 1、5:14 收 1、5:16 收 2） */
function overtimeUnits(usedMin, planMin, { grace_min = 15, unit_min = 60 } = {}) {
  if (!(planMin > 0)) return 0;   // 不限時（會員入場）不算超時
  const over = usedMin - planMin;
  if (over <= grace_min) return 0;
  return Math.ceil((over - grace_min) / unit_min);
}

const liveLines = items => (items || []).filter(l => l && !l.cancelled && !l.credit_of);
const planLines = items => liveLines(items).filter(l => l.space_role === 'plan');
/* 方案總分鐘：每一行方案算一次（數量＝人數，不乘）；任一行不限時（0）且沒有其他限時方案＝不限時 */
function planMinutes(items) {
  return planLines(items).reduce((a, l) => a + (Number(l.space_minutes) || 0), 0);
}
function headcountOf(space, items) {
  const h = Math.floor(Number(space && space.headcount));
  if (h >= 1) return Math.min(20, h);
  const first = planLines(items)[0];
  return first ? Math.max(1, Number(first.qty) || 1) : 1;
}
/* 加方案（延長）後是否超過連續使用上限 */
function checkLimit(items, cfg) {
  const max = (cfg && cfg.max_hours) || 0;
  if (!max) return null;
  const m = planMinutes(items);
  if (m > max * 60) return `連續使用上限 ${max} 小時，延長後會變成 ${Math.round(m / 6) / 10} 小時。請先離場，再重新入場計時。`;
  return null;
}
/* 超時要加哪個品項：與最後一行方案同店別、同分類的 overtime 品項 */
function overtimeItemFor(items, menuItems) {
  const last = planLines(items).slice(-1)[0];
  if (!last) return null;
  const list = (menuItems || []).filter(it => it && it.space_role === 'overtime' && it.venue === last.venue);
  return list.find(it => it.cat === last.cat) || list[0] || null;
}
function isSpaceSession(s) { return !!(s && s.space && typeof s.space === 'object'); }
/* 空間入場單在客人離場前不清桌（先付費後計時）；按離場後才照一般規則結清即清 */
function holdOpen(s) { return isSpaceSession(s) && !s.space.out_at; }

/* 卡片／單據用的狀態。now 可傳入（測試）；回傳時間一律 ISO。 */
function view(s, cfg, now = Date.now()) {
  if (!isSpaceSession(s)) return null;
  const sp = s.space, items = s.items || [];
  const plan = planMinutes(items), plans = planLines(items);
  const inAt = sp.in_at ? new Date(sp.in_at).getTime() : null;
  const outAt = sp.out_at ? new Date(sp.out_at).getTime() : null;
  const endAt = outAt || now;
  const used = inAt ? minutesOf(endAt - inAt) : 0;
  const due = inAt && plan > 0 ? inAt + plan * 60000 : null;
  const c = cfg || BASE;
  const units = inAt ? overtimeUnits(used, plan, c) : 0;
  const limitAt = inAt && c.max_hours ? inAt + c.max_hours * 3600000 : null;
  let state = 'unpaid';
  const prepaid = !inAt && sp.prepaid === true && liveLines(items).every(l => l.order_id);   // 會員 App 線上已付、客人還沒到（KK 11/17 貴賓室）
  if (outAt) state = 'left';
  else if (prepaid) state = 'ready';
  else if (inAt && !due) state = 'open';
  else if (inAt) {
    const left = (due - now) / 60000;
    state = left > c.warn_min ? 'ok' : left > 0 ? 'soon' : -left <= c.grace_min ? 'grace' : 'over';
    if (-left > c.grace_min + LEAVE_UNCONFIRMED_MIN) state = 'stale';
  }
  const paid = liveLines(items).filter(l => l.order_id);
  return {
    seat: sp.seat || s.table_no || '', headcount: headcountOf(sp, items),
    in_at: sp.in_at || null, out_at: sp.out_at || null, due_at: due ? new Date(due).toISOString() : null,
    limit_at: limitAt ? new Date(limitAt).toISOString() : null, limit_hit: !!(limitAt && !outAt && now >= limitAt),
    plan_minutes: plan, used_minutes: used, overtime_units: units, state,
    plans: plans.map(l => ({ line: l.line, item_id: l.item_id, zh: l.zh, cat: l.cat, minutes: Number(l.space_minutes) || 0, qty: l.qty, paid: !!l.order_id })),
    overtime: sp.overtime || null,
    prepaid, online: sp.online === true, member: sp.member_name || '',
    paid_total: paid.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0),
  };
}

/* 會員 App 線上購買（KK 11/17「貴賓室」分頁）：約書旅已發布、有價格、限時的入場方案（超時、包場不賣） */
function onlinePlans(items, venue = 'REST') {
  return (items || []).filter(it => it && it.published && it.venue === venue && it.space_role === 'plan' && Number(it.price) > 0 && Number(it.space_minutes) > 0)
    .sort((a, b) => String(a.cat).localeCompare(String(b.cat)) || (a.sort || 0) - (b.sort || 0) || a.price - b.price);
}
/* 會籍狀態（等等空間 POS 會員清單用）：pending＝已購買待首次進場、active＝有效、expired＝已到期 */
function entitlementState(e, now = new Date()) {
  if (!e) return 'expired';
  if (!e.activated_at && e.plan !== 'founding') return 'pending';
  const s = e.starts_at ? new Date(e.starts_at) : null, t = e.ends_at ? new Date(e.ends_at) : null;
  if (s && now < s) return 'pending';
  return t && now >= t ? 'expired' : 'active';
}
const maskPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 6 ? d.slice(0, -6).replace(/^886/, '0') + '***' + d.slice(-3) : ''; };

/* 不指定席號的入場單：取 E01–E99 最小空號 */
function nextEntryNo(used) {
  for (let i = 1; i <= 99; i++) { const t = 'E' + String(i).padStart(2, '0'); if (!used.has(t)) return t; }
  return null;
}
/* 目前在場人數（已入場未離場＋待收款） */
function occupancy(sessions) {
  return (sessions || []).filter(s => isSpaceSession(s) && !s.space.out_at && !(s.space.prepaid === true && !s.space.in_at)).reduce((a, s) => a + headcountOf(s.space, s.items), 0);
}

/* 今日統計（營業日內入場的單）：人次、平均停留（已離場）、超時收入（已收）、空間方案收入 */
function summary(sessions, isToday) {
  const rows = (sessions || []).filter(s => isSpaceSession(s) && s.space.in_at && isToday(s.space.in_at));
  const left = rows.filter(s => s.space.out_at);
  const stay = left.map(s => minutesOf(new Date(s.space.out_at) - new Date(s.space.in_at)));
  const paidOf = (s, role) => liveLines(s.items).filter(l => l.order_id && (!role || l.space_role === role)).reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  return {
    entries: rows.length,
    people: rows.reduce((a, s) => a + headcountOf(s.space, s.items), 0),
    inside: occupancy(sessions),
    avg_stay_min: stay.length ? Math.round(stay.reduce((a, b) => a + b, 0) / stay.length) : null,
    overtime_amount: rows.reduce((a, s) => a + paidOf(s, 'overtime'), 0),
    overtime_entries: rows.filter(s => paidOf(s, 'overtime') > 0).length,
    plan_amount: rows.reduce((a, s) => a + paidOf(s, 'plan'), 0),
  };
}

/* 一次性開機遷移用（server.js menu_space_plans_v1）：約書旅既有方案補計時欄位；等等空間新增方案（KK 11/15：4h 200、12h 500、超時 50／時、會員入場 0 元不限時） */
const REST_PLAN_TAGS = {
  m_rest_space_lounge_entry_1_hour: 60, m_rest_space_lounge_entry_4_hours: 240, m_rest_space_lounge_entry_8_hours: 480,
  m_rest_space_quiet_room_1_hour: 60, m_rest_space_quiet_room_4_hours: 240, m_rest_space_quiet_room_8_hours: 480,
};
const REST_OVERTIME_IDS = ['m_rest_space_lounge_overtime_1_hour', 'm_rest_space_quiet_room_overtime_1_hour'];
const STAY_ITEMS = [
  { id: 'm_stay_space_entry_4_hours', venue: 'STAY', cat: 'SPACE', zh: '空間使用費｜等等空間 4 小時', en: 'Stay Square · 4 hours', ja: '等等空間・4時間', ko: 'Stay Square · 4시간', price: 200, note: '3F 共享空間座位、Wi‑Fi、電源、自助吧。超時 15 分鐘內不收費，之後每小時 NT$50。', space_role: 'plan', space_minutes: 240, pos_only: true, published: true, sort: 10 },
  { id: 'm_stay_space_entry_12_hours', venue: 'STAY', cat: 'SPACE', zh: '空間使用費｜等等空間 12 小時', en: 'Stay Square · 12 hours', ja: '等等空間・12時間', ko: 'Stay Square · 12시간', price: 500, note: '3F 共享空間座位、Wi‑Fi、電源、自助吧。超時 15 分鐘內不收費，之後每小時 NT$50。', space_role: 'plan', space_minutes: 720, pos_only: true, published: true, sort: 20 },
  { id: 'm_stay_space_overtime_1_hour', venue: 'STAY', cat: 'SPACE', zh: '空間使用費｜等等空間超時 1 小時', en: 'Stay Square overtime · 1 hour', ja: '等等空間・延長1時間', ko: 'Stay Square 연장 · 1시간', price: 50, note: '超時 15 分鐘內不收費；之後每小時以 15 分鐘為界計 1 小時。', space_role: 'overtime', pos_only: true, published: true, sort: 30 },
  { id: 'm_stay_space_member_entry', venue: 'STAY', cat: 'SPACE', zh: '會員入場', en: 'Member entry', ja: 'メンバー入場', ko: '멤버 입장', price: 0, note: '有效會籍會員入場登記（0 元、不限時），用來統計席位使用率。', space_role: 'plan', space_minutes: 0, pos_only: true, published: true, sort: 40 },
];
/* 回傳要寫回的件數（0＝不用寫） */
function planBackfill(items, normalize) {
  let n = 0;
  for (const it of items) {
    if (REST_PLAN_TAGS[it.id] !== undefined && !it.space_role) { it.space_role = 'plan'; it.space_minutes = REST_PLAN_TAGS[it.id]; n++; }
    if (REST_OVERTIME_IDS.includes(it.id) && !it.space_role) { it.space_role = 'overtime'; n++; }
  }
  const have = new Set(items.map(it => it.id));
  for (const raw of STAY_ITEMS) if (!have.has(raw.id)) { items.push(normalize ? normalize(raw) : { ...raw }); n++; }
  return n;
}

module.exports = { onlinePlans, entitlementState, maskPhone, REST_PLAN_TAGS, REST_OVERTIME_IDS, STAY_ITEMS, planBackfill, VENUES, MODES, MODE_LABEL, DEFAULTS, BASE, ENTRY_RE, LEAVE_UNCONFIRMED_MIN, contentKey, normalizeSettings, mergeSettings, overtimeUnits, planLines, planMinutes, headcountOf, checkLimit, overtimeItemFor, isSpaceSession, holdOpen, view, nextEntryNo, occupancy, summary };
