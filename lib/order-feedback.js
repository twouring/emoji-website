'use strict';
/* 桌邊點餐意見回饋：客人在 /order 菜單底部按「意見回饋」→ 選類別＋寫內容（可給 1–5 分）→ 存 order_feedback 表，POS「設定 → 回饋」查看。
   不進購物車、不通知響鈴；同一桌次最多 MAX_PER_SESSION 筆，避免洗版。 */
const KINDS = {
  app: { zh: '點餐操作', en: 'Ordering app', ja: '注文画面' },
  food: { zh: '餐點飲品', en: 'Food & drinks', ja: '料理・ドリンク' },
  service: { zh: '服務', en: 'Service', ja: 'サービス' },
  space: { zh: '環境', en: 'Space', ja: '店内環境' },
  other: { zh: '其他', en: 'Other', ja: 'その他' },
};
const KIND_IDS = Object.keys(KINDS);
const MAX_TEXT = 500;
const MAX_PER_SESSION = 5;

const err = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

/* 驗證客人送出的內容；回可寫入的乾淨物件 */
function validate(b) {
  const kind = String((b && b.kind) || '');
  if (!KINDS[kind]) throw err(400, '請選擇回饋類別。');
  const text = clean(b.text, MAX_TEXT);
  if (text.length < 2) throw err(400, '請寫下您的意見。');
  let rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw err(400, '評分需為 1–5。');
  const lang = ['zh', 'en', 'ja'].includes(b.lang) ? b.lang : 'zh';
  return { kind, text, rating, name: clean(b.name, 20), lang };
}
const label = (kind, lang = 'zh') => (KINDS[kind] && (KINDS[kind][lang] || KINDS[kind].zh)) || kind;
const kindList = () => KIND_IDS.map(id => ({ id, ...KINDS[id] }));

module.exports = { KINDS, KIND_IDS, MAX_TEXT, MAX_PER_SESSION, validate, label, kindList };
