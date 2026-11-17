'use strict';
/* 菜單依品牌分開（KK 11/11 D1／D4）：site_content 每品牌一列 menu:<VENUE>（CAFE／BAR／STAY／REST），
   商店零售品（cat SHOP）屬言文字聚落，獨立一列 menu:TTH，只給會員 App 線上 Stripe 購買。
   舊的單一列 `menu` 只當一次性遷移來源：開機遷移後保留不刪、不再寫入（回滾用）。
   讀：五列合併成一份（品項 id 全域唯一），各畫面再依 venue 過濾；寫：依品項歸屬拆回各列，只寫有變動的列。 */
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;

const VENUES = MenuLib.VENUES;                 // CAFE／BAR／STAY／REST（唯一來源）
const SHOP_KEY = 'menu:TTH';
const KEYS = [...VENUES.map(v => `menu:${v}`), SHOP_KEY];
const LEGACY_KEY = 'menu';

function keyFor(venue) {
  const v = String(venue || '').toUpperCase();
  if (v === 'TTH') return SHOP_KEY;
  if (!VENUES.includes(v)) throw Object.assign(Error('未知菜單品牌。'), { status: 400 });
  return `menu:${v}`;
}
/* 品項屬於哪一列：SHOP 一律 menu:TTH，其餘看 venue（無效 venue 依 MenuLib 慣例當 CAFE） */
const keyOfItem = it => (it && it.cat === 'SHOP' ? SHOP_KEY : `menu:${VENUES.includes(it && it.venue) ? it.venue : 'CAFE'}`);

const docOf = raw => { try { const j = JSON.parse(String(raw || '')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; } };

/* rows：[{key,value}]（site_content）。有任何品牌列就合併品牌列；一列都沒有（遷移前）才退回舊 menu */
function fromRows(rows) {
  const by = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  if (!KEYS.some(k => by[k] != null)) return by[LEGACY_KEY] || '';
  let updated = null;
  const items = [];
  for (const k of KEYS) {
    const j = docOf(by[k]);
    if (!j) continue;
    if (j.updated_at && (!updated || j.updated_at > updated)) updated = j.updated_at;
    if (Array.isArray(j.items)) items.push(...j.items);
  }
  return JSON.stringify({ version: 1, updated_at: updated, items });
}
const hasBrandRows = rows => (rows || []).some(r => KEYS.includes(r.key));

/* 整份菜單依品項歸屬拆成五列（品項原封不動），五列都會出現（空的也寫，表示該品牌目前沒有品項） */
function split(raw) {
  const j = docOf(raw) || {}, out = Object.fromEntries(KEYS.map(k => [k, []]));
  for (const it of Array.isArray(j.items) ? j.items : []) out[keyOfItem(it)].push(it);
  const base = { version: Number(j.version) || 1, updated_at: j.updated_at || null };
  return Object.fromEntries(KEYS.map(k => [k, JSON.stringify({ ...base, items: out[k] })]));
}
/* 寫回時只要有變動的列：比較品項內容（不比 updated_at，避免整份存檔把沒改的品牌也標成已更新） */
function changedRows(beforeRaw, afterRaw, { brandRowsExist = true } = {}) {
  const a = split(beforeRaw), b = split(afterRaw), items = s => JSON.stringify((docOf(s) || {}).items || []);
  return Object.fromEntries(KEYS.filter(k => !brandRowsExist || items(a[k]) !== items(b[k])).map(k => [k, b[k]]));
}

/* 一次性遷移：舊 menu → 五列。甜點（DESSERT）取消共用：近 30 天在別的品牌賣過的，複製一份給該品牌
   （新 id＝原 id＋'_'＋品牌小寫，id 維持全域唯一），之後各自維護、各自估清。
   sales：{ 品項 id: [賣過的 venue…] }。回 { rows:{key:json}, copies:[{from,to,venue,zh}] } */
function migrateLegacy(raw, sales = {}) {
  const j = docOf(raw);
  if (!j || !Array.isArray(j.items)) throw Error('舊菜單格式錯誤，不遷移。');
  const items = j.items.slice(), have = new Set(items.map(it => it.id)), copies = [];
  for (const it of j.items) {
    if (!it || it.cat !== 'DESSERT') continue;
    for (const v of [...new Set(sales[it.id] || [])].sort()) {
      if (v === it.venue || !VENUES.includes(v)) continue;
      const id = `${it.id}_${v.toLowerCase()}`;
      if (have.has(id)) continue;
      have.add(id);
      items.push({ ...it, id, venue: v, sold_out: '', sold_out_by: [], stock_day: '', stock_left: null });
      copies.push({ from: it.id, to: id, venue: v, zh: it.zh });
    }
  }
  return { rows: split(JSON.stringify({ ...j, items })), copies };
}

module.exports = { VENUES, KEYS, SHOP_KEY, LEGACY_KEY, keyFor, keyOfItem, fromRows, hasBrandRows, split, changedRows, migrateLegacy };
