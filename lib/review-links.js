'use strict';
/* 掃碼點餐後的 Google 評論連結，依品牌（點餐場次的 venue）分開（KK 11/22）。
 * 預設＝各品牌 Google 商家的「撰寫評論」網址（placeid 由 Google 地圖查得，2026-11-22 核對名稱與地址）；
 * 系統設定 GOOGLE_REVIEW_URL_<VENUE> 有值就覆蓋（live，免部署）。查不到該品牌商家時退回言文字總店。 */
const W = id => 'https://search.google.com/local/writereview?placeid=' + id;
const MAIN = W('ChIJNxUDizepQjQRSfrlf-Eevlg');   // 言文字 Emoji Cafe & Bar｜數位聚落（總店）
const DEFAULTS = {
  CAFE: W('ChIJn8-yFU2pQjQRvEAcJ6OGVqA'),   // at cafe by Emoji
  BAR: W('ChIJ4Y2wu5KpQjQRLuQIAN-hPTg'),    // 3AM bistro by Emoji
  STAY: W('ChIJZXXuqrqpQjQR6uZGdqSNgLY'),   // 等等空間 Stay Square by Emoji 言文字
  REST: MAIN,                               // 約書旅：Google 地圖上尚未查到獨立商家，先用總店
};
const VENUES = Object.keys(DEFAULTS);
const keyOf = v => 'GOOGLE_REVIEW_URL_' + v;
const ok = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '').trim());

function reviewUrls(env = process.env) {
  const out = { DEFAULT: MAIN };
  for (const v of VENUES) { const s = String(env[keyOf(v)] || '').trim(); out[v] = ok(s) ? s : DEFAULTS[v]; }
  return out;
}

module.exports = { MAIN, DEFAULTS, VENUES, keyOf, ok, reviewUrls };
