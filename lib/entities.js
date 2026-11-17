'use strict';
/* 付款依法人分開（KK 11/11 D2）：法人是金流商店、發票賣方、對帳分組的唯一來源。
   言文字（TTH）＝在咖啡＋三點水；遊遊（TWOURING）＝等等空間＋約書旅。同法人兩品牌共用同一組商店代號與金鑰。
   金鑰設定：言文字沿用原本無後綴的設定（LINEPAY_MERCHANT_ID…，既有值就是言文字的商店，免搬密文）；
   遊遊用 `<KEY>:TWOURING`。沒填的法人＝該金流未啟用，絕不借用另一法人的設定。 */
const VENUES = ['CAFE', 'BAR', 'STAY', 'REST'];
const ENTITY_OF = Object.freeze({ CAFE: 'TTH', BAR: 'TTH', STAY: 'TWOURING', REST: 'TWOURING' });
const ENTITY_LABEL = Object.freeze({ TTH: '言文字股份有限公司', TWOURING: '遊遊股份有限公司' });
const ENTITIES = Object.keys(ENTITY_LABEL);
const PAYMENT_KEYS = Object.freeze(['LINEPAY_MERCHANT_ID', 'LINEPAY_MERCHANT_PW', 'LINEPAY_API_VERSION',
  'CTBC_MPOS_MERCHANT_ID', 'CTBC_MPOS_USER', 'CTBC_MPOS_PASSWORD',
  'EZPAY_INVOICE_MERCHANT_ID', 'EZPAY_INVOICE_HASH_KEY', 'EZPAY_INVOICE_HASH_IV', 'EZPAY_INVOICE_VERSION',
  'EZPAY_INVOICE_ISSUE_URL', 'EZPAY_INVOICE_INVALID_URL', 'EZPAY_INVOICE_SEARCH_URL']);

function entityOf(venue) {
  const e = ENTITY_OF[String(venue || '').toUpperCase()];
  if (!e) throw Object.assign(Error('未知付款品牌。'), { status: 400 });
  return e;
}
function venuesOf(entity) {
  if (!ENTITY_LABEL[entity]) throw Object.assign(Error('未知付款法人。'), { status: 400 });
  return VENUES.filter(v => ENTITY_OF[v] === entity);
}
const keyOf = (key, entity) => (entity === 'TTH' ? key : `${key}:${entity}`);
/* 只取該法人的金流設定（其餘環境變數照留，例如 CTBC_PROXY）。遊遊沒填的鍵是 undefined，不會落回言文字 */
function paymentEnv(env, entity) {
  venuesOf(entity);
  const out = { ...env };
  for (const k of PAYMENT_KEYS) out[k] = env[keyOf(k, entity)];
  for (const k of ['EZPAY_MERCHANT_ID', 'EZPAY_HASH_KEY', 'EZPAY_HASH_IV']) if (entity !== 'TTH') delete out[k];   // 舊別名只算言文字
  return out;
}
/* 舊資料沒有 entity 欄：當時只有言文字一個商店，一律算言文字 */
const txEntity = t => (t && ENTITY_LABEL[t.entity] ? t.entity : 'TTH');

module.exports = { VENUES, ENTITY_OF, ENTITY_LABEL, ENTITIES, PAYMENT_KEYS, entityOf, venuesOf, keyOf, paymentEnv, txEntity };
