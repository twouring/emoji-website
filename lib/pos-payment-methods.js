/* 收款帳戶：內建付款方式（現金／刷卡／LINE Pay／轉帳）寫死在 table-orders.js 的 PAY_METHODS；
 * 這裡是「言文字管理員自訂新增」的收款帳戶（例如街口支付、另一組轉帳帳號），存在 pos_payment_methods 表。
 * code 由系統隨機產生、不給人填（避免跟內建方式撞名或填出不合法字元），管理員只填中文名稱。 */
'use strict';
const crypto = require('node:crypto');
const { ENTITY_OF, entityOf } = require('./entities');

const RESERVED_CODES = new Set(['cash', 'card', 'linepay', 'transfer', 'taishin', 'ctbc', 'other', 'tappay', 'stripe']);
/* 適用店別組（KK 11/5）：自訂收款帳戶分兩組共用——餐飲組（在咖啡、三點水）、空間組（等等空間、約書旅）；內建付款方式全部品牌共用 */
const GROUPS = { FNB: '在咖啡・三點水', SPACE: '等等空間・約書旅' };
/* 分組＝法人（KK 11/11 D2，唯一來源 lib/entities.js）：FNB＝言文字、SPACE＝遊遊 */
const GROUP_OF = Object.freeze(Object.fromEntries(Object.entries(ENTITY_OF).map(([v, e]) => [v, e === 'TTH' ? 'FNB' : 'SPACE'])));
const groupOf = venue => GROUP_OF[String(venue || '').toUpperCase()] || null;
/* venues 為 null（言文字管理員／不分品牌）→ null＝全部組都列 */
function groupsOf(venues) {
  if (!Array.isArray(venues)) return null;
  const g = [...new Set(venues.map(groupOf).filter(Boolean))];
  return g.length ? g : null;
}
function groupInput(group) {
  const g = String(group || '').trim().toUpperCase();
  if (!GROUPS[g]) throw Object.assign(Error('請選擇收款帳戶適用的店別（餐飲組或空間組）。'), { status: 400 });
  return g;
}
const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);

function randomCode() {
  return 'm' + crypto.randomBytes(4).toString('hex');
}
/* 新增：{ label } → { code, label }；existingCodes 避免（機率極低的）隨機碼撞號 */
function methodInput({ label, group } = {}, existingCodes = []) {
  const l = cleanText(label, 20);
  if (!l) throw Object.assign(Error('請填寫收款帳戶名稱。'), { status: 400 });
  const g = groupInput(group);
  const used = new Set([...RESERVED_CODES, ...existingCodes]);
  let code; do { code = randomCode(); } while (used.has(code));
  return { code, label: l, group: g };
}
/* 編輯：目前只能改名稱／啟用停用，不能動 code（歷史單據以 code 關聯） */
function labelInput(label) {
  const l = cleanText(label, 20);
  if (!l) throw Object.assign(Error('請填寫收款帳戶名稱。'), { status: 400 });
  return l;
}
/* 內建付款方式依法人啟用（KK 11/11）：LINE Pay、信用卡（中信）要該法人填了商店帳密才出現；
   沒填＝這個品牌不能選（例：遊遊還沒有 LINE Pay 商店，等等空間／約書旅就不列 LINE Pay）。其餘內建方式（現金、轉帳、其他）各品牌都有 */
function builtinEnabled(code, venue, env = process.env) {
  const entity = entityOf(venue);
  if (code === 'linepay') return require('./linepay').configured(env, entity);
  if (code === 'ctbc') return require('./ctbc').configured(env, entity);
  return true;
}
module.exports = { builtinEnabled, RESERVED_CODES, GROUPS, GROUP_OF, groupOf, groupsOf, groupInput, methodInput, labelInput };
