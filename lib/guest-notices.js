'use strict';
/* POS 通知客人（KK 11/7）：店員在 POS 該桌按「通知」→ 選常用訊息（餐點要等、售完、取餐…）或自訂文字 →
   存 table_sessions.notices（JSONB 陣列），觸發器 pg_notify 讓客人點餐頁（SSE）即時跳出。
   常用訊息四語由客人端依語系顯示；自訂文字照原文。 */
const KINDS = {
  wait: {
    zh: '不好意思，餐點需要再等約 {n} 分鐘，請稍候。',
    en: 'Sorry, your order will take about {n} more minutes.',
    ja: '申し訳ございません。お料理はあと {n} 分ほどかかります。',
    ko: '죄송합니다. 음식이 나오기까지 약 {n}분 더 걸립니다.',
  },
  delay: {
    zh: '不好意思，今天比較忙，餐點會晚一點送到，請稍候。',
    en: "Sorry, we're busy right now. Your order may take a little longer.",
    ja: '申し訳ございません。混み合っているため、お料理のご提供が遅れております。',
    ko: '죄송합니다. 지금 손님이 많아 음식이 조금 늦어질 수 있습니다.',
  },
  soldout: {
    zh: '不好意思，您點的餐點有一項已售完，店員會過去跟您確認。',
    en: "Sorry, one of your items is sold out. A staff member will come to help you choose.",
    ja: '申し訳ございません。ご注文の品が売り切れました。スタッフがご案内に伺います。',
    ko: '죄송합니다. 주문하신 메뉴 중 하나가 품절되었습니다. 직원이 안내해 드리겠습니다.',
  },
  pickup: {
    zh: '餐點好了，請到櫃檯取餐。',
    en: 'Your order is ready. Please pick it up at the counter.',
    ja: 'お料理ができました。カウンターまでお越しください。',
    ko: '음식이 준비되었습니다. 카운터에서 받아 가세요.',
  },
  last_order: {
    zh: '即將最後點餐，需要加點請把握時間。',
    en: 'Last order soon. Please order now if you would like anything else.',
    ja: 'まもなくラストオーダーです。ご注文はお早めにどうぞ。',
    ko: '곧 라스트 오더입니다. 추가 주문은 서둘러 주세요.',
  },
  closing: {
    zh: '本店即將打烊，謝謝您今天的光臨。',
    en: "We're closing soon. Thank you for visiting us today.",
    ja: 'まもなく閉店いたします。本日はご来店ありがとうございました。',
    ko: '곧 영업을 마감합니다. 오늘 방문해 주셔서 감사합니다.',
  },
  custom: null,   // 店員自填，照原文
};
const KIND_IDS = Object.keys(KINDS);
const LABEL = { wait: '餐點要等', delay: '出餐較慢', soldout: '餐點售完', pickup: '請來取餐', last_order: '最後點餐', closing: '即將打烊', custom: '自訂訊息' };
const WAIT_MINUTES = [5, 10, 15, 20, 30];
const MAX_KEEP = 20;              // 每桌最多保留 20 則
const TEXT_MAX = 80;
const SHOW_MS = 3 * 3600e3;       // 客人端只看 3 小時內的

const err = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function normalize(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = raw ? JSON.parse(raw) : []; } catch { d = []; } }
  return Array.isArray(d) ? d.filter(n => n && n.id && KIND_IDS.includes(n.kind)) : [];
}
/* 驗證並組一則通知；回新的陣列與這則 */
function add(list, { id, kind, minutes, text, by }, now = Date.now()) {
  kind = String(kind || '');
  if (!KIND_IDS.includes(kind)) throw err(400, '請選擇通知內容。');
  const n = { id, kind, at: new Date(now).toISOString(), by: clean(by, 40) };
  if (kind === 'wait') {
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 1 || m > 120) throw err(400, '等候分鐘數要在 1–120 之間。');
    n.minutes = m;
  }
  if (kind === 'custom') {
    n.text = clean(text, TEXT_MAX);
    if (!n.text) throw err(400, '請輸入要通知的內容。');
  }
  return { list: [...normalize(list), n].slice(-MAX_KEEP), notice: n };
}
/* 給客人：不外露店員名稱，只回 3 小時內的 */
function publicView(list, now = Date.now()) {
  return normalize(list).filter(n => now - Date.parse(n.at) < SHOW_MS)
    .map(n => ({ id: n.id, kind: n.kind, at: n.at, ...(n.minutes ? { minutes: n.minutes } : {}), ...(n.text ? { text: n.text } : {}) }));
}
/* 某語系的文字（客人端也有同一份，用來做測試對照與 POS 預覽） */
function textOf(n, lang = 'zh') {
  if (!n) return '';
  if (n.kind === 'custom') return n.text || '';
  const t = KINDS[n.kind] && (KINDS[n.kind][lang] || KINDS[n.kind].zh);
  return t ? t.replace('{n}', n.minutes || '') : '';
}

module.exports = { KINDS, KIND_IDS, LABEL, WAIT_MINUTES, MAX_KEEP, TEXT_MAX, SHOW_MS, normalize, add, publicView, textOf };
