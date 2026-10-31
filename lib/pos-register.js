/* 開關帳（帳本）：白天「在咖啡」(CAFE)、晚上「三點水」(BAR) 共用同一場域、同一台 POS、同一個抽屜帳，
 * 帳本仍以「品牌 × 營業日」記（營收分品牌），但同一時間全店只能有一本開著：在咖啡關帳後三點水才能開帳（反之亦然）。
 * 交接：下一本的零用金預設承接上一本關帳時的留存金（keep_cash）。
 * 流程（對照 iCHEF 帳務管理）：開帳（放零用金）→ 營業中可記「現金臨時收支」（進／出，要原因）→ 小結（看目前應有現金，不關）
 * → 關帳（點鈔，可按面額；系統算應有現金＝零用金＋現金營收＋臨時收入－臨時支出＋已退現金作廢不計，差額＝短溢）。
 * 關帳後該品牌當日不可再結帳；言文字管理員可「重開」補單。
 * 本檔只做純邏輯（可單測），讀寫 DB 在 server.js。 */
'use strict';

const VENUES = ['CAFE', 'BAR'];
const DENOMS = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1];
const MAX_CASH = 10000000;
const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
const err = (msg, status = 400) => Object.assign(Error(msg), { status });
const intIn = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

/* 帳本歸屬的品牌：子帳號只能開自己品牌；言文字管理員要明講 venue（不能「全店」開一本，否則兩品牌帳就混了） */
function registerVenue(requested, brands) {
  const v = String(requested || '').toUpperCase();
  if (!VENUES.includes(v)) throw err('請選擇要開帳的店別：在咖啡或三點水。');
  if (Array.isArray(brands) && brands.length && !brands.includes(v)) throw err('只能替自己店別開帳。', 403);
  return v;
}

const LABEL = v => (v === 'CAFE' ? '在咖啡' : '三點水');

/* 開帳：零用金（找零準備金）可按面額填張數、或直接填總額，須為 0 以上整數。
 * `open`＝當天任何一本還開著的帳（不分品牌）：同品牌→請先關帳再重開；另一品牌→共用抽屜帳，要等它關帳。
 * `handover`＝當天最後一本已關帳的帳：沒填零用金時預設承接它的留存金 */
function openRegister(body, { venue, open, handover }) {
  if (open && open.venue === venue) throw err(`${LABEL(venue)}今天的帳已經開了（${open.opened_by || ''}），請先關帳再重開。`, 409);
  if (open) throw err(`${LABEL(open.venue)}的帳還開著（${open.opened_by || ''}）。兩個品牌共用同一個抽屜帳，請先把${LABEL(open.venue)}關帳，再開${LABEL(venue)}的帳。`, 409);
  const byDenom = denominationTotal(body?.denominations);
  const given = body?.opening_cash !== undefined && body?.opening_cash !== null && body?.opening_cash !== '';
  const carried = !given && byDenom === null && handover ? intIn(handover.keep_cash, 0, MAX_CASH) : null;
  const opening = byDenom !== null ? byDenom : carried !== null ? carried : intIn(body?.opening_cash, 0, MAX_CASH);
  if (opening === null) throw err('零用金須為 0 以上的整數，可按面額填張數或直接填總額。');
  return { venue, opening_cash: opening, denominations: byDenom !== null ? body.denominations : null, note: cleanText(body?.note, 120) };
}

/* 現金臨時收支：in＝臨時收入（如代收、找零補鈔）、out＝臨時支出（如買耗材、付小費）；金額正整數、原因必填 */
function cashMove(body) {
  const type = String(body?.type || '');
  if (!['in', 'out'].includes(type)) throw err('請選擇臨時收入或臨時支出。');
  const amount = intIn(body?.amount, 1, MAX_CASH);
  if (amount === null) throw err('金額須為正整數。');
  const reason = cleanText(body?.reason, 80);
  if (!reason) throw err('請填寫原因（會印在關帳單上）。');
  return { type, amount, reason };
}

/* 面額點鈔：{ "1000": 張數, "500": ... } → 合計；允許只填部分面額 */
function denominationTotal(d) {
  if (!d || typeof d !== 'object') return null;
  let total = 0, any = false;
  for (const [k, v] of Object.entries(d)) {
    if(v === null || typeof v === 'boolean' || (typeof v === 'string' && !/^\d+$/.test(v))) throw err(`面額 ${k} 的張數須明確填入整數。`);
    const face = Number(k), n = intIn(v, 0, 100000);
    if (!DENOMS.includes(face)) throw err(`面額 ${k} 無效。`);
    if (n === null) throw err(`面額 ${k} 的張數須為 0 以上的整數。`);
    total += face * n; any = any || n > 0;
  }
  return any || Object.keys(d).length ? total : null;
}

/* 應有現金：零用金 ＋ 現金營收（作廢不計）＋ 臨時收入 － 臨時支出 */
function expectedCash({ opening_cash, cash_sales, moves }) {
  const inSum = (moves || []).filter(m => m.type === 'in').reduce((a, m) => a + Number(m.amount), 0);
  const outSum = (moves || []).filter(m => m.type === 'out').reduce((a, m) => a + Number(m.amount), 0);
  return { opening_cash: Number(opening_cash) || 0, cash_sales: Math.max(0, Math.round(Number(cash_sales) || 0)), cash_in: inSum, cash_out: outSum,
    expected: (Number(opening_cash) || 0) + Math.max(0, Math.round(Number(cash_sales) || 0)) + inSum - outSum };
}

/* 日結逐一核對的非現金帳戶：salesSummary 的 by_method → { 代碼: POS 登記金額 }。現金另走點鈔（expectedCash）；
 * 信用卡一律併入 ctbc（中信行動刷卡，2026-10-29 起）；歷史舊代碼 card、taishin 一起算進來 */
const LEGACY_CARD = ['card', 'taishin'];
const MERGE_INTO = { card: 'ctbc', taishin: 'ctbc' };
function accountsOf(byMethod) {
  const out = { linepay: 0, ctbc: 0, transfer: 0 };
  for (const [m, v] of Object.entries(byMethod || {})) {
    if (m === 'cash') continue;
    const code = MERGE_INTO[m] || m;
    out[code] = (out[code] || 0) + Math.round(Number(v) || 0);
  }
  return out;
}

/* 每個伺服器列出的帳戶都必須明確填入實收並確認；不接受額外帳戶或空值轉零。 */
const actualAmount = v => (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) ? intIn(v, 0, MAX_CASH) : null;
function reconcileAccounts(input, posByCode, labels = {}) {
  const given = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const code of Object.keys(given)) if (!Object.hasOwn(posByCode, code)) throw err('收款帳戶已變更，請重新載入日結。');
  const out = {};
  for (const code of Object.keys(posByCode)) {
    const pos = Math.round(Number(posByCode[code]) || 0), row = given[code], label = labels[code] || code;
    const actual = actualAmount(row?.actual);
    if (actual === null) throw err(`${label} 實收須明確填入 0 以上的整數。`);
    if (row.confirmed !== true) throw err(`請逐一確認 ${label} 帳戶。`);
    const reason = cleanText(row.reason, 200), diff = actual - pos;
    if (diff !== 0 && !reason) throw err(`${label} 實收與 POS 登記差 ${diff > 0 ? '+' : ''}${diff}，請填寫原因。`);
    out[code] = { pos, actual, diff, reason, confirmed: true, label };
  }
  return out;
}

/* 關帳：點鈔（直接填總額或按面額）vs 應有現金；差額＝點鈔－應有（正＝溢、負＝短）；差額非 0 要填說明。
 * 2026-10-17 日結流程：再逐一核對非現金帳戶（opts.accounts＝{ 代碼: POS 登記 }，body.accounts＝實收與原因），
 * 最後比「訂單總額」（當日營收）與「帳戶總額」（現金實收＝點鈔－零用金－臨時收入＋臨時支出，加各帳戶實收）：不同就一定要填說明才能關帳。 */
function closeRegister(body, summary, { accounts: posByCode = accountsOf({}), labels = {}, order_total } = {}) {
  const byDenom = denominationTotal(body?.denominations);
  const counted = byDenom !== null ? actualAmount(byDenom) : actualAmount(body?.counted_cash);
  if (counted === null) throw err('請輸入點鈔現金（可按面額填張數）。');
  if (body?.cash_confirmed !== true) throw err('請先確認錢櫃點鈔。');
  const diff = counted - summary.expected;
  const note = cleanText(body?.note, 200);
  if (diff !== 0 && !note) throw err(`點鈔與應有現金差 ${diff > 0 ? '+' : ''}${diff}，請填寫說明。`);
  const accounts = reconcileAccounts(body?.accounts, posByCode, labels);
  const cashActual = counted - summary.opening_cash - summary.cash_in + summary.cash_out;
  const totalPos = order_total ?? (summary.cash_sales + Object.values(accounts).reduce((a, x) => a + x.pos, 0));
  const totalActual = cashActual + Object.values(accounts).reduce((a, x) => a + x.actual, 0);
  const totalDiff = totalActual - totalPos;
  const totalReason = cleanText(body?.total_reason, 200);
  // 各帳戶差異原因已在逐項核對時填過，總差異不再要求重填（total_reason 選填）
  // 關帳後留在抽屜的錢：預設把零用金留給下一班、其餘收走（iCHEF「下班留存金」）；可指定留存金
  const keep = body?.keep_cash === undefined ? summary.opening_cash : actualAmount(body?.keep_cash);
  if (keep === null) throw err('留存金須為 0 以上的整數。');
  return { counted_cash: counted, expected_cash: summary.expected, diff, note, keep_cash: Math.min(keep, counted), take_cash: Math.max(0, counted - Math.min(keep, counted)), denominations: byDenom !== null ? body.denominations : null,
    cash_confirmed: true, accounts, cash_actual: cashActual, total_pos: totalPos, total_actual: totalActual, total_diff: totalDiff, total_reason: totalReason };
}

/* 小結點驗：點鈔（直接填總額或按面額），用來核對目前抽屜現金是否正確，不關帳、不影響關帳流程；差額僅顯示供參考，說明選填，可多次記錄留痕 */
function countRegister(body, summary) {
  const byDenom = denominationTotal(body?.denominations);
  const counted = byDenom !== null ? byDenom : intIn(body?.counted_cash, 0, MAX_CASH);
  if (counted === null) throw err('請輸入點鈔現金（可按面額填張數或直接填總額）。');
  const diff = counted - summary.expected;
  const note = cleanText(body?.note, 200);
  return { counted_cash: counted, expected_cash: summary.expected, diff, note, denominations: byDenom !== null ? body.denominations : null };
}

/* 結帳前檢查：這些品項所屬品牌今天的帳要開著；超管沒開帳也放行但回 warning（開幕初期不卡人） */
function checkoutAllowed(lines, openByVenue, { strict = true } = {}) {
  const venues = [...new Set((lines || []).map(l => l.venue).filter(Boolean))];
  const missing = venues.filter(v => !openByVenue || !openByVenue[v]);
  const closed = venues.filter(v => openByVenue && openByVenue[v] && openByVenue[v].closed_at);
  if (closed.length) throw err(`${closed.map(v => v === 'CAFE' ? '在咖啡' : '三點水').join('、')}今天已經關帳，不能再結帳；要補單請由言文字管理員重開帳。`, 409);
  if (missing.length && strict) throw err(`${missing.map(v => v === 'CAFE' ? '在咖啡' : '三點水').join('、')}今天還沒開帳，請先到「日結」開帳（填零用金）。`, 409);
  return { ok: true, warning: missing.length ? `${missing.map(v => v === 'CAFE' ? '在咖啡' : '三點水').join('、')}尚未開帳，這筆現金不會算進關帳。` : '' };
}

/* 關帳單／小結單（80mm 列印用的純資料；畫 HTML 在前端）；小結沒關帳時用最近一次點驗（count）當點鈔／差額，沒點驗過就沒有 */
function registerReport(reg, summary, sales, moves, count) {
  const live = !reg.closed_at;
  return {
    venue: reg.venue, day: reg.day, opened_at: reg.opened_at, opened_by: reg.opened_by, closed_at: reg.closed_at || null, closed_by: reg.closed_by || '',
    opening_cash: summary.opening_cash, cash_sales: summary.cash_sales, cash_in: summary.cash_in, cash_out: summary.cash_out, expected_cash: summary.expected,
    counted_cash: live ? (count?.counted_cash ?? null) : (reg.counted_cash ?? null),
    diff: live ? (count?.diff ?? null) : (reg.diff ?? null),
    counted_at: live ? (count?.created_at || null) : null,
    keep_cash: reg.keep_cash ?? null, take_cash: reg.take_cash ?? null,
    note: live ? (count?.note || reg.note || '') : (reg.note || ''),
    // 關帳時逐一核對的收款帳戶（{ 代碼:{pos,actual,diff,reason} }）與訂單總額／帳戶總額；小結沒有
    accounts: live ? null : (reg.accounts || null),
    cash_confirmed: live ? false : reg.cash_confirmed === true, total_reason: live ? '' : (reg.total_reason || ''),
    cash_actual: live ? null : (reg.cash_actual ?? null), total_pos: live ? null : (reg.total_pos ?? null), total_actual: live ? null : (reg.total_actual ?? null), total_diff: live ? null : (reg.total_diff ?? null),
    orders: sales?.orders || 0, amount: sales?.amount || 0, by_method: sales?.by_method || {}, voided: sales?.voided || 0, void_amount: sales?.void_amount || 0,
    discount_amount: sales?.discount_amount || 0, comp_count: sales?.comp_count || 0,
    redeem_points: sales?.redeem_points || 0, redeem_count: sales?.redeem_count || 0, redeem_value: sales?.redeem_value || 0, tip_amount: sales?.tip_amount || 0, tip_count: sales?.tip_count || 0,
    moves: (moves || []).map(m => ({ type: m.type, amount: Number(m.amount), reason: m.reason, staff: m.staff || '', at: m.created_at })),
  };
}

/* 帳本狀態總覽（給前端畫狀態列）：open_venue＝現在開著的品牌（null＝沒有）、handover＝當天最後一本已關帳的帳（下一本預設承接其留存金）、
 * can_open[venue]＝這個品牌現在能不能按開帳（有任何一本開著就不能；與時段無關，關帳後另一店立即可開）；wait＝要等誰關帳；
 * next_venue＝POS 該提醒開哪本 */
function registerOverview(rows) {
  const list = (rows || []).slice().sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
  const open = list.find(r => !r.closed_at) || null;
  const closed = list.filter(r => r.closed_at).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
  const last = closed[0] || null;
  const out = { open_venue: open ? open.venue : null, handover: last ? { id: last.id, venue: last.venue, keep_cash: Number(last.keep_cash) || 0, closed_at: last.closed_at } : null, can_open: {}, wait: {},
    // 接下來該開哪本（KK 10/31：不等時間到）：開著的那本；剛關帳就輪到另一店；當天還沒開過帳交給前端依時段判斷（null）
    next_venue: open ? open.venue : last ? (last.venue === 'CAFE' ? 'BAR' : 'CAFE') : null };
  for (const v of VENUES) { out.can_open[v] = !open; out.wait[v] = open && open.venue !== v ? LABEL(open.venue) : ''; }
  return out;
}

module.exports = { VENUES, DENOMS, LABEL, MERGE_INTO, LEGACY_CARD, registerVenue, openRegister, registerOverview, cashMove, denominationTotal, expectedCash, accountsOf, reconcileAccounts, closeRegister, countRegister, checkoutAllowed, registerReport };
