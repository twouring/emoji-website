'use strict';

// 一般會籍牌價（NT$），線上 Stripe 結帳與現場開通共用。
// 會員享有所有空間與設備，不另收費。
const PLAN_PRICE_TWD = {
  day_4h: 200,
  day_12h: 500,
  month: 4000,
  quarter: 10000,
  year: 35000,
};

module.exports = { PLAN_PRICE_TWD };
