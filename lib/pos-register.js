/* 開關帳（帳本）：白天「在咖啡」(CAFE)、晚上「三點水」(BAR) 共用同一場域與同一台 POS，但帳務分開，
 * 所以帳本以「品牌 × 營業日」為單位：每個品牌每個營業日最多一本開著的帳。
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

/* 開帳：零用金（找零準備金）可按面額填張數、或直接填總額，須為 0 以上整數；同品牌同營業日已有開著的帳就不能再開 */
function openRegister(body, { venue, open }) {
  if (open) throw err(`${open.venue === 'CAFE' ? '在咖啡' : '三點水'}今天的帳已經開了（${open.opened_by || ''}），請先關帳再重開。`, 409);
  const byDenom = denominationTotal(body?.denominations);
  const opening = byDenom !== null ? byDenom : intIn(body?.opening_cash, 0, MAX_CASH);
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

/* 關帳：點鈔（直接填總額或按面額）vs 應有現金；差額＝點鈔－應有（正＝溢、負＝短）；差額非 0 要填說明 */
function closeRegister(body, summary) {
  const byDenom = denominationTotal(body?.denominations);
  const counted = byDenom !== null ? byDenom : intIn(body?.counted_cash, 0, MAX_CASH);
  if (counted === null) throw err('請輸入點鈔現金（可按面額填張數）。');
  const diff = counted - summary.expected;
  const note = cleanText(body?.note, 200);
  if (diff !== 0 && !note) throw err(`點鈔與應有現金差 ${diff > 0 ? '+' : ''}${diff}，請填寫說明。`);
  // 關帳後留在抽屜的錢：預設把零用金留給下一班、其餘收走（iCHEF「下班留存金」）；可指定留存金
  const keep = body?.keep_cash === undefined ? summary.opening_cash : intIn(body?.keep_cash, 0, MAX_CASH);
  if (keep === null) throw err('留存金須為 0 以上的整數。');
  return { counted_cash: counted, expected_cash: summary.expected, diff, note, keep_cash: Math.min(keep, counted), take_cash: Math.max(0, counted - Math.min(keep, counted)), denominations: byDenom !== null ? body.denominations : null };
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
    orders: sales?.orders || 0, amount: sales?.amount || 0, by_method: sales?.by_method || {}, voided: sales?.voided || 0, void_amount: sales?.void_amount || 0,
    discount_amount: sales?.discount_amount || 0, comp_count: sales?.comp_count || 0,
    moves: (moves || []).map(m => ({ type: m.type, amount: Number(m.amount), reason: m.reason, staff: m.staff || '', at: m.created_at })),
  };
}

module.exports = { VENUES, DENOMS, registerVenue, openRegister, cashMove, denominationTotal, expectedCash, closeRegister, countRegister, checkoutAllowed, registerReport };
