/* 排班與打卡（對照 iCHEF 員工打卡／打卡紀錄報表）：
 * - 員工不綁登入帳號：每位員工一組不重複的 4 位數識別碼，POS 平板由品牌管理員登入，打卡時輸入識別碼辨識「誰」。
 * - 排班 ＝ 員工 × 營業日 × 店別（在咖啡／三點水）× 起訖時間；三點水排到翌日 03:00，凌晨時段算前一個營業日。
 * - 打卡 ＝ 上班開一筆出勤（clock_in）、下班補 clock_out；工時由兩者相減；有排班就順帶記遲到／早退分鐘數。
 * 本檔只做純邏輯（可單測），讀寫 DB 在 server.js。 */
'use strict';

require('../public/menu-lib.js'); // 無 window 時掛到 globalThis.MenuLib
const MenuLib = globalThis.MenuLib;

const VENUES = ['CAFE', 'BAR'];
const VENUE_LABEL = { CAFE: '在咖啡', BAR: '三點水' };
const DEFAULT_HOURS = { CAFE: ['08:00', '17:00'], BAR: ['17:00', '03:00'] };
const MAX_SHIFT_HOURS = 16;          // 超過視為忘了打下班卡
const MAX_RANGE_DAYS = 93;           // 報表一次最多查 93 天（同 iCHEF 建議）
const PIN_RE = /^\d{4}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
const err = (msg, status = 400) => Object.assign(Error(msg), { status });
const dayStr = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10);
const iso = v => new Date(v).toISOString();
const label = v => VENUE_LABEL[v] || v;

/* 店別清單：陣列或逗號字串 → 只留有效品牌；own（子帳號的品牌）有給時不得超出；空＝null＝兩店都可 */
function parseVenues(v, own) {
  const list = (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim().toUpperCase()).filter(x => VENUES.includes(x));
  const uniq = [...new Set(list)];
  if (Array.isArray(own) && own.length) {
    if (uniq.some(x => !own.includes(x))) throw err('只能替自己店別的員工設定。', 403);
    return uniq.length ? uniq : own.slice();
  }
  return uniq.length && uniq.length < VENUES.length ? uniq : null;
}
/* 子帳號看得到的員工：店別為空（兩店）或與自己品牌有交集 */
function staffVisible(staff, venues) {
  return !venues || !staff.venues || staff.venues.some(v => venues.includes(v));
}
/* 打卡／排班的店別：必填、須有效；子帳號只能用自己的 */
function venueOf(requested, own) {
  const v = String(requested || '').toUpperCase();
  if (!VENUES.includes(v)) throw err('請選擇店別：在咖啡或三點水。');
  if (Array.isArray(own) && own.length && !own.includes(v)) throw err('只能操作自己店別。', 403);
  return v;
}

/* 新增／編輯員工：name 必填；pin 選填（不填由系統抽一組）；venues 空＝兩店；existing 有給時為部分更新 */
function staffInput(body, { own, existing } = {}) {
  const b = body || {};
  const name = 'name' in b || !existing ? cleanText(b.name, 40) : existing.name;
  if (!name) throw err('請填寫員工姓名。');
  let pin;
  if (b.pin !== undefined && b.pin !== null && String(b.pin) !== '') {
    pin = String(b.pin).trim();
    if (!PIN_RE.test(pin)) throw err('識別碼須為 4 位數字。');
  }
  const venues = 'venues' in b || !existing ? parseVenues(b.venues, own) : existing.venues;
  const role = 'role' in b || !existing ? cleanText(b.role, 20) : existing.role || '';
  const note = 'note' in b || !existing ? cleanText(b.note, 120) : existing.note || '';
  const active = 'active' in b ? b.active !== false && b.active !== 'false' : existing ? existing.active !== false : true;
  return { name, pin, venues, role, note, active };
}
/* 抽一組還沒人用的 4 位數識別碼（避開 0000／1234 這類一眼猜到的） */
function randomPin(taken, rnd = Math.random) {
  const used = new Set(taken || []);
  const weak = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '1212']);
  for (let i = 0; i < 200; i++) {
    const p = String(Math.floor(rnd() * 10000)).padStart(4, '0');
    if (!used.has(p) && !weak.has(p)) return p;
  }
  throw err('識別碼已用完，請停用離職員工後再試。', 409);
}

/* 排班輸入：員工、營業日、店別、起訖（HH:MM）；結束 ≤ 開始視為跨日（三點水 17:00–03:00） */
function shiftInput(body, { own } = {}) {
  const b = body || {};
  const staff_id = cleanText(b.staff_id, 32);
  if (!staff_id) throw err('請選擇員工。');
  const day = cleanText(b.day, 10);
  if (!DAY_RE.test(day)) throw err('請選擇營業日。');
  const venue = venueOf(b.venue, own);
  const start = cleanText(b.start, 5), end = cleanText(b.end, 5);
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) throw err('起訖時間請用 HH:MM。');
  if (start === end) throw err('結束時間不能等於開始時間。');
  const minutes = shiftMinutes(start, end);
  if (minutes > MAX_SHIFT_HOURS * 60) throw err(`一班不能超過 ${MAX_SHIFT_HOURS} 小時。`);
  return { staff_id, day, venue, start, end, minutes, note: cleanText(b.note, 80) };
}
function shiftMinutes(start, end) {
  const m = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const d = m(end) - m(start);
  return d > 0 ? d : d + 1440;
}
/* 排班的實際時間（台北）：營業日 D 的 02:00 其實是日曆 D+1 的凌晨；結束用分鐘數加回去 */
function shiftBounds(day, start, end) {
  const from = new Date(`${dayStr(day)}T${start}:00+08:00`);
  if (Number(start.slice(0, 2)) < 3) from.setTime(+from + 86400e3);
  return { from, to: new Date(+from + shiftMinutes(start, end) * 60e3) };
}
/* 同一位員工時間重疊的班不能排（換日曆日的也算） */
function shiftConflicts(input, others, exceptId) {
  const a = shiftBounds(input.day, input.start, input.end);
  return (others || []).filter(s => s.id !== exceptId && s.staff_id === input.staff_id).find(s => {
    const b = shiftBounds(s.day, s.start_time || s.start, s.end_time || s.end);
    return a.from < b.to && b.from < a.to;
  }) || null;
}
/* 週：以週一為首（排班表一次看 7 天） */
function weekOf(day) {
  const d = new Date(dayStr(day) + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 週一＝0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(day, n) { const d = new Date(dayStr(day) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekDays(monday) { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
/* 查詢區間：預設最近 7 個營業日；超過 93 天就從結束日往前截 */
function dateRange(from, to, { now, defaultDays = 7 } = {}) {
  const today = MenuLib.businessDay(now);
  let t = DAY_RE.test(String(to || '')) ? String(to) : today;
  let f = DAY_RE.test(String(from || '')) ? String(from) : addDays(t, -(defaultDays - 1));
  if (f > t) [f, t] = [t, f];
  const span = Math.round((new Date(t + 'T12:00:00Z') - new Date(f + 'T12:00:00Z')) / 86400e3) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
/* 打卡：in＝上班（已在班且未超過 16 小時就擋）、out＝下班（沒上班卡就擋）。有同日同店別的排班就配對並算遲到／早退。 */
function punch({ type, staff, venue, open, shifts, now = Date.now() }) {
  const t = String(type || '');
  if (!['in', 'out'].includes(t)) throw err('請選擇上班或下班。');
  if (!staff) throw err('識別碼不正確，請再試一次。', 404);
  if (staff.active === false) throw err(`${staff.name} 已停用，請聯絡管理員。`, 403);
  if (staff.venues && !staff.venues.includes(venue)) throw err(`${staff.name} 沒有排在${label(venue)}，請切換店別或請管理員調整。`, 403);
  const at = new Date(now);
  const day = MenuLib.businessDay(at);
  if (t === 'in') {
    if (open && minutesBetween(open.clock_in, at) < MAX_SHIFT_HOURS * 60) throw err(`${staff.name} 已在上班中（${clock(open.clock_in)} 上班），要下班請按「下班」。`, 409);
    // 配對排班：今天這個店別、開始時間離現在最近的一班
    const todays = (shifts || []).filter(s => s.staff_id === staff.id && dayStr(s.day) === day && s.venue === venue)
      .map(s => ({ s, dist: Math.abs(shiftBounds(s.day, s.start_time || s.start, s.end_time || s.end).from - at) })).sort((a, b) => a.dist - b.dist);
    const shift = todays[0]?.s || null;
    const late = shift ? Math.max(0, Math.round((at - shiftBounds(shift.day, shift.start_time || shift.start, shift.end_time || shift.end).from) / 60000)) : 0;
    return { action: 'in', day, at: at.toISOString(), venue, shift_id: shift?.id || null, shift: shift ? { start: shift.start_time || shift.start, end: shift.end_time || shift.end } : null, late_minutes: late,
      forgot_out: !!open, message: `${staff.name} 上班 ${clock(at)}・${label(venue)}${shift ? late ? `（排班 ${shift.start_time || shift.start}，晚 ${late} 分）` : `（排班 ${shift.start_time || shift.start}）` : ''}${open ? '。上一班沒打下班卡，請管理員補登' : ''}` };
  }
  if (!open) throw err(`${staff.name} 今天還沒打上班卡。`, 409);
  const minutes = minutesBetween(open.clock_in, at);
  const shift = (shifts || []).find(s => s.id === open.shift_id) || null;
  const early = shift ? Math.max(0, Math.round((shiftBounds(shift.day, shift.start_time || shift.start, shift.end_time || shift.end).to - at) / 60000)) : 0;
  return { action: 'out', day: dayStr(open.day), at: at.toISOString(), venue: open.venue, id: open.id, minutes, early_minutes: early, shift: shift ? { start: shift.start_time || shift.start, end: shift.end_time || shift.end } : null,
    over: minutes > MAX_SHIFT_HOURS * 60, message: `${staff.name} 下班 ${clock(at)}・本班 ${hoursText(minutes)}${early ? `（排班到 ${shift.end_time || shift.end}，早 ${early} 分）` : ''}${minutes > MAX_SHIFT_HOURS * 60 ? '。超過 16 小時，請管理員確認' : ''}` };
}
/* 管理員修正出勤：改上班／下班時間（ISO）、備註；下班須晚於上班且不超過 24 小時 */
function attendanceFix(body, row) {
  const b = body || {};
  const parse = (v, name) => { if (v === undefined) return undefined; if (v === null || v === '') return null; const d = new Date(v); if (isNaN(d)) throw err(`${name}時間格式不正確。`); return d.toISOString(); };
  const clock_in = parse(b.clock_in, '上班') ?? iso(row.clock_in);
  if (!clock_in) throw err('上班時間必填。');
  const clock_out = b.clock_out === undefined ? (row.clock_out ? iso(row.clock_out) : null) : parse(b.clock_out, '下班');
  if (clock_out !== null && new Date(clock_out) <= new Date(clock_in)) throw err('下班時間要晚於上班時間。');
  if (clock_out !== null && minutesBetween(clock_in, clock_out) > 24 * 60) throw err('一班不能超過 24 小時，請拆成兩筆。');
  const note = 'note' in b ? cleanText(b.note, 120) : row.note || '';
  return { clock_in, clock_out, minutes: clock_out ? minutesBetween(clock_in, clock_out) : null, note, day: MenuLib.businessDay(clock_in) };
}

const pad = n => String(n).padStart(2, '0');
const clock = v => { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' }); };
const stamp = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'); };
const hoursText = m => m == null ? '—' : `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}`;
const hoursDecimal = m => Math.round((Number(m) || 0) / 60 * 100) / 100;

/* 出勤彙總：每位員工的班數、總工時（只算已下班的）、遲到次數、漏打下班卡筆數 */
function attendanceSummary(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const s = by.get(r.staff_id) || { staff_id: r.staff_id, name: r.name, shifts: 0, minutes: 0, late: 0, open: 0, days: new Set() };
    s.shifts++; s.days.add(dayStr(r.day));
    if (r.clock_out) s.minutes += Number(r.minutes) || minutesBetween(r.clock_in, r.clock_out); else s.open++;
    if (Number(r.late_minutes) > 0) s.late++;
    by.set(r.staff_id, s);
  }
  return [...by.values()].map(s => ({ ...s, days: s.days.size, hours: hoursDecimal(s.minutes) })).sort((a, b) => b.minutes - a.minutes);
}
/* CSV：每筆出勤一列＋每人合計；給會計算時薪 */
function attendanceCsv(rows) {
  const out = [['營業日', '員工', '店別', '上班', '下班', '工時（小時）', '排班', '遲到（分）', '早退（分）', '備註']];
  for (const r of rows || []) out.push([dayStr(r.day), r.name, label(r.venue), stamp(r.clock_in), r.clock_out ? stamp(r.clock_out) : '（未打下班卡）', r.clock_out ? hoursDecimal(Number(r.minutes) || minutesBetween(r.clock_in, r.clock_out)) : '', r.shift_start ? `${r.shift_start}–${r.shift_end}` : '', Number(r.late_minutes) || 0, Number(r.early_minutes) || 0, r.note || '']);
  out.push([]);
  out.push(['員工', '班數', '總工時（小時）', '遲到次數', '未打下班卡']);
  for (const s of attendanceSummary(rows)) out.push([s.name, s.shifts, s.hours, s.late, s.open]);
  return out;
}
/* 排班表 CSV（整週）：給店長貼群組 */
function shiftsCsv(shifts) {
  const out = [['營業日', '員工', '店別', '開始', '結束', '時數', '備註']];
  for (const s of shifts || []) out.push([dayStr(s.day), s.name, label(s.venue), s.start_time || s.start, s.end_time || s.end, hoursDecimal(shiftMinutes(s.start_time || s.start, s.end_time || s.end)), s.note || '']);
  return out;
}

module.exports = { VENUES, VENUE_LABEL, DEFAULT_HOURS, MAX_SHIFT_HOURS, MAX_RANGE_DAYS, parseVenues, staffVisible, venueOf, staffInput, randomPin, shiftInput, shiftMinutes, shiftBounds, shiftConflicts, weekOf, addDays, weekDays, dateRange, punch, attendanceFix, attendanceSummary, attendanceCsv, shiftsCsv, hoursText, hoursDecimal, minutesBetween, clock, stamp };
