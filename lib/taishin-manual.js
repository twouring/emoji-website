/* 台新手機付日結對帳：台新沒有實收總額查詢 API（lib/taishin.js 目前只做單筆交易查詢），
 * 所以每個營業日由現場人員在「小結」「關帳」手動填一次實收總額，比對 POS 登記為 taishin 的單。
 * 純函式（無 DB），server.js 負責存取 pos_taishin_daily。 */
'use strict';

const MAX_AMOUNT = 10_000_000;

function cleanText(v, max) {
  return String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
}

/* 手動填寫驗證：實收總額必填、0 以上整數；差額非 0 時原因必填（決策紀錄第 4 點：允許關帳但必須填差異原因） */
function manualInput(body, posAmount) {
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw Object.assign(Error('請輸入台新手機付實收總額（0 以上整數）。'), { status: 400 });
  }
  const reason = cleanText(body?.reason, 200);
  const diff = amount - Number(posAmount || 0);
  if (diff !== 0 && !reason) {
    throw Object.assign(Error(`實收與系統登記差 ${diff > 0 ? '+' : ''}${diff}，請填寫差異原因。`), { status: 400 });
  }
  return { amount, reason };
}

/* 對帳：POS 登記為 taishin 的成立單 vs 手動填寫的實收總額（manual 可能是 null＝還沒填） */
function reconcile(orders, manual, { venues = null } = {}) {
  const ownedBy = require('./table-orders').orderOwnedByVenues;
  const pos = (orders || []).filter(o => o.status !== 'void' && o.payer?.method === 'taishin' && ownedBy(o, venues));
  const posAmount = pos.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  const manualAmount = manual ? Number(manual.amount) || 0 : null;
  return {
    pos: { count: pos.length, amount: posAmount },
    manual: manual ? {
      amount: manualAmount, reason: manual.reason || '', filled_by: manual.filled_by || '',
      updated_at: manual.updated_at ? new Date(manual.updated_at).toISOString() : null,
    } : null,
    diff: manual ? manualAmount - posAmount : null,
  };
}

module.exports = { MAX_AMOUNT, manualInput, reconcile };
