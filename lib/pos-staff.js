/* 排班與打卡（對照 iCHEF 員工打卡／打卡紀錄報表）：
 * - 員工不綁登入帳號：每位員工一組不重複的 4 位數識別碼，POS 平板由品牌管理員登入，打卡時輸入識別碼辨識「誰」。
 * - 排班仍可分在咖啡／三點水時段；打卡與出勤報表則統一屬於言文字，不按品牌拆工時。
 * - 打卡 ＝ 上班開一筆出勤（clock_in）、下班補 clock_out；工時由兩者相減；有排班就順帶記遲到／早退分鐘數。
 * 本檔只做純邏輯（可單測），讀寫 DB 在 server.js。 */
'use strict';

require('../public/menu-lib.js'); // 無 window 時掛到 globalThis.MenuLib
const MenuLib = globalThis.MenuLib;

const VENUES = ['CAFE', 'BAR'];
const VENUE_LABEL = { CAFE: '在咖啡', BAR: '三點水', TTH: '言文字' };
const ATTENDANCE_VENUE = 'TTH';
const DEFAULT_HOURS = { CAFE: ['08:00', '17:00'], BAR: ['17:00', '03:00'] };
const MAX_SHIFT_HOURS = 16;          // 超過視為忘了打下班卡
const MAX_RANGE_DAYS = 93;           // 報表一次最多查 93 天（同 iCHEF 建議）
/* 勞基法（上線前請熟悉勞動法規的人確認，特別是兼職與變形工時）：
   第 35 條 連續工作 4 小時至少休息 30 分鐘（店內規劃每班休息 1 小時）；第 30 條 每日正常工時 8 小時、每週 40 小時；
   第 32 條 正常＋延長每日 ≤ 12 小時、延長每月 ≤ 46 小時；第 34 條 換班間隔 ≥ 11 小時；第 36 條 每 7 日 1 例假 1 休息日（一週最多上 5 天） */
const LAW = { BREAK_AFTER_MINUTES: 240, MIN_BREAK_MINUTES: 30, PLANNED_BREAK_MINUTES: 60, NORMAL_DAILY_MINUTES: 480, NORMAL_WEEKLY_MINUTES: 2400, MAX_DAILY_MINUTES: 720, MAX_MONTHLY_OT_MINUTES: 2760, REST_BETWEEN_SHIFTS_MINUTES: 660, MAX_WEEKLY_WORKDAYS: 5 };
/* 預設人力需求：每店每天一班一人（後台可改） */
const DEFAULT_STAFFING = [{ venue: 'CAFE', start: '08:00', end: '17:00', headcount: 1 }, { venue: 'BAR', start: '17:00', end: '03:00', headcount: 1 }];
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
/* 休息狀態：breaks = [{ start, end|null }]。回合計休息分鐘、是否休息中、從上班（或上次休息結束）起連續工作幾分鐘、是否該休息了 */
function breakState(breaks, clockIn, now = Date.now(), clockOut = null) {
  const list = Array.isArray(breaks) ? breaks.filter(b => b && b.start) : [];
  const end = clockOut ? new Date(clockOut) : new Date(now);
  let total = 0, open = null;
  for (const b of list) { if (b.end) total += minutesBetween(b.start, b.end); else open = b; }
  if (open) total += minutesBetween(open.start, end);
  const lastEnd = list.filter(b => b.end).map(b => iso(b.end)).sort().at(-1);
  const since = lastEnd && new Date(lastEnd) > new Date(clockIn) ? lastEnd : iso(clockIn);
  const continuous = open ? 0 : minutesBetween(since, end);
  return { break_minutes: total, on_break: !!open, break_since: open ? iso(open.start) : null, continuous_minutes: continuous, needs_break: !open && continuous >= LAW.BREAK_AFTER_MINUTES };
}
/* 打卡：in＝上班（已在班且未超過 16 小時就擋）、out＝下班（沒上班卡就擋；休息中直接下班＝休息算到下班）、
   break_start／break_end＝開始／結束休息（要在班上）。有同日同店別的排班就配對並算遲到／早退。工時＝下班－上班－休息。 */
function punch({ type, staff, venue, open, shifts, now = Date.now() }) {
  const t = String(type || '');
  if (!['in', 'out', 'break_start', 'break_end'].includes(t)) throw err('請選擇上班、下班或休息。');
  if (!staff) throw err('識別碼不正確，請再試一次。', 404);
  if (staff.active === false) throw err(`${staff.name} 已停用，請聯絡管理員。`, 403);
  venue = ATTENDANCE_VENUE;
  if (open) open = { ...open, venue: ATTENDANCE_VENUE };
  const at = new Date(now);
  const day = MenuLib.businessDay(at);
  if (t === 'in') {
    if (open && minutesBetween(open.clock_in, at) < MAX_SHIFT_HOURS * 60) throw err(`${staff.name} 已在上班中（${clock(open.clock_in)} 上班），要下班請按「下班」。`, 409);
    // 配對排班：今天這個店別、開始時間離現在最近的一班
    const todays = (shifts || []).filter(s => s.staff_id === staff.id && dayStr(s.day) === day)
      .map(s => ({ s, dist: Math.abs(shiftBounds(s.day, s.start_time || s.start, s.end_time || s.end).from - at) })).sort((a, b) => a.dist - b.dist);
    const shift = todays[0]?.s || null;
    const late = shift ? Math.max(0, Math.round((at - shiftBounds(shift.day, shift.start_time || shift.start, shift.end_time || shift.end).from) / 60000)) : 0;
    return { action: 'in', day, at: at.toISOString(), venue, shift_id: shift?.id || null, shift: shift ? { start: shift.start_time || shift.start, end: shift.end_time || shift.end } : null, late_minutes: late,
      forgot_out: !!open, message: `${staff.name} 上班 ${clock(at)}${shift ? late ? `（排班 ${shift.start_time || shift.start}，晚 ${late} 分）` : `（排班 ${shift.start_time || shift.start}）` : ''}${open ? '。上一班沒打下班卡，請管理員補登' : ''}` };
  }
  if (!open) throw err(t === 'out' ? `${staff.name} 今天還沒打上班卡。` : `${staff.name} 今天還沒打上班卡，不能休息。`, 409);
  const st = breakState(open.breaks, open.clock_in, at);
  if (t === 'break_start') {
    if (st.on_break) throw err(`${staff.name} 已在休息中（${clock(st.break_since)} 起），要回來上班請按「結束休息」。`, 409);
    const breaks = [...(open.breaks || []), { start: at.toISOString(), end: null }];
    return { action: 'break_start', id: open.id, day: dayStr(open.day), at: at.toISOString(), venue: open.venue, breaks, break_minutes: st.break_minutes,
      message: `${staff.name} 開始休息 ${clock(at)}${st.continuous_minutes ? `・已連續工作 ${hoursText(st.continuous_minutes)}` : ''}` };
  }
  if (t === 'break_end') {
    if (!st.on_break) throw err(`${staff.name} 目前不在休息中。`, 409);
    const thisBreak = minutesBetween(st.break_since, at);
    const breaks = (open.breaks || []).map(b => b.end ? b : { start: b.start, end: at.toISOString() });
    return { action: 'break_end', id: open.id, day: dayStr(open.day), at: at.toISOString(), venue: open.venue, breaks, break_minutes: breakState(breaks, open.clock_in, at).break_minutes,
      message: `${staff.name} 結束休息 ${clock(at)}・這次休息 ${hoursText(thisBreak)}${thisBreak < LAW.MIN_BREAK_MINUTES ? `（未滿 ${LAW.MIN_BREAK_MINUTES} 分，連續工作 4 小時依法應休息至少 30 分鐘）` : ''}` };
  }
  const gross = minutesBetween(open.clock_in, at);
  const breaks = (open.breaks || []).map(b => b.end ? b : { start: b.start, end: at.toISOString() });   // 休息中直接下班：休息算到下班
  const minutes = Math.max(0, gross - st.break_minutes);
  const break_short = gross >= LAW.BREAK_AFTER_MINUTES && st.break_minutes < LAW.MIN_BREAK_MINUTES;
  const shift = (shifts || []).find(s => s.id === open.shift_id) || null;
  const early = shift ? Math.max(0, Math.round((shiftBounds(shift.day, shift.start_time || shift.start, shift.end_time || shift.end).to - at) / 60000)) : 0;
  return { action: 'out', day: dayStr(open.day), at: at.toISOString(), venue: open.venue, id: open.id, minutes, break_minutes: st.break_minutes, breaks, break_short, early_minutes: early, shift: shift ? { start: shift.start_time || shift.start, end: shift.end_time || shift.end } : null,
    over: gross > MAX_SHIFT_HOURS * 60, message: `${staff.name} 下班 ${clock(at)}・本班 ${hoursText(minutes)}${st.break_minutes ? `（休息 ${hoursText(st.break_minutes)}）` : ''}${early ? `（排班到 ${shift.end_time || shift.end}，早 ${early} 分）` : ''}${break_short ? '。本班休息未滿 30 分鐘（勞基法第 35 條），請管理員確認' : ''}${gross > MAX_SHIFT_HOURS * 60 ? '。超過 16 小時，請管理員確認' : ''}` };
}
/* 補打卡（現場人員忘了打卡，用自己的識別碼補登）：不是改別人的紀錄、也不是開放亂填——
   只能補「自己」、只能補「過去」7 天內、一定要寫原因、不能和自己既有的班重疊，單班最長 16 小時；
   紀錄的備註固定帶「補打卡：原因」、修改人記 `補打卡：姓名`，管理員在後台出勤紀錄看得到並可改／刪。
   三種：同時給上班＋下班＝補整班；只給上班＝補上班卡（還在班上）；只給下班＝替沒下班的那筆補下班。
   時間字串 `YYYY-MM-DDTHH:MM`（平板 datetime-local）一律視為台北時間，也收帶時區的 ISO。 */
const MAKEUP_DAYS = 7;
const NAIVE_AT_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/;
function parseAt(v, name) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const d = new Date(NAIVE_AT_RE.test(s) ? s.replace(' ', 'T').replace(NAIVE_AT_RE, (m, a, b, c) => `${a}T${b}${c || ':00'}+08:00`) : s);
  if (isNaN(d)) throw err(`${name}時間格式不正確。`);
  return d;
}
function makeupPunch({ staff, venue, own, body, open, existing, shifts, now = Date.now() }) {
  const b = body || {};
  if (!staff) throw err('識別碼不正確，請再試一次。', 404);
  if (staff.active === false) throw err(`${staff.name} 已停用，請聯絡管理員。`, 403);
  const reason = cleanText(b.reason, 80);
  if (reason.length < 2) throw err('請寫補打卡的原因（例如：忘記打卡、平板當機）。');
  const cin = parseAt(b.clock_in, '上班'), cout = parseAt(b.clock_out, '下班');
  if (!cin && !cout) throw err('請填上班時間或下班時間。');
  venue = ATTENDANCE_VENUE;
  const nowMs = +new Date(now), slack = 60e3;
  const earliest = nowMs - MAKEUP_DAYS * 86400e3;
  for (const [d, n] of [[cin, '上班'], [cout, '下班']]) {
    if (!d) continue;
    if (+d > nowMs + slack) throw err(`${n}時間不能是未來，補打卡只能補已經發生的。`);
    if (+d < earliest) throw err(`只能補 ${MAKEUP_DAYS} 天內的打卡，更早的請找店長在後台修正。`);
  }
  const breakInput = b.break_minutes === undefined || b.break_minutes === null || b.break_minutes === '' ? null : Math.round(Number(b.break_minutes));
  if (breakInput !== null && (!Number.isFinite(breakInput) || breakInput < 0)) throw err('休息分鐘要是 0 以上的整數。');
  const pair = (day, atMs) => (shifts || []).filter(s => s.staff_id === staff.id && dayStr(s.day) === day)
    .map(s => ({ s, dist: Math.abs(shiftBounds(s.day, s.start_time || s.start, s.end_time || s.end).from - atMs) })).sort((x, y) => x.dist - y.dist)[0]?.s || null;
  const sb = s => shiftBounds(s.day, s.start_time || s.start, s.end_time || s.end);
  const note = `補打卡：${reason}`, edited_by = `補打卡：${staff.name}`;

  // 只給下班：替沒下班的那筆補下班
  if (!cin) {
    if (!open) throw err(`${staff.name} 沒有尚未下班的上班卡。若上班也忘了打，請同時填上班與下班時間。`, 409);
    if (+cout <= +new Date(open.clock_in)) throw err(`下班時間要晚於上班時間（${clock(open.clock_in)}）。`);
    const gross = minutesBetween(open.clock_in, cout);
    if (gross > 24 * 60) throw err('這筆上班卡超過 24 小時，請找店長在後台修正。');
    const breaks = (open.breaks || []).map(x => x.end ? x : { start: x.start, end: cout.toISOString() });
    const break_minutes = breakInput ?? breakState(breaks, open.clock_in, cout).break_minutes;
    if (break_minutes > gross) throw err('休息不能比整班時間還長。');
    const shift = (shifts || []).find(s => s.id === open.shift_id) || null;
    const early = shift ? Math.max(0, Math.round((sb(shift).to - cout) / 60000)) : 0;
    const minutes = gross - break_minutes;
    return { mode: 'out', id: open.id, day: dayStr(open.day), venue: open.venue, clock_in: iso(open.clock_in), clock_out: cout.toISOString(), minutes, break_minutes, breaks, early_minutes: early, late_minutes: null, shift_id: shift?.id || null, note, edited_by,
      message: `${staff.name} 補下班 ${stamp(cout)}・本班 ${hoursText(minutes)}${break_minutes ? `（休息 ${hoursText(break_minutes)}）` : ''}` };
  }

  // 有上班時間：新開一筆，不能和自己既有的班（含目前在班上的）重疊
  const end = cout || new Date(nowMs);
  if (cout && +cout <= +cin) throw err('下班時間要晚於上班時間。');
  if (cout && minutesBetween(cin, cout) > MAX_SHIFT_HOURS * 60) throw err(`一班不能超過 ${MAX_SHIFT_HOURS} 小時，請拆成兩筆或找店長。`);
  if (!cout && minutesBetween(cin, nowMs) > MAX_SHIFT_HOURS * 60) throw err(`上班已超過 ${MAX_SHIFT_HOURS} 小時前，請同時補上下班時間。`);
  if (!cout && open) throw err(`${staff.name} 還有一筆沒下班的上班卡（${stamp(open.clock_in)}），請先補下班時間。`, 409);
  const clash = (existing || []).find(r => +new Date(r.clock_in) < +end && +cin < +(r.clock_out ? new Date(r.clock_out) : new Date(nowMs)));
  if (clash) throw err(`和已有的出勤重疊（${stamp(clash.clock_in)}${clash.clock_out ? ' – ' + clock(clash.clock_out) : ' 起上班中'}），請確認時間。`, 409);
  const day = MenuLib.businessDay(cin);
  const shift = pair(day, +cin);
  const late = shift ? Math.max(0, Math.round((cin - sb(shift).from) / 60000)) : 0;
  const base = { day, venue, clock_in: cin.toISOString(), shift_id: shift?.id || null, late_minutes: late, note, edited_by };
  if (!cout) return { ...base, mode: 'in', clock_out: null, minutes: null, break_minutes: 0, breaks: [], early_minutes: 0, message: `${staff.name} 補上班 ${stamp(cin)}（目前上班中，下班時直接打下班卡）` };
  const gross = minutesBetween(cin, cout);
  const break_minutes = breakInput ?? 0;
  if (break_minutes > gross) throw err('休息不能比整班時間還長。');
  const early = shift ? Math.max(0, Math.round((sb(shift).to - cout) / 60000)) : 0;
  const minutes = gross - break_minutes;
  return { ...base, mode: 'both', clock_out: cout.toISOString(), minutes, break_minutes, breaks: [], early_minutes: early,
    break_short: gross >= LAW.BREAK_AFTER_MINUTES && break_minutes < LAW.MIN_BREAK_MINUTES,
    message: `${staff.name} 補打卡 ${stamp(cin)} – ${clock(cout)}・本班 ${hoursText(minutes)}${break_minutes ? `（休息 ${hoursText(break_minutes)}）` : ''}${gross >= LAW.BREAK_AFTER_MINUTES && break_minutes < LAW.MIN_BREAK_MINUTES ? '。休息未滿 30 分鐘（勞基法第 35 條），請管理員確認' : ''}` };
}
/* 管理員修正出勤：改上班／下班時間（ISO）、休息分鐘、備註；下班須晚於上班且不超過 24 小時；工時＝下班－上班－休息 */
function attendanceFix(body, row) {
  const b = body || {};
  const parse = (v, name) => { if (v === undefined) return undefined; if (v === null || v === '') return null; const d = new Date(v); if (isNaN(d)) throw err(`${name}時間格式不正確。`); return d.toISOString(); };
  const clock_in = parse(b.clock_in, '上班') ?? iso(row.clock_in);
  if (!clock_in) throw err('上班時間必填。');
  const clock_out = b.clock_out === undefined ? (row.clock_out ? iso(row.clock_out) : null) : parse(b.clock_out, '下班');
  if (clock_out !== null && new Date(clock_out) <= new Date(clock_in)) throw err('下班時間要晚於上班時間。');
  if (clock_out !== null && minutesBetween(clock_in, clock_out) > 24 * 60) throw err('一班不能超過 24 小時，請拆成兩筆。');
  const break_minutes = b.break_minutes === undefined || b.break_minutes === null || b.break_minutes === '' ? Number(row.break_minutes) || 0 : Math.round(Number(b.break_minutes));
  if (!Number.isFinite(break_minutes) || break_minutes < 0) throw err('休息分鐘要是 0 以上的整數。');
  if (clock_out !== null && break_minutes > minutesBetween(clock_in, clock_out)) throw err('休息不能比整班時間還長。');
  const note = 'note' in b ? cleanText(b.note, 120) : row.note || '';
  return { clock_in, clock_out, break_minutes, minutes: clock_out ? minutesBetween(clock_in, clock_out) - break_minutes : null, note, day: MenuLib.businessDay(clock_in) };
}

/* ===== 排休與自動排班 ===== */
/* 排休輸入：員工、營業日（不可早於今天）、備註 */
function dayOffInput(body, { now } = {}) {
  const b = body || {};
  const staff_id = cleanText(b.staff_id, 32);
  if (!staff_id) throw err('請選擇員工。');
  const day = cleanText(b.day, 10);
  if (!DAY_RE.test(day)) throw err('請選擇日期。');
  if (day < MenuLib.businessDay(now)) throw err('排休只能填今天以後的日期。');
  return { staff_id, day, note: cleanText(b.note, 80) };
}
/* 人力需求輸入：每列 店別、起訖、人數（0–9）；own 有給時只能設自己店別 */
function staffingInput(rows, { own } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length > 20) throw err('人力需求最多 20 列。');
  return list.map(r => {
    const venue = venueOf(r.venue, own);
    const start = cleanText(r.start ?? r.start_time, 5), end = cleanText(r.end ?? r.end_time, 5);
    if (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end) throw err('人力需求的起訖時間請用 HH:MM。');
    if (shiftMinutes(start, end) > MAX_SHIFT_HOURS * 60) throw err(`一班不能超過 ${MAX_SHIFT_HOURS} 小時。`);
    const headcount = Math.round(Number(r.headcount));
    if (!Number.isFinite(headcount) || headcount < 0 || headcount > 9) throw err('人數請填 0–9。');
    return { venue, start, end, headcount };
  });
}
const normalMinutes = (start, end) => Math.min(LAW.NORMAL_DAILY_MINUTES, Math.max(0, shiftMinutes(start, end) - LAW.PLANNED_BREAK_MINUTES));
const otMinutes = (start, end) => Math.max(0, shiftMinutes(start, end) - LAW.PLANNED_BREAK_MINUTES - LAW.NORMAL_DAILY_MINUTES);
const sameMonth = (a, b) => dayStr(a).slice(0, 7) === dayStr(b).slice(0, 7);
/* 勞基法檢查：把 { staff_id, day, start, end } 排進 others（同一位員工的既有班）會違反哪些規則；空陣列＝可排。
   手動排班只提醒不擋（管理者負責）；自動排班則只挑完全沒違反的人。 */
function shiftWarnings(input, others, exceptId) {
  // 注意：自動排班暫存的班還沒有 id，不能用 s.id !== exceptId（undefined !== undefined 會把它們全濾掉）
  const mine = (others || []).filter(s => !(exceptId != null && s.id === exceptId) && s.staff_id === input.staff_id).map(s => ({ ...s, start: s.start_time || s.start, end: s.end_time || s.end }));
  const a = shiftBounds(input.day, input.start, input.end);
  const out = [];
  const work = shiftMinutes(input.start, input.end) - LAW.PLANNED_BREAK_MINUTES;
  if (work > LAW.MAX_DAILY_MINUTES) out.push(`一天正常加延長工時不能超過 12 小時（第 32 條）`);
  if (mine.some(s => dayStr(s.day) === dayStr(input.day))) out.push('同一天已有班（一天一班）');
  const gap = LAW.REST_BETWEEN_SHIFTS_MINUTES * 60e3;
  if (mine.some(s => { const b = shiftBounds(s.day, s.start, s.end); return a.from < +b.to + gap && b.from < +a.to + gap; })) out.push('與前後班間隔不足 11 小時（第 34 條）');
  const monday = weekOf(input.day), week = weekDays(monday);
  const weekShifts = mine.filter(s => week.includes(dayStr(s.day)));
  const weekDaysUsed = new Set(weekShifts.map(s => dayStr(s.day)));
  if (!weekDaysUsed.has(dayStr(input.day)) && weekDaysUsed.size >= LAW.MAX_WEEKLY_WORKDAYS) out.push('這週已排 5 天，每 7 天要有 1 例假 1 休息日（第 36 條）');
  if (weekShifts.reduce((n, s) => n + normalMinutes(s.start, s.end), 0) + normalMinutes(input.start, input.end) > LAW.NORMAL_WEEKLY_MINUTES) out.push('這週正常工時超過 40 小時（第 30 條）');
  if (mine.filter(s => sameMonth(s.day, input.day)).reduce((n, s) => n + otMinutes(s.start, s.end), 0) + otMinutes(input.start, input.end) > LAW.MAX_MONTHLY_OT_MINUTES) out.push('這個月延長工時超過 46 小時（第 32 條）');
  return out;
}
/* 自動排班：給一週（週一）、在職員工、排休、既有班（含該月，算加班用）、各店人力需求；回要新增的班與排不滿的警示。
   人選：先挑這週班數少的，再挑總時數少的，同分依姓名（結果可重現）；排不到人就留警示給管理者手動補。既有班算進覆蓋人數，不會重排。 */
function autoSchedule({ monday, staff, daysOff = [], shifts = [], staffing = DEFAULT_STAFFING, venues = null }) {
  const days = weekDays(weekOf(monday));
  const off = new Set((daysOff || []).map(d => `${d.staff_id}|${dayStr(d.day)}`));
  const all = (shifts || []).map(s => ({ ...s, day: dayStr(s.day), start: s.start_time || s.start, end: s.end_time || s.end }));
  const added = [], warnings = [];
  const load = id => { const mine = all.filter(s => s.staff_id === id && days.includes(s.day)); return { days: new Set(mine.map(s => s.day)).size, minutes: mine.reduce((n, s) => n + shiftMinutes(s.start, s.end), 0) }; };
  for (const day of days) for (const slot of staffing || []) {
    if (venues && !venues.includes(slot.venue)) continue;
    const need = Math.max(0, Number(slot.headcount) || 0);
    if (!need) continue;
    const a = shiftBounds(day, slot.start, slot.end);
    let have = all.filter(s => s.day === day && s.venue === slot.venue && (() => { const b = shiftBounds(s.day, s.start, s.end); return b.from <= a.from && b.to >= a.to; })()).length;
    while (have < need) {
      const cand = (staff || []).filter(p => p.active !== false && (!p.venues || p.venues.includes(slot.venue)) && !off.has(`${p.id}|${day}`) && !shiftWarnings({ staff_id: p.id, day, start: slot.start, end: slot.end }, all).length)
        .map(p => ({ p, l: load(p.id) })).sort((x, y) => x.l.days - y.l.days || x.l.minutes - y.l.minutes || String(x.p.name).localeCompare(String(y.p.name), 'zh-Hant'));
      if (!cand.length) { warnings.push({ day, venue: slot.venue, start: slot.start, end: slot.end, needed: need, filled: have, message: `${day} ${label(slot.venue)} ${slot.start}–${slot.end} 缺 ${need - have} 人` }); break; }
      const s = { staff_id: cand[0].p.id, name: cand[0].p.name, day, venue: slot.venue, start: slot.start, end: slot.end, minutes: shiftMinutes(slot.start, slot.end), note: '自動排班' };
      all.push(s); added.push(s); have++;
    }
  }
  return { added, warnings };
}

const pad = n => String(n).padStart(2, '0');
const clock = v => { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' }); };
const stamp = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'); };
const hoursText = m => m == null ? '—' : `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}`;
const hoursDecimal = m => Math.round((Number(m) || 0) / 60 * 100) / 100;

/* 出勤彙總：每位員工的班數、總工時（只算已下班的、已扣休息）、休息合計、遲到次數、漏打下班卡筆數 */
function attendanceSummary(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const s = by.get(r.staff_id) || { staff_id: r.staff_id, name: r.name, shifts: 0, minutes: 0, break_minutes: 0, late: 0, open: 0, days: new Set() };
    s.shifts++; s.days.add(dayStr(r.day));
    s.break_minutes += Number(r.break_minutes) || 0;
    if (r.clock_out) s.minutes += r.minutes != null ? Number(r.minutes) : Math.max(0, minutesBetween(r.clock_in, r.clock_out) - (Number(r.break_minutes) || 0)); else s.open++;
    if (Number(r.late_minutes) > 0) s.late++;
    by.set(r.staff_id, s);
  }
  return [...by.values()].map(s => ({ ...s, days: s.days.size, hours: hoursDecimal(s.minutes) })).sort((a, b) => b.minutes - a.minutes);
}
/* CSV：每筆出勤一列＋每人合計；給會計算時薪 */
function attendanceCsv(rows) {
  const out = [['營業日', '員工', '店別', '上班', '下班', '工時（小時）', '排班', '遲到（分）', '早退（分）', '備註', '休息（分）']];
  for (const r of rows || []) out.push([dayStr(r.day), r.name, label(r.venue), stamp(r.clock_in), r.clock_out ? stamp(r.clock_out) : '（未打下班卡）', r.clock_out ? hoursDecimal(r.minutes != null ? Number(r.minutes) : Math.max(0, minutesBetween(r.clock_in, r.clock_out) - (Number(r.break_minutes) || 0))) : '', r.shift_start ? `${r.shift_start}–${r.shift_end}` : '', Number(r.late_minutes) || 0, Number(r.early_minutes) || 0, r.note || '', Number(r.break_minutes) || 0]);
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

module.exports = { VENUES, VENUE_LABEL, ATTENDANCE_VENUE, DEFAULT_HOURS, DEFAULT_STAFFING, LAW, MAX_SHIFT_HOURS, MAX_RANGE_DAYS, parseVenues, staffVisible, venueOf, staffInput, randomPin, shiftInput, shiftMinutes, shiftBounds, shiftConflicts, shiftWarnings, autoSchedule, dayOffInput, staffingInput, weekOf, addDays, weekDays, dateRange, punch, makeupPunch, MAKEUP_DAYS, breakState, attendanceFix, attendanceSummary, attendanceCsv, shiftsCsv, hoursText, hoursDecimal, minutesBetween, clock, stamp };
