'use strict';
/* LINE 登入帶回主畫面 App（KK 11/4）
   iOS 主畫面 App 按 LINE 登入 → 跳 LINE App 授權 → 回跳網址被系統開在 Safari，token 進不了主畫面 App。
   App 先產生 handoff（32 碼亂數，只存在 App 的 localStorage）帶進登入；callback 發現是跨瀏覽器回跳且有 handoff，
   就把 token（加密後）暫存 10 分鐘，Safari 頁請使用者核對 App 上的號碼並按確認（確認碼 c 只出現在 Safari 頁，
   知道 handoff 的人也無法代按），App 回前景輪詢 take() 取回。純函式，狀態存 site_content.auth_handoffs。 */
const crypto = require('crypto');
const TTL = 10 * 60 * 1000, MAX = 300;
const RE = /^[a-f0-9]{32}$/;
const valid = h => typeof h === 'string' && RE.test(h);
const keyOf = h => crypto.createHash('sha256').update('handoff:' + h).digest('hex');
// 兩位數核對號碼：App 與 Safari 頁各自由 handoff 算出，給使用者確認「是我自己發起的登入」
const code = h => String(parseInt(String(h).slice(0, 4), 16) % 100).padStart(2, '0');
function prune(m, now) {
  for (const k of Object.keys(m)) if (!(m[k] && m[k].exp > now)) delete m[k];
  const keys = Object.keys(m).sort((a, b) => m[a].exp - m[b].exp);
  while (keys.length > MAX) delete m[keys.shift()];
  return m;
}
function put(m, h, enc, now) {
  if (!valid(h) || !enc) return null;
  const c = crypto.randomBytes(16).toString('hex');
  m[keyOf(h)] = { enc, c, ok: false, exp: now + TTL };
  return c;
}
function confirm(m, h, c, now) {
  const e = valid(h) && m[keyOf(h)];
  if (!e || !(e.exp > now) || typeof c !== 'string' || c.length !== e.c.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(c), Buffer.from(e.c))) return false;
  e.ok = true; return true;
}
// 已確認才交出 token，交出後即刪（只能用一次）；未確認或不存在一律回 null（不透露有沒有這筆）
function take(m, h, now) {
  const k = valid(h) && keyOf(h), e = k && m[k];
  if (!e || !(e.exp > now) || !e.ok) return null;
  delete m[k]; return e.enc;
}
module.exports = { TTL, MAX, valid, keyOf, code, prune, put, confirm, take };
