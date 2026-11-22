/* 聚落跨品牌 9 折（KK 11/23）：會員在聚落任一品牌（在咖啡／三點水／等等空間／約書旅）消費過，
   同一營業日（03:00 換日）到「另一個」品牌結帳享整單 9 折。
   - 只認驗證過身分的會員（掃會員卡／桌邊登入），與會員身分折扣同一條路：前端只送 discount:{tag:'hub'}，伺服器重查資格。
   - 「消費過」＝該會員有已結帳、未作廢、金額 > 0 的單，品項品牌（行上 venue）不同於這次結帳的品牌。
   - 天數用環境變數 HUB_CROSS_DAYS 調（預設 1＝當天營業日）；身分折扣（員工／股東／特約）優先，不疊加。 */
const PERCENT = 10;
const TAG = { key: 'hub', label: '聚落', percent: PERCENT };
const REASON = '聚落跨品牌';
const VENUES = ['CAFE', 'BAR', 'STAY', 'REST'];
function windowDays() {
  const n = Number(process.env.HUB_CROSS_DAYS);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 1;
}
/* 營業日起點（台北 03:00），往前推 days-1 天 */
function since(now = Date.now(), days = windowDays()) {
  const day = new Date(+new Date(now) + 5 * 3600e3).toISOString().slice(0, 10);
  return new Date(Date.parse(day + 'T03:00:00+08:00') - (days - 1) * 86400e3);
}
/* 一張單算哪些品牌（排除取消、打賞、預收抵扣行） */
function orderVenues(items) {
  return [...new Set((Array.isArray(items) ? items : []).filter(l => l && !l.cancelled && !l.tip && !l.credit_of && VENUES.includes(l.venue)).map(l => l.venue))];
}
/* 期間內消費過的品牌 */
function paidVenues(orders) {
  return [...new Set((orders || []).flatMap(o => orderVenues(o.items)))];
}
/* 這次結帳的品牌（checkoutVenues）以外，有沒有消費過別的品牌 */
function eligible(paid, checkoutVenues) {
  const cur = (checkoutVenues || []).filter(v => VENUES.includes(v));
  if (!cur.length) return false;
  return (paid || []).some(v => VENUES.includes(v) && !cur.includes(v));
}
function discount() { return { type: 'percent', value: PERCENT, reason: REASON, tag: TAG.key }; }
module.exports = { PERCENT, TAG, REASON, VENUES, windowDays, since, orderVenues, paidVenues, eligible, discount };
