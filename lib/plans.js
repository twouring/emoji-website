'use strict';

// 方案牌價（NT$），線上 Stripe 結帳與現場開通共用。
// 會員享有所有空間與設備，不另收費。
// 現行販售（KK 11/19）：單日 4／12 小時、進駐方案（年約 12 期、每月 Stripe 自動扣款 NT$3,000）。
// 月／季／年會員與開幕優惠已停售；價格保留給既有權益的標籤、補單與退款對帳。
const PLAN_PRICE_TWD = {
  day_4h: 200,
  day_12h: 500,
  resident: 3000, // 每月扣款金額
  month: 4000,
  quarter: 10000,
  year: 35000,
  year_promo: 35000,
};
const SALE_PLANS = ['day_4h', 'day_12h', 'resident'];
const RESIDENT_TERM_MONTHS = 12;

module.exports = { PLAN_PRICE_TWD, SALE_PLANS, RESIDENT_TERM_MONTHS };
