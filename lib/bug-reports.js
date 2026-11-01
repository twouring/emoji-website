'use strict';
/* 大家來找碴（會員 App 回報）：會員拍照／選照片＋寫位置與說明送出 → POS「設定 → 找碴」審核。
   認可一件＝1 點（找碴點數，獨立計數，不進會員點數帳本；兌換門檻由現場決定）。 */
const KINDS = {
  unfinished: { zh: '還沒完成', en: 'Unfinished', ja: '未完成' },
  ux: { zh: '體驗不好', en: 'Bad experience', ja: '使いにくい' },
  better: { zh: '可以更好', en: 'Could be better', ja: '改善できる' },
};
const STATUS = {
  pending: '待審核',
  accepted: '認可',
  rejected: '不認可',
  duplicate: '重複',
};
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 500;
const MAX_LOCATION = 60;
const MAX_PER_DAY = 40;   // 每位會員每天上限，防洗版

const err = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

/* 驗證文字欄位；照片另外檢查（至少要有照片或說明其中之一） */
function validate(b, photoCount = 0) {
  const kind = String((b && b.kind) || '');
  if (!KINDS[kind]) throw err(400, '請選擇類型。');
  const location = clean(b.location, MAX_LOCATION);
  if (location.length < 1) throw err(400, '請寫下位置。');
  const text = clean(b.text, MAX_TEXT);
  if (!photoCount && text.length < 2) throw err(400, '請拍照或寫一下狀況。');
  if (photoCount > MAX_PHOTOS) throw err(400, `照片最多 ${MAX_PHOTOS} 張。`);
  const lang = ['zh', 'en', 'ja'].includes(b.lang) ? b.lang : 'zh';
  return { kind, location, text, lang };
}

/* 審核：只接受四種狀態 */
function reviewStatus(v) {
  const s = String(v || '');
  if (!STATUS[s]) throw err(400, '審核狀態不正確。');
  return s;
}

/* 排行：依認可件數（＝點數）多到少，同分先達成者在前 */
function leaderboard(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (r.status !== 'accepted') continue;
    const k = r.user_id;
    const cur = by.get(k) || { user_id: k, name: r.user_name || '', points: 0, last: null };
    cur.points += 1;
    const t = new Date(r.reviewed_at || r.created_at).getTime();
    if (!cur.last || t > cur.last) cur.last = t;
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || a.last - b.last).map(({ last, ...x }) => x);
}

const label = (kind, lang = 'zh') => (KINDS[kind] && (KINDS[kind][lang] || KINDS[kind].zh)) || kind;

module.exports = { KINDS, STATUS, MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TEXT, MAX_LOCATION, MAX_PER_DAY, validate, reviewStatus, leaderboard, label };
