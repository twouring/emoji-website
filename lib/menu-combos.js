'use strict';
/* 在咖啡套餐（四個，名稱直白）。內容以菜單品名（zh）對應同店品項；add＝該選項加價（伺服器依這份算，不信前端）。
 * 價格是建議值：貝果 200、飯糰 300、早午餐 380、下午茶 200（飲品可選美式／拿鐵+30／柚子氣泡）。 */
const DRINK = { key: 'drink', label: '飲品', choices: [{ zh: '美式咖啡', add: 0 }, { zh: '拿鐵咖啡', add: 30 }, { zh: '柚子氣泡', add: 0 }] };
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
  { zh: '下午茶套餐', en: 'Tea Time Set', ja: 'ティータイムセット', price: 200, sort: 8,
    note: '甜點＋飲品。', note_ja: 'デザートとドリンクのセットです。',
    combo: [{ key: 'main', label: '甜點', choices: [{ zh: '自製布丁・鹹鮮奶油', add: 0 }, { zh: '巴斯克蛋糕', add: 0 }, { zh: '藍莓起司蛋糕', add: 0 }] }, DRINK] },
];
/* 一次性回填（server 開機時，旗標 menu_combo_seed_v1）：已有同名套餐就略過、不覆蓋後台修改。
 * pos_only：先只在 POS 櫃檯點；官網與客人掃碼點餐（尚未支援選套餐內容）看不到。 */
function comboBackfill(items) {
  let n = 0;
  for (const c of COMBOS) {
    if (items.some(it => it.venue === 'CAFE' && it.zh === c.zh)) continue;
    items.push({ id: 'm_cafe_combo_' + c.sort, venue: 'CAFE', cat: 'COMBO', zh: c.zh, en: c.en, ja: c.ja, price: c.price, emo: 0, points: 0,
      note: c.note, note_ja: c.note_ja, image: '', combo: c.combo, alcohol: false, published: true, custom_price: false, pos_only: true,
      sort: c.sort, sold_out: '', available_from: '', available_to: '' });
    n++;
  }
  return n;
}
module.exports = { COMBOS, comboBackfill };
