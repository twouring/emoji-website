'use strict';
/* 在咖啡套餐（四個，名稱直白）。內容以菜單品名（zh）對應同店品項；add＝該選項加價（伺服器依這份算，不信前端）。
 * 價格是建議值：貝果 200、飯糰 300、早午餐 380、下午茶 200（飲品可選美式／拿鐵+30／柚子氣泡）。 */
const SPARKLING = [{ id: 'm_3x1e32pd', zh: '柚子氣泡', add: 0 }, { id: 'm_ev482pfl', zh: '莓果氣泡', add: 0 }, { id: 'm_i3w9zd36', zh: '鳳梨氣泡', add: 0 }];
const DRINK = { key: 'drink', label: '飲品', choices: [{ zh: '美式咖啡', add: 0 }, { zh: '拿鐵咖啡', add: 30 }, ...SPARKLING] };
const COMBOS = [
  { zh: '貝果套餐', en: 'Bagel Set', ja: 'ベーグルセット', price: 200, sort: 5,
    note: '貝果＋飲品。', note_ja: 'ベーグルとドリンクのセットです。',
    combo: [{ key: 'main', label: '貝果', choices: [{ zh: '原味貝果', add: 0 }, { zh: '無花果核桃蜂蜜奶油貝果', add: 50 }] }, DRINK] },
  { zh: '飯糰套餐', en: 'Onigiri Set', ja: 'おにぎりセット', price: 300, sort: 6,
    note: '飯糰＋飲品。', note_ja: 'おにぎりとドリンクのセットです。',
    combo: [{ key: 'main', label: '飯糰', choices: [{ zh: '海苔馬告豬肉時雨煮飯糰', add: 0 }, { zh: '鹽烤雞腿昆布飯糰', add: 20 }] }, DRINK] },
  { zh: '早午餐套餐', en: 'Brunch Set', ja: 'ブランチセット', price: 380, sort: 7,
    note: '三明治或可頌＋飲品。', note_ja: 'サンドイッチまたはクロワッサンとドリンクのセットです。',
    combo: [{ key: 'main', label: '主餐', choices: [{ zh: '奶油松露野菇炒蛋開放式三明治', add: 0 }, { zh: '燻鮭魚酪梨蒔蘿奶油開放式三明治', add: 20 }, { zh: '明太子美式炒蛋可頌', add: 20 }] }, DRINK] },
  { zh: '麵套餐', en: 'Noodle Set', ja: '麺セット', price: 400, sort: 9,
    note: '冷蕎麥麵＋飲品。', note_ja: '冷たいそばとドリンクのセットです。',
    combo: [{ key: 'main', label: '麵', choices: [{ id: 'm_8qx9kqre', zh: '柚香紫蘇雞腿冷蕎麥麵', add: 0 }] }, DRINK] },
  { zh: '下午茶套餐', en: 'Tea Time Set', ja: 'ティータイムセット', price: 200, sort: 8,
    note: '甜點＋飲品。', note_ja: 'デザートとドリンクのセットです。',
    combo: [{ key: 'main', label: '甜點', choices: [{ zh: '自製布丁・鹹鮮奶油', add: 0 }, { zh: '巴斯克蛋糕', add: 0 }, { zh: '藍莓起司蛋糕', add: 0 }] }, DRINK] },
];
/* 三點水麵套餐：兩款麵擇一＋氣泡飲（三點水沒有咖啡；酒類不放進折扣套餐）。成本（三點水_食材成本1011）烏龍麵約 64、蕎麥麵約 62，加氣泡約 20 */
const BAR_COMBO = { id: 'm_bar_combo_noodle', venue: 'BAR', zh: '麵套餐', en: 'Noodle Set', ja: '麺セット', price: 360, sort: 5,
  note: '麵＋氣泡飲。', note_ja: '麺とスパークリングドリンクのセットです。',
  combo: [
    { key: 'main', label: '麵', choices: [{ id: 'm_1lm1cdk3', zh: '醬香野菇蕎麥麵附溫泉蛋', add: 0 }, { id: 'm_hrfhc7os', zh: '濃香味噌肉醬烏龍麵附溫泉蛋', add: 60 }] },
    { key: 'drink', label: '飲品', choices: [{ id: 'm_og0f6mpb', zh: '柚子氣泡', add: 0 }, { id: 'm_usmhblkt', zh: '莓果氣泡', add: 0 }, { id: 'm_tskeoazr', zh: '鳳梨氣泡', add: 0 }] },
  ] };
/* 一次性（旗標 menu_combo_bar_noodle_v1）：三點水已有同名套餐就略過 */
function barComboBackfill(items) {
  if (items.some(it => it.venue === 'BAR' && it.zh === BAR_COMBO.zh)) return 0;
  const { combo, ...rest } = BAR_COMBO;
  items.push({ ...rest, cat: 'COMBO', emo: 0, points: 0, image: '', combo: JSON.parse(JSON.stringify(combo)), alcohol: false, published: true, custom_price: false, pos_only: false, sold_out: '', available_from: '', available_to: '' });
  return 1;
}
/* 一次性回填（server 開機時，旗標 menu_combo_seed_v1）：已有同名套餐就略過、不覆蓋後台修改。
 * pos_only：先只在 POS 櫃檯點；官網與客人掃碼點餐（尚未支援選套餐內容）看不到。 */
function comboBackfill(items, { open = false } = {}) {
  let n = 0;
  for (const c of COMBOS) {
    if (items.some(it => it.venue === 'CAFE' && it.zh === c.zh)) continue;
    items.push({ id: 'm_cafe_combo_' + c.sort, venue: 'CAFE', cat: 'COMBO', zh: c.zh, en: c.en, ja: c.ja, price: c.price, emo: 0, points: 0,
      note: c.note, note_ja: c.note_ja, image: '', combo: c.combo, alcohol: false, published: true, custom_price: false, pos_only: !open,
      sort: c.sort, sold_out: '', available_from: '', available_to: '' });
    n++;
  }
  return n;
}
/* 一次性（旗標 menu_combo_open_v1）：把還是 POS 限定的四個套餐開放給客人掃碼點餐與官網菜單；之後後台改回 POS 限定不會再被動到 */
function comboOpen(items) {
  let n = 0;
  const ids = new Set(COMBOS.map(c => 'm_cafe_combo_' + c.sort));
  for (const it of items) if (ids.has(it.id) && it.cat === 'COMBO' && it.pos_only === true) { it.pos_only = false; n++; }
  return n;
}
/* 每次開機：所有套餐選項補上品項 id、品名同步菜單現名（品項改名後套餐不會對不到）。
 * 麵套餐只放在咖啡既有麵食：對不到的舊名選項（改名前的「柚子紫蘇雞腿冷蕎麥麵」）換成現行同一道麵。回傳有改的套餐數 */
function comboRelink(items) {
  const MenuLib = globalThis.MenuLib || (require('../public/menu-lib.js'), globalThis.MenuLib);
  let n = 0;
  for (const it of items) {
    if (it.cat !== 'COMBO') continue;
    let changed = false;
    if (it.id === 'm_cafe_combo_9') for (const s of it.combo || []) for (const c of s.choices) {
      if (c.zh === '柚子紫蘇雞腿冷蕎麥麵' && !c.id) { c.id = 'm_8qx9kqre'; changed = true; }
    }
    if (MenuLib.linkCombo(it, items)) changed = true;
    if (changed) n++;
  }
  return n;
}
/* 一次性（旗標 menu_combo_sparkling_v1）：在咖啡內建套餐的飲品欄補上莓果／鳳梨氣泡（原本只有柚子氣泡）；只補缺的，不動其他選項 */
function comboAddSparkling(items) {
  let n = 0;
  const ids = new Set(COMBOS.map(c => 'm_cafe_combo_' + c.sort));
  for (const it of items) {
    if (!ids.has(it.id) || it.cat !== 'COMBO') continue;
    const slot = (it.combo || []).find(s => s.key === 'drink');
    if (!slot) continue;
    let changed = false;
    for (const c of SPARKLING) if (!slot.choices.some(x => x.id === c.id || x.zh === c.zh)) { slot.choices.push({ ...c }); changed = true; }
    if (changed) n++;
  }
  return n;
}
module.exports = { COMBOS, BAR_COMBO, comboAddSparkling, comboBackfill, barComboBackfill, comboOpen, comboRelink };
