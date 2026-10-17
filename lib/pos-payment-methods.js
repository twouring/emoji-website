/* 收款帳戶：內建付款方式（現金／刷卡／LINE Pay／轉帳）寫死在 table-orders.js 的 PAY_METHODS；
 * 這裡是「言文字管理員自訂新增」的收款帳戶（例如街口支付、另一組轉帳帳號），存在 pos_payment_methods 表。
 * code 由系統隨機產生、不給人填（避免跟內建方式撞名或填出不合法字元），管理員只填中文名稱。 */
'use strict';
const crypto = require('node:crypto');

const RESERVED_CODES = new Set(['cash', 'card', 'linepay', 'transfer', 'taishin', 'other', 'tappay']);
const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);

function randomCode() {
  return 'm' + crypto.randomBytes(4).toString('hex');
}
/* 新增：{ label } → { code, label }；existingCodes 避免（機率極低的）隨機碼撞號 */
function methodInput({ label } = {}, existingCodes = []) {
  const l = cleanText(label, 20);
  if (!l) throw Object.assign(Error('請填寫收款帳戶名稱。'), { status: 400 });
  const used = new Set([...RESERVED_CODES, ...existingCodes]);
  let code; do { code = randomCode(); } while (used.has(code));
  return { code, label: l };
}
/* 編輯：目前只能改名稱／啟用停用，不能動 code（歷史單據以 code 關聯） */
function labelInput(label) {
  const l = cleanText(label, 20);
  if (!l) throw Object.assign(Error('請填寫收款帳戶名稱。'), { status: 400 });
  return l;
}
module.exports = { RESERVED_CODES, methodInput, labelInput };
