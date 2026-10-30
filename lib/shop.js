'use strict';
/* 會員 App 商店：牙刷牙膏、毛巾浴巾、耳機等零售品。
   商品就是菜單裡分類 SHOP 的品項（後台「菜單」新增、上下架、估清、剩餘份數都沿用）；
   App 下單開一張外帶單（W 號），到櫃檯付款取貨。純函式放這裡，DB 與路由在 server.js。 */
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;

const MAX_OPEN_PER_USER = 3;   // 同一會員最多 3 張未取貨
const EXPIRE_HOURS = 48;        // 下單 48 小時沒來付款取貨 → 自動取消（釋出 W 號）
const bad = msg => Object.assign(new Error(msg), { status: 400 });
const clean = v => String(v || '').replace(/[\x00-\x1f]/g, '').trim();

/* 商店可買的品項：已發布、SHOP 分類、今天沒估清、在供應期間內（不受營業時段限制） */
function itemsOf(menuJson, now) {
  return MenuLib.orderableOnly(MenuLib.parseMenuDoc(menuJson || ''), now, { shop: true }).filter(MenuLib.isShop);
}
function menuOf(menuJson, now) { return new Map(itemsOf(menuJson, now).map(it => [it.id, it])); }

/* 帳記在哪一店：POS 品牌帳號用自己的店別；言文字管理員或 App 下單用當下營業品牌，非營業時段（03–08）記在咖啡 */
function venueFor(venues, now) {
  if (Array.isArray(venues) && venues.length) return venues[0];
  return MenuLib.activeVenue(now) || 'CAFE';
}

function normalizeOrder(body = {}) {
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length || raw.length > 20) throw bad('請選擇 1–20 種商品。');
  let total = 0;
  const seen = new Set();
  const items = raw.map(x => {
    const item_id = clean(x && x.item_id), qty = Number(x && x.qty);
    if (!item_id || item_id.length > 40) throw bad('商品格式不正確。');
    if (seen.has(item_id)) throw bad('同一商品請合併數量。');
    seen.add(item_id);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad('每種商品數量為 1–20。');
    total += qty;
    return { item_id, qty };
  });
  if (total > 40) throw bad('一張訂單最多 40 件。');
  return { items, note: clean(body.note).slice(0, 200) };
}
module.exports = { MAX_OPEN_PER_USER, EXPIRE_HOURS, itemsOf, menuOf, venueFor, normalizeOrder };
