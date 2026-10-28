'use strict';
/* 呼叫服務：客人在桌邊點餐頁按「呼叫服務」→ 選項目 → POS 各台跳通知響鈴 → 店員按「處理」結案。
   不進購物車、不開新表：狀態存 site_content.service_calls（{calls:[...]}），未處理的全留著，已處理的只留 12 小時供查。 */
const KINDS = {
  water: { zh: '加水', en: 'Water', ja: 'お水', ko: '물' },
  utensils: { zh: '餐具', en: 'Utensils', ja: 'カトラリー', ko: '수저·식기' },
  pack: { zh: '打包', en: 'To-go box', ja: '持ち帰り', ko: '포장 용기' },
  clear: { zh: '收桌', en: 'Clear table', ja: '片付け', ko: '테이블 정리' },
  other: { zh: '其他', en: 'Other', ja: 'その他', ko: '기타' },
};
const KIND_IDS = Object.keys(KINDS);
const COOLDOWN_MS = 60e3;          // 同一桌 1 分鐘內只能呼叫一次
const KEEP_DONE_MS = 12 * 3600e3;  // 已處理的保留 12 小時
const MAX_CALLS = 300;

const err = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

function normalize(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; } }
  const calls = Array.isArray(d && d.calls) ? d.calls.filter(c => c && c.id && KINDS[c.kind]) : [];
  return { calls };
}
function prune(state, now = Date.now()) {
  const calls = state.calls.filter(c => !c.done_at || now - Date.parse(c.done_at) < KEEP_DONE_MS);
  return { calls: calls.slice(-MAX_CALLS) };
}
/* 新增一筆呼叫；同桌冷卻中丟 429（回剩幾秒）。回 { state, call } */
function create(state, { session_id, table, kind, note, by, id }, now = Date.now()) {
  if (!KINDS[kind]) throw err(400, '請選擇服務項目。');
  if (!session_id) throw err(400, '缺少桌次。');
  const last = state.calls.filter(c => c.session_id === session_id).map(c => Date.parse(c.at)).sort((a, b) => b - a)[0];
  if (last && now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    throw Object.assign(err(429, `剛剛已通知店員，${wait} 秒後可再呼叫。`), { wait });
  }
  const call = {
    id, session_id, table: clean(table, 12), kind,
    note: kind === 'other' ? clean(note, 40) : '',
    by: clean(by, 20), at: new Date(now).toISOString(), done_at: null, done_by: '',
  };
  return { state: prune({ calls: [...state.calls, call] }, now), call };
}
/* 店員按「處理」：已處理過就原樣回（兩台同時按不報錯） */
function resolve(state, id, who, now = Date.now()) {
  const c = state.calls.find(x => x.id === id);
  if (!c) throw err(404, '找不到這筆呼叫。');
  if (c.done_at) return { state, call: c };
  const call = { ...c, done_at: new Date(now).toISOString(), done_by: clean(who, 40) };
  return { state: { calls: state.calls.map(x => x.id === id ? call : x) }, call };
}
/* 同一桌結束（清桌）時，未處理的呼叫一起結案，POS 不會留著已離場的桌 */
function closeSession(state, session_id, now = Date.now()) {
  let n = 0;
  const calls = state.calls.map(c => {
    if (c.session_id !== session_id || c.done_at) return c;
    n++; return { ...c, done_at: new Date(now).toISOString(), done_by: '清桌' };
  });
  return { state: { calls }, closed: n };
}
const pending = state => state.calls.filter(c => !c.done_at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
/* 客人端：只看自己這桌的；不外露其他桌 */
function publicView(state, session_id, now = Date.now()) {
  const mine = state.calls.filter(c => c.session_id === session_id);
  const last = mine.map(c => Date.parse(c.at)).sort((a, b) => b - a)[0];
  return {
    kinds: KIND_IDS.map(k => ({ id: k, ...KINDS[k] })),
    open: mine.filter(c => !c.done_at).map(c => ({ id: c.id, kind: c.kind, note: c.note, at: c.at })),
    recent_done: mine.filter(c => c.done_at && now - Date.parse(c.done_at) < 10 * 60e3).map(c => ({ id: c.id, kind: c.kind, done_at: c.done_at })),
    cooldown: last ? Math.max(0, Math.ceil((COOLDOWN_MS - (now - last)) / 1000)) : 0,
  };
}
const label = (kind, lang = 'zh') => (KINDS[kind] && (KINDS[kind][lang] || KINDS[kind].zh)) || kind;

module.exports = { KINDS, KIND_IDS, COOLDOWN_MS, KEEP_DONE_MS, normalize, prune, create, resolve, closeSession, pending, publicView, label };
