/* 會員身分標籤（KK 11/19）：員工 8 折、股東 7 折、特約商家 9 折。
   標籤存 users.member_tag；只有「驗證過身分」（掃會員卡／桌邊登入）的會員結帳才套，
   折扣由伺服器依標籤計算（前端只送 discount:{tag}），且不與會籍價疊加。 */
const TAGS = {
  staff: { label: '員工', percent: 20 },
  shareholder: { label: '股東', percent: 30 },
  partner: { label: '特約商家', percent: 10 },
};
const KEYS = Object.keys(TAGS);
function tagOf(key) {
  const t = TAGS[String(key || '')];
  return t ? { key: String(key), label: t.label, percent: t.percent } : null;
}
/* 設定時用：'' / null ＝ 清除；不在清單 400 */
function parseTag(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (!TAGS[String(v)]) throw Object.assign(Error('身分標籤無效。'), { status: 400 });
  return String(v);
}
/* 結帳 body.discount.tag → 換成整單折扣；會員沒驗證或標籤不符就擋 */
function tagDiscount(reqTag, member, verified) {
  const t = tagOf(member && member.member_tag);
  if (!verified || !t) throw Object.assign(Error('身分折扣要先掃會員卡（或桌邊登入）帶入有身分標籤的會員。'), { status: 400 });
  if (t.key !== String(reqTag)) throw Object.assign(Error('會員身分標籤已變更，請重新帶入會員。'), { status: 409 });
  return { type: 'percent', value: t.percent, reason: t.label + '身分', tag: t.key };
}
module.exports = { TAGS, KEYS, tagOf, parseTag, tagDiscount };
