'use strict';

// 一般會籍牌價（NT$），線上 Stripe 結帳與現場開通共用。
// 會員可自由使用 2F／3F 所有設備，不另收費、不使用點數。
const PLAN_PRICE_TWD = {
  day_4h: 200,
  day_12h: 500,
  month: 4000,
  quarter: 10000,
  year: 35000,
};

module.exports = { PLAN_PRICE_TWD };
