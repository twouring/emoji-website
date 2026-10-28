'use strict';
/* 打賞：客人掃桌邊 QR → 自填金額＋選音效 → 記在這桌帳上（跟餐點一起結帳）；接音響的 POS（點歌播放裝置）播出客人選的音效。
 * 客人送出後要店員在 POS 確認才掛帳、播音效。打賞是代收轉付：不計營收、不開發票、不算服務費／低消／折扣／會員點數。
 * 錢先由店家代收，之後店家支付給表演者：POS「設定 → 打賞」看期間已收／已支付／未付餘額，支付時記一筆（付現金同時記錢櫃支出）。
 * 不開新表：設定 site_content.tip_settings、播音效用的事件 tip_events、支付紀錄 tip_payouts。本檔只放純邏輯，交易與路由在 server.js。 */
const crypto = require('node:crypto');

/* 音效白名單（精簡為 5 種；舊 id 一律退回掌聲）：檔案在 public/sfx/<id>.mp3（與 POS 點歌音效同一批，來源見 public/sfx/LICENSE.md） */
const SOUNDS = [
  { id: 'applause', zh: '掌聲', en: 'Applause', ja: '拍手', ko: '박수' },
  { id: 'cheer', zh: '歡呼', en: 'Cheer', ja: '歓声', ko: '환호' },
  { id: 'wow', zh: '哇～', en: 'Wow', ja: 'わぁ〜', ko: '와~' },
  { id: 'drumroll', zh: '鼓聲', en: 'Drum roll', ja: 'ドラムロール', ko: '드럼롤' },
  { id: 'laugh', zh: '笑聲', en: 'Laugh', ja: '笑い声', ko: '웃음소리' },
];
const SOUND_IDS = SOUNDS.map(s => s.id);
const DEFAULTS = { enabled: false, performer: '', presets: [100, 200, 500], max: 10000 };
const MAX_AMOUNT = 10000;
const EVENTS_MAX = 50, EVENTS_KEEP_MS = 12 * 3600e3;
const PAY_METHODS = { cash: '現金（錢櫃）', transfer: '轉帳', other: '其他' };

const clean = (v, max) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max);
const err = (message, status = 400) => Object.assign(Error(message), { status });
const parseJson = raw => { try { const v = typeof raw === 'string' && raw ? JSON.parse(raw) : raw; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const newId = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const intIn = (v, lo, hi) => { if (v === null || v === '' || typeof v === 'boolean') return null; const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...parseJson(raw) };
  const max = intIn(s.max, 1, MAX_AMOUNT) || DEFAULTS.max;
  const presets = [...new Set((Array.isArray(s.presets) ? s.presets : []).map(v => intIn(v, 1, max)).filter(Boolean))].sort((a, b) => a - b).slice(0, 6);
  return { enabled: s.enabled === true, performer: clean(s.performer, 30), presets: presets.length ? presets : DEFAULTS.presets.filter(v => v <= max), max };
}
function patchSettings(cur, body) {
  const b = body || {}, next = { ...cur };
  if (typeof b.enabled === 'boolean') next.enabled = b.enabled;
  if (b.performer !== undefined) next.performer = b.performer;
  if (b.max !== undefined) { if (intIn(b.max, 1, MAX_AMOUNT) === null) throw err(`單筆上限須為 1–${MAX_AMOUNT} 的整數。`); next.max = Number(b.max); }
  if (b.presets !== undefined) {
    const list = Array.isArray(b.presets) ? b.presets : String(b.presets).split(/[,，、\s]+/).filter(Boolean);
    const max = intIn(next.max, 1, MAX_AMOUNT) || DEFAULTS.max;
    if (!list.length || list.some(v => intIn(v, 1, max) === null)) throw err(`快捷金額須為 1–${max} 的整數，用逗號分隔。`);
    next.presets = list.map(Number);
  }
  return normalizeSettings(next);
}
/* 客人送出的金額與音效：金額整數 1–上限；音效不在白名單就用掌聲 */
function parseTip(body, settings) {
  const amount = intIn(body?.amount, 1, settings.max);
  if (amount === null) throw err(`打賞金額須為 1–${settings.max.toLocaleString('en-US')} 元的整數。`);
  const sfx = SOUND_IDS.includes(String(body?.sfx)) ? String(body.sfx) : 'applause';
  return { amount, sfx };
}
const soundOf = id => SOUNDS.find(s => s.id === id) || SOUNDS[0];
/* 桌上帳單的一行：已送出、已完成（不上出餐看板、不印出餐單、客人不能自己刪），結帳時和餐點一起收；不算服務費、不算低消 */
function tipLine({ amount, sfx, performer, venue, guest, by, id = '', now = Date.now() }) {
  const at = new Date(now).toISOString(), p = clean(performer, 30), snd = soundOf(sfx);
  return {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: 'tip', venue: venue || 'BAR', cat: 'TIP',
    zh: ('打賞' + (p ? '｜' + p : '')).slice(0, 60), en: ('Tip' + (p ? ' | ' + p : '')).slice(0, 60), ja: ('投げ銭' + (p ? '｜' + p : '')).slice(0, 60),
    price: amount, qty: 1, by: clean(by, 20) || '客人', guest: String(guest || ''), note: snd.zh, order_id: null, added_at: at, placed_at: at, served_at: at,
    tip: { id: id || newId('tp_'), sfx: snd.id, performer: p },
  };
}
const isTip = l => !!(l && l.tip);

/* 打賞請求（site_content.tip_events）：客人送出後是 pending，要店員在 POS 按「確認」才掛上帳、播音效；按「不收」或清桌就結案。
 * status：pending → confirmed｜rejected。只留 12 小時、最多 100 筆；同桌同時最多 3 筆待確認。 */
const REQ_MAX = 100, PENDING_PER_TABLE = 3;
function normalizeEvents(raw) { const d = parseJson(raw); return { events: Array.isArray(d.events) ? d.events.filter(e => e && e.id).map(e => ({ ...e, status: ['pending', 'confirmed', 'rejected'].includes(e.status) ? e.status : 'confirmed' })) : [] }; }
const prune = (events, now) => events.filter(x => x.status === 'pending' || now - Date.parse(x.decided_at || x.at) < EVENTS_KEEP_MS).slice(-REQ_MAX);
function createRequest(state, r, now = Date.now()) {
  if (!r.session_id) throw err('缺少桌次。');
  if (state.events.filter(e => e.session_id === r.session_id && e.status === 'pending').length >= PENDING_PER_TABLE) throw err('這桌還有打賞等店員確認，請稍候再送。', 429);
  const e = { id: r.id || newId('tp_'), status: 'pending', session_id: r.session_id, table: clean(r.table, 12), guest: clean(r.guest, 32), by: clean(r.by, 20), amount: r.amount, sfx: soundOf(r.sfx).id, performer: clean(r.performer, 30), venue: r.venue || 'BAR', at: new Date(now).toISOString(), decided_at: null, decided_by: '' };
  return { state: { events: prune(state.events.concat([e]), now) }, request: e };
}
/* 店員確認／不收：已處理過就原樣回（兩台同時按不報錯）；找不到 404 */
function decide(state, id, ok, who, now = Date.now()) {
  const e = state.events.find(x => x.id === id);
  if (!e) throw err('找不到這筆打賞（可能已過期）。', 404);
  if (e.status !== 'pending') return { state, request: e, changed: false };
  const next = { ...e, status: ok ? 'confirmed' : 'rejected', decided_at: new Date(now).toISOString(), decided_by: clean(who, 40) };
  return { state: { events: state.events.map(x => x.id === id ? next : x) }, request: next, changed: true };
}
/* 已清桌的桌：待確認的一律結案為不收 */
function closeSessions(state, liveIds, now = Date.now()) {
  let n = 0;
  const events = state.events.map(e => { if (e.status !== 'pending' || liveIds.has(e.session_id)) return e; n++; return { ...e, status: 'rejected', decided_at: new Date(now).toISOString(), decided_by: '清桌' }; });
  return { state: { events }, closed: n };
}
const pendingRequests = state => state.events.filter(e => e.status === 'pending');
/* 客人端：只看自己這桌最近的 */
function guestRequests(state, session_id) {
  return state.events.filter(e => e.session_id === session_id).slice(-5).map(e => ({ id: e.id, status: e.status, amount: e.amount, sfx: e.sfx, at: e.at }));
}
/* 舊版直接寫事件（相容測試用） */
function pushEvent(state, ev, now = Date.now()) {
  const e = { id: ev.id, status: 'confirmed', table: clean(ev.table, 12), by: clean(ev.by, 20), amount: ev.amount, sfx: soundOf(ev.sfx).id, performer: clean(ev.performer, 30), at: new Date(now).toISOString(), decided_at: new Date(now).toISOString() };
  return { events: prune(state.events.concat([e]), now) };
}
/* 一行或一張單裡的打賞金額（代收轉付，不計營收、不開發票） */
const tipTotal = lines => (lines || []).filter(l => isTip(l) && !l.cancelled).reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 1), 0);

/* 支付給表演者 */
function normalizePayouts(raw) { const d = parseJson(raw); return { payouts: Array.isArray(d.payouts) ? d.payouts.filter(p => p && p.id && Number(p.amount) > 0) : [] }; }
function parsePayout(body) {
  const performer = clean(body?.performer, 30);
  if (!performer) throw err('請填表演者名稱。');
  const amount = intIn(body?.amount, 1, 10000000);
  if (amount === null) throw err('支付金額須為正整數。');
  const method = PAY_METHODS[body?.method] ? String(body.method) : null;
  if (!method) throw err('請選擇支付方式。');
  return { performer, amount, method, note: clean(body?.note, 80) };
}

/* 統計：orders＝已結帳的單（含作廢，作廢的不算）；只算打賞行（未取消）。期間依營業日（03:00 換日）。
 * 回 { total, count, by_performer:[{performer, amount, count, paid, unpaid}], tips:[…], payouts:[…] }；
 * 未付餘額＝全期間已收－全期間已付（所以 allOrders／allPayouts 給全期間，期間數字另算） */
function summarize({ orders = [], payouts = [], allOrders = null, allPayouts = null, businessDay, from = '', to = '' }) {
  const inRange = iso => { const d = businessDay(iso); return (!from || d >= from) && (!to || d <= to); };
  const tipsOf = list => {
    const out = [];
    for (const o of list || []) {
      if (o.status === 'void') continue;
      for (const l of o.items || []) if (isTip(l) && !l.cancelled && Number(l.price) > 0) out.push({ order_id: o.id, table: o.table_no || '', paid_at: o.paid_at instanceof Date ? o.paid_at.toISOString() : o.paid_at, amount: Number(l.price) * (Number(l.qty) || 1), performer: l.tip.performer || '', by: l.by || '', sfx: l.tip.sfx || '' });
    }
    return out;
  };
  const tips = tipsOf(orders).filter(t => inRange(t.paid_at)).sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
  const pays = (payouts || []).filter(p => inRange(p.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const name = p => p || '（未指定）';
  const per = new Map();
  const row = k => per.get(k) || (per.set(k, { performer: k, amount: 0, count: 0, paid: 0, received_all: 0, paid_all: 0 }), per.get(k));
  for (const t of tips) { const r = row(name(t.performer)); r.amount += t.amount; r.count++; }
  for (const p of pays) row(name(p.performer)).paid += Number(p.amount) || 0;
  for (const t of tipsOf(allOrders || orders)) row(name(t.performer)).received_all += t.amount;
  for (const p of allPayouts || payouts) row(name(p.performer)).paid_all += Number(p.amount) || 0;
  const by_performer = [...per.values()].map(r => ({ performer: r.performer, amount: r.amount, count: r.count, paid: r.paid, unpaid: r.received_all - r.paid_all }))
    .sort((a, b) => b.unpaid - a.unpaid || b.amount - a.amount);
  return {
    from, to, total: tips.reduce((a, t) => a + t.amount, 0), count: tips.length, paid: pays.reduce((a, p) => a + (Number(p.amount) || 0), 0),
    unpaid: by_performer.reduce((a, r) => a + r.unpaid, 0), by_performer, tips: tips.slice(0, 200), payouts: pays.slice(0, 200),
  };
}
/* 客人端看到的設定 */
function publicView(settings) {
  return { enabled: settings.enabled, performer: settings.performer, presets: settings.presets, max: settings.max, sounds: SOUNDS };
}

module.exports = { SOUNDS, SOUND_IDS, DEFAULTS, MAX_AMOUNT, PAY_METHODS, PENDING_PER_TABLE, normalizeSettings, patchSettings, parseTip, tipLine, isTip, tipTotal, normalizeEvents, pushEvent, createRequest, decide, closeSessions, pendingRequests, guestRequests, normalizePayouts, parsePayout, summarize, publicView, soundOf };
