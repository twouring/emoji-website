'use strict';
/* 高管總覽（admin 首頁）：一次看所有品牌的營運狀態，並把「需要有人處理」的事挑出來。
   純函式：server.js 的 GET /api/admin/exec 把資料撈好丟進 build()，這裡只做判斷，不碰 DB，可單測。
   等級：high＝現在就要處理（錢、出餐、資料同步壞掉）；mid＝今天要處理；low＝留意即可。 */
require('../public/menu-lib.js');   // 無 window 時掛到 globalThis.MenuLib（同 lib/table-orders.js）
const MenuLib = globalThis.MenuLib;

const VENUES = ['CAFE', 'BAR'];
const LABEL = { CAFE: '在咖啡', BAR: '三點水', TTH: '言文字' };
const LEVELS = { high: 0, mid: 1, low: 2 };
const MIN = 60e3, HOUR = 3600e3;
/* 門檻集中在這裡，調整時改這份就好 */
const T = {
  ticketMid: 20, ticketHigh: 40,          // 送單未出餐（分）
  printStuck: 3,                          // 出餐單沒被平板領走（分）＝印表機或平板離線
  callWait: 3,                            // 呼叫服務沒人處理（分）
  tableMid: 4, tableHigh: 8,              // 開桌未清（小時）
  emptyTable: 2,                          // 開了桌但一直沒點（小時）
  clockOpen: 14,                          // 上班打卡後超過幾小時沒下班＝忘了打卡
  shiftLate: 15,                          // 班表開始後幾分鐘還沒打卡
  syncStale: 2,                           // 對帳同步多久沒成功（小時）
  quietHours: 3,                          // 開店幾小時仍零營收
  feedbackDays: 3, feedbackLow: 2,        // 近幾天、幾星以下的回饋
};
/* 營業時段（台北時間，與 MenuLib.activeVenue 一致）；close 跨日用 27（＝翌日 03:00） */
const HOURS = { CAFE: { open: 8, close: 17 }, BAR: { open: 17, close: 27 } };

const n = v => Number(v) || 0;
const ms = v => (v == null || v === '' ? NaN : +new Date(v));
const fmt = v => 'NT$' + Math.round(n(v)).toLocaleString('en-US');
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
const mins = d => Math.floor(d / MIN);
const dur = d => { const m = mins(d); return m < 60 ? `${m} 分鐘` : m < 48 * 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${Math.floor(m / 1440)} 天`; };
const dayStr = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
const addDays = (day, k) => new Date(Date.parse(day + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
/* 營業日某個「時:分」的實際時間；03:00 前算翌日（三點水跨日） */
function atBusinessTime(day, hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return NaN;
  const base = Date.parse(day + 'T00:00:00+08:00');
  return base + ((h < 3 ? h + 24 : h) * 60 + (n(m))) * MIN;
}
const taipeiHour = now => { const d = new Date(now); return (d.getUTCHours() + 8) % 24 + d.getUTCMinutes() / 60; };
/* 現在距離該店今天開門幾小時（未開門或已打烊回 null） */
function hoursOpen(venue, now) {
  if (MenuLib.activeVenue(now) !== venue) return null;
  let h = taipeiHour(now); if (venue === 'BAR' && h < 3) h += 24;
  return h - HOURS[venue].open;
}
/* 一張單／一桌屬於哪家店：看品項的 venue（點歌、打賞、商店不算），沒有就用開桌時段 */
function venueOfLines(lines, fallbackAt) {
  const c = {};
  for (const l of lines || []) if (l && VENUES.includes(l.venue) && !l.song && !l.tip && l.cat !== 'SHOP') c[l.venue] = (c[l.venue] || 0) + 1;
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : (MenuLib.activeVenue(fallbackAt) || 'CAFE');
}

/* 營收：salesSummary 由呼叫端注入（lib/table-orders.js），避免這支依賴整個點餐模組 */
function salesOf(orders, venue, salesSummary, from, to) {
  const list = (orders || []).filter(o => { const t = ms(o.paid_at); return t >= from && t < to; });
  const s = salesSummary(list, { venues: [venue], now: new Date(from) });
  return { amount: n(s.amount), orders: n(s.orders), collected: n(s.collected), voided: n(s.voided), void_amount: n(s.void_amount), by_method: s.by_method || {} };
}

function build(src, { now = Date.now(), salesSummary, posBase = 'https://pos.emoji.tw' } = {}) {
  if (typeof salesSummary !== 'function') throw new Error('salesSummary required');
  now = +new Date(now);
  const day = MenuLib.businessDay(now), yday = addDays(day, -1);
  const dayFrom = Date.parse(day + 'T03:00:00+08:00');
  const issues = [], checks = [];
  const pos = p => posBase + p;
  const add = (level, area, brand, title, detail = '', href = '') => issues.push({ level, area, brand: brand || 'TTH', brand_label: LABEL[brand || 'TTH'], title, detail, href });
  const ok = (area, label) => checks.push({ area, label });

  // 讀取失敗的資料來源：照實列出，不要讓總覽看起來「一切正常」
  for (const [k, msg] of Object.entries(src.failed || {})) add('low', 'system', 'TTH', `${k}讀不到資料`, String(msg || '').slice(0, 120));

  /* ---------- 營收（今天、昨天、上週同一天同時段） ---------- */
  const orders = src.orders || [];
  const brands = VENUES.map(v => {
    const today = salesOf(orders, v, salesSummary, dayFrom, now + 1);
    const yest = salesOf(orders, v, salesSummary, dayFrom - 864e5, dayFrom);
    const lastWeek = salesOf(orders, v, salesSummary, dayFrom - 7 * 864e5, now - 7 * 864e5 + 1);
    return { venue: v, label: LABEL[v], active: MenuLib.activeVenue(now) === v, hours_open: hoursOpen(v, now), today, yesterday: yest, last_week: lastWeek };
  });

  /* ---------- 帳本（開關帳、短溢） ---------- */
  const regs = (src.registers || []).map(r => ({ ...r, day: dayStr(r.day) }));
  for (const b of brands) {
    const mine = regs.filter(r => r.venue === b.venue && r.day === day).sort((a, c) => ms(a.opened_at) - ms(c.opened_at));
    const cur = mine[mine.length - 1] || null;
    b.register = cur ? { state: cur.closed_at ? 'closed' : 'open', opened_at: cur.opened_at, closed_at: cur.closed_at || null, diff: cur.closed_at ? n(cur.diff) : null, count: mine.length } : { state: 'none', count: 0 };
    // 打烊後還開著
    const closeAt = Date.parse(day + 'T00:00:00+08:00') + HOURS[b.venue].close * HOUR;
    if (cur && !cur.closed_at && now > closeAt + 30 * MIN) add('mid', 'register', b.venue, `${b.label}打烊後還沒關帳`, `開帳 ${hm(cur.opened_at)}，已打烊 ${dur(now - closeAt)}`, pos('/pos/sales'));
    // 有營收卻沒開帳
    if (!cur && b.today.orders > 0) add('mid', 'register', b.venue, `${b.label}今天有營收但沒開帳`, `${b.today.orders} 單 ${fmt(b.today.collected)}，現金無法對帳`, pos('/pos/sales'));
  }
  // 前幾天的帳還開著（比打烊沒關更嚴重：跨日的營收會算不清）
  for (const r of regs.filter(r => !r.closed_at && r.day < day)) add('high', 'register', r.venue, `${LABEL[r.venue] || r.venue} ${md(r.day)} 的帳還沒關`, `開帳 ${md(r.day)} ${hm(r.opened_at)}，跨營業日未關會讓日結對不上`, pos('/pos/sales'));
  // 今天、昨天關帳短溢
  for (const r of regs.filter(r => r.closed_at && n(r.diff) !== 0 && (r.day === day || r.day === yday))) {
    // 有寫原因（如「開錯帳」）＝店長已說明，降為留意；沒寫原因才依金額升級
    add(String(r.close_note || '').trim() ? 'low' : Math.abs(n(r.diff)) >= 500 ? 'high' : 'mid', 'register', r.venue, `${LABEL[r.venue] || r.venue} ${r.day === day ? '今天' : '昨天'}關帳現金${n(r.diff) < 0 ? '短少' : '多出'} ${fmt(Math.abs(n(r.diff)))}`,
      `應有 ${fmt(r.expected_cash)}、點鈔 ${fmt(r.counted_cash)}${r.close_note ? `；備註：${String(r.close_note).slice(0, 60)}` : '；沒有填寫原因'}`, pos('/pos/sales'));
  }
  if (!issues.some(i => i.area === 'register')) ok('register', '開關帳與現金短溢');

  /* ---------- 營收異常 ---------- */
  for (const b of brands) {
    if (b.hours_open != null && b.hours_open >= T.quietHours && b.today.orders === 0) add('mid', 'sales', b.venue, `${b.label}開店 ${Math.floor(b.hours_open)} 小時還沒有營收`, '確認 POS 有沒有在登記，或店是否照常營業', pos('/pos'));
    if (b.today.voided > 0) add('low', 'sales', b.venue, `${b.label}今天作廢 ${b.today.voided} 筆`, `共 ${fmt(b.today.void_amount)}，可到查單看作廢原因`, pos('/pos/history'));
  }
  if (!issues.some(i => i.area === 'sales')) ok('sales', '營收與作廢');

  /* ---------- 金流對帳（LINE Pay、中信刷卡） ---------- */
  for (const [key, name] of [['linepay', 'LINE Pay'], ['ctbc', '中信刷卡']]) {
    const r = src.recon?.[key];
    if (!r || !r.configured) continue;
    if (r.sync_error) add('high', 'payment', 'TTH', `${name}對帳同步失敗`, String(r.sync_error).slice(0, 140), pos('/pos/sales'));
    else if (r.synced_at && now - ms(r.synced_at) > T.syncStale * HOUR) add('mid', 'payment', 'TTH', `${name}對帳 ${dur(now - ms(r.synced_at))}沒有更新`, '排程可能停了，實收資料不是最新', pos('/pos/sales'));
    for (const [d, label, level] of [[yday, '昨天', 'mid'], [day, '今天', 'low']]) {
      const x = r.days?.[d]; if (!x) continue;
      for (const v of VENUES) {
        const bv = x.by_venue?.[v]; if (!bv || !bv.diff) continue;
        add(level, 'payment', v, `${LABEL[v]}${label}${name}對帳差 ${signed(bv.diff)}`,
          `POS 登記 ${fmt(bv.pos?.amount)}、${name}實收 ${fmt((bv.linepay || bv.ctbc || {}).amount)}${level === 'low' ? '（今天的同步每 5–15 分鐘一次，可能還沒跟上）' : '；可能登錯付款方式或漏登'}`, pos('/pos/sales'));
      }
    }
  }
  if (!issues.some(i => i.area === 'payment')) ok('payment', 'LINE Pay／中信刷卡對帳');

  /* ---------- 現場：開桌、出餐、印單、呼叫 ---------- */
  const sessions = src.sessions || [];
  for (const b of brands) b.tables = { open: 0, unpaid_amount: 0 };
  for (const s of sessions) {
    const lines = Array.isArray(s.items) ? s.items : [];
    const unpaid = lines.filter(l => !l.order_id && !l.cancelled);
    const amount = unpaid.reduce((a, l) => a + n(l.price) * n(l.qty), 0);
    const v = venueOfLines(lines, s.created_at), age = now - ms(s.created_at);
    const b = brands.find(x => x.venue === v); if (b) { b.tables.open++; b.tables.unpaid_amount += amount; }
    const table = /^W\d/.test(s.table_no) ? `外帶 ${s.table_no}` : `${s.table_no} 桌`;
    if (amount > 0 && age > T.tableHigh * HOUR) add('high', 'floor', v, `${table}開桌 ${dur(age)}還有 ${fmt(amount)} 沒結`, '客人可能已離開沒結帳，或忘了清桌', pos('/pos/table/' + encodeURIComponent(s.table_no)));
    else if (amount > 0 && age > T.tableMid * HOUR) add('mid', 'floor', v, `${table}開桌 ${dur(age)}還有 ${fmt(amount)} 沒結`, '確認客人是否還在', pos('/pos/table/' + encodeURIComponent(s.table_no)));
    else if (!lines.length && age > T.emptyTable * HOUR) add('low', 'floor', v, `${table}開桌 ${dur(age)}都沒點餐`, '可能是開錯桌或忘了清桌', pos('/pos/table/' + encodeURIComponent(s.table_no)));
    // 送單未出餐（以送單時間計；同一張單只報一次）
    const tickets = {};
    for (const l of lines) if (l.ticket && l.placed_at && !l.served_at && !l.order_id && !l.cancelled && !l.song && !l.tip) {
      const t = tickets[l.ticket] || (tickets[l.ticket] = { at: ms(l.placed_at), n: 0 }); t.n += n(l.qty) || 1; t.at = Math.min(t.at, ms(l.placed_at));
    }
    for (const t of Object.values(tickets)) {
      const wait = mins(now - t.at);
      if (wait >= T.ticketMid) add(wait >= T.ticketHigh ? 'high' : 'mid', 'floor', v, `${table}等出餐 ${wait} 分鐘`, `${t.n} 份還沒出（以 POS 有沒有按出餐為準）`, pos('/pos/table/' + encodeURIComponent(s.table_no)));
    }
  }
  const pj = src.print_jobs || {};
  if (n(pj.count) > 0 && pj.oldest && now - ms(pj.oldest) > T.printStuck * MIN) add('high', 'floor', 'TTH', `${pj.count} 張出餐單沒印出來`, `最早一張已等 ${dur(now - ms(pj.oldest))}；確認 mPOP 印表機與 POS 平板有開著`, pos('/pos'));
  for (const c of src.service_calls || []) {
    const wait = now - ms(c.at);
    if (!c.done_at && wait > T.callWait * MIN) add('mid', 'floor', 'TTH', `${c.table} 桌呼叫${c.kind_label || '服務'}等了 ${dur(wait)}`, c.note || '', pos('/pos'));
  }
  for (const [v, p] of Object.entries(src.pause || {})) if (p && p.paused && VENUES.includes(v)) add('mid', 'floor', v, `${LABEL[v]}桌邊點餐暫停中`, p.message || '客人掃碼無法點餐', pos('/pos'));
  if (!issues.some(i => i.area === 'floor')) ok('floor', '開桌、出餐、印單、呼叫服務');

  /* ---------- 人力：在班、忘記下班打卡、沒來打卡 ---------- */
  const working = src.working || [];
  for (const b of brands) b.staff = [];
  const onDuty = [];
  for (const w of working) {
    const age = now - ms(w.clock_in);
    if (age > T.clockOpen * HOUR) add('mid', 'staff', 'TTH', `${w.name} 從 ${md(w.clock_in)} ${hm(w.clock_in)} 上班後沒打下班卡`, `已過 ${dur(age)}，工時會算錯；請到排班打卡修正出勤`, '/admin/staff');
    else onDuty.push(w.name);
  }
  const shifts = (src.shifts || []).filter(s => dayStr(s.day || day) === day);
  const punched = new Set((src.attendance_today || []).map(a => a.staff_id));
  for (const s of shifts) {
    const start = atBusinessTime(day, s.start_time), end = atBusinessTime(day, s.end_time);
    const b = brands.find(x => x.venue === s.venue);
    if (b && now >= start && now < (end > start ? end : end + 864e5)) b.staff.push({ name: s.name, start: s.start_time, end: s.end_time, in: punched.has(s.staff_id) });
    if (!punched.has(s.staff_id) && now - start > T.shiftLate * MIN) add('mid', 'staff', s.venue, `${s.name} ${s.start_time} 的班還沒打卡`, `${LABEL[s.venue] || ''} ${s.start_time}–${s.end_time}；遲到、請假或忘了打卡`, '/admin/staff');
  }
  if (!issues.some(i => i.area === 'staff')) ok('staff', '出勤與打卡');

  /* ---------- 庫存 ---------- */
  const inv = (src.inventory || []).filter(i => i.active !== false);
  const neg = inv.filter(i => n(i.qty) < 0).sort((a, b) => n(a.qty) - n(b.qty));
  const low = inv.filter(i => n(i.safety_qty) > 0 && n(i.qty) >= 0 && n(i.qty) < n(i.safety_qty));
  const list = arr => arr.slice(0, 5).map(i => `${i.name} ${+n(i.qty).toFixed(1)}${i.unit || ''}`).join('、') + (arr.length > 5 ? ` 等 ${arr.length} 項` : '');
  if (neg.length) add('mid', 'inventory', 'TTH', `${neg.length} 項庫存是負數`, `${list(neg)}；多半是進貨沒登記或配方用量設錯，成本會失真`, pos('/pos/inventory'));
  if (low.length) add('mid', 'inventory', 'TTH', `${low.length} 項低於安全庫存`, list(low), pos('/pos/inventory'));
  if (!neg.length && !low.length) ok('inventory', '庫存水位');
  const soldOut = {};
  for (const it of src.menu_items || []) if (it.published && MenuLib.soldOutToday(it, now) && VENUES.includes(it.venue)) (soldOut[it.venue] ||= []).push(it.zh);
  for (const b of brands) b.sold_out = soldOut[b.venue] || [];

  /* ---------- 訂位 ---------- */
  const todayCal = new Date(now + 8 * HOUR).toISOString().slice(0, 10);
  const resv = (src.reservations || []).filter(r => !['cancelled'].includes(r.status));
  const pendingResv = resv.filter(r => r.status === 'new' && dayStr(r.reserve_date) >= todayCal);
  if (pendingResv.length) add('mid', 'reservation', 'TTH', `${pendingResv.length} 筆訂位還沒確認`, pendingResv.slice(0, 3).map(r => `${md(r.reserve_date)} ${r.reserve_time} ${r.party_size} 位`).join('、'), pos('/pos/reservations'));
  else ok('reservation', '訂位確認');
  const resvToday = resv.filter(r => dayStr(r.reserve_date) === todayCal && r.status !== 'no_show');
  for (const b of brands) { const mine = resvToday.filter(r => r.venue === b.venue); b.reservations = { count: mine.length, people: mine.reduce((a, r) => a + n(r.party_size), 0) }; }

  /* ---------- 活動、場地申請 ---------- */
  const apps = src.applications_pending || [];
  if (apps.length) add('mid', 'events', 'TTH', `${apps.length} 件場地申請待審`, apps.slice(0, 3).map(a => `${a.title}（${md(a.starts_at)}）`).join('、'), '/admin/events/applications');
  const events = (src.events || []).map(e => ({ id: e.id, title: e.title, starts_at: e.starts_at, status: e.status, reg: n(e.reg_count), capacity: n(e.capacity) }))
    .filter(e => ms(e.starts_at) >= now - 3 * HOUR && ms(e.starts_at) <= now + 7 * 864e5).sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
  for (const e of events) if (['草稿', '預告'].includes(e.status) && ms(e.starts_at) - now < 3 * 864e5) add('mid', 'events', 'TTH', `「${e.title}」${md(e.starts_at)} 就要辦，還是${e.status}`, '還不能報名；確認是否要開放', `/admin/events/${encodeURIComponent(e.id)}`);
  if (!issues.some(i => i.area === 'events')) ok('events', '場地申請與近期活動');

  /* ---------- 社群 ---------- */
  const ig = src.ig || {};
  for (const p of ig.errors || []) add('mid', 'social', 'TTH', `IG 貼文發佈失敗：${p.title}`, '到社群經營重新排程或手動發佈', `/admin/social/edit/${encodeURIComponent(p.id)}`);
  if ((ig.stale || []).length) add('low', 'social', 'TTH', `${ig.stale.length} 篇 IG 排程過期沒發`, `最早一篇排在 ${String(ig.stale[0].at || '').slice(5, 10).replace('-', '/')}；超過 24 小時不會自動補發，請改期或封存`, '/admin/social');
  if (!issues.some(i => i.area === 'social')) ok('social', 'IG 排程發佈');

  /* ---------- 客人回饋、找碴 ---------- */
  for (const f of (src.feedback || []).filter(f => f.rating != null && n(f.rating) <= T.feedbackLow).slice(0, 3)) add('mid', 'feedback', 'TTH', `${f.table_no ? f.table_no + ' 桌' : '客人'}給 ${f.rating} 星`, String(f.text || '').slice(0, 80), pos('/pos/feedback'));
  if (n(src.bugs_pending) > 0) add('low', 'feedback', 'TTH', `${src.bugs_pending} 件找碴回報待審`, '審核後會員才會拿到點數', pos('/pos/bugs'));
  if (!issues.some(i => i.area === 'feedback')) ok('feedback', '客人回饋');

  issues.sort((a, b) => LEVELS[a.level] - LEVELS[b.level] || VENUES.indexOf(a.brand) - VENUES.indexOf(b.brand));
  const counts = { high: 0, mid: 0, low: 0 }; for (const i of issues) counts[i.level]++;
  return { generated_at: new Date(now).toISOString(), day, brands, issues, counts, checks, events, on_duty: onDuty };
}

function hm(v) { const t = ms(v); return Number.isFinite(t) ? new Date(t + 8 * HOUR).toISOString().slice(11, 16) : ''; }
function md(v) { const t = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(v + 'T12:00:00+08:00') : ms(v); if (!Number.isFinite(t)) return ''; const d = new Date(t + 8 * HOUR); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }

module.exports = { build, venueOfLines, atBusinessTime, hoursOpen, T, LABEL, VENUES };
