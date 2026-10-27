'use strict';
/* 打賞：客人掃桌邊 QR → 自填金額＋選音效 → 記在這桌帳上（跟餐點一起結帳）；接音響的 POS（點歌播放裝置）播出客人選的音效。
 * 錢先由店家代收，之後店家支付給表演者：POS「設定 → 打賞」看期間已收／已支付／未付餘額，支付時記一筆（付現金同時記錢櫃支出）。
 * 不開新表：設定 site_content.tip_settings、播音效用的事件 tip_events、支付紀錄 tip_payouts。本檔只放純邏輯，交易與路由在 server.js。 */
const crypto = require('node:crypto');

/* 音效白名單：檔案在 public/sfx/<id>.mp3（與 POS 點歌音效同一批，來源見 public/sfx/LICENSE.md） */
const SOUNDS = [
  { id: 'applause', zh: '掌聲', en: 'Applause', ja: '拍手' },
  { id: 'applause-big', zh: '熱烈掌聲', en: 'Big applause', ja: '大きな拍手' },
  { id: 'cheer', zh: '歡呼', en: 'Cheer', ja: '歓声' },
  { id: 'cheer-scream', zh: '尖叫歡呼', en: 'Screaming cheer', ja: '大歓声' },
  { id: 'wow', zh: '哇～', en: 'Wow', ja: 'わぁ〜' },
  { id: 'drumroll', zh: '鼓聲', en: 'Drum roll', ja: 'ドラムロール' },
  { id: 'party-horn', zh: '派對喇叭', en: 'Party horn', ja: 'パーティーホーン' },
  { id: 'kiss', zh: '親親', en: 'Kiss', ja: 'キス' },
  { id: 'laugh', zh: '笑聲', en: 'Laugh', ja: '笑い声' },
  { id: 'rimshot', zh: '冷笑話鼓', en: 'Rimshot', ja: 'ツッコミ' },
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
function tipLine({ amount, sfx, performer, venue, guest, by, now = Date.now() }) {
  const at = new Date(now).toISOString(), p = clean(performer, 30), snd = soundOf(sfx);
  return {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: 'tip', venue: venue || 'BAR', cat: 'TIP',
    zh: ('打賞' + (p ? '｜' + p : '')).slice(0, 60), en: ('Tip' + (p ? ' | ' + p : '')).slice(0, 60), ja: ('投げ銭' + (p ? '｜' + p : '')).slice(0, 60),
    price: amount, qty: 1, by: clean(by, 20) || '客人', guest: String(guest || ''), note: snd.zh, order_id: null, added_at: at, placed_at: at, served_at: at,
    tip: { id: newId('tp_'), sfx: snd.id, performer: p },
  };
}
const isTip = l => !!(l && l.tip);

/* 播音效的事件：POS 每 5 秒輪詢，新事件出現時播放裝置播音效、各台跳通知；只留 12 小時、最多 50 筆 */
function normalizeEvents(raw) { const d = parseJson(raw); return { events: Array.isArray(d.events) ? d.events.filter(e => e && e.id) : [] }; }
function pushEvent(state, ev, now = Date.now()) {
  const e = { id: ev.id, table: clean(ev.table, 12), by: clean(ev.by, 20), amount: ev.amount, sfx: soundOf(ev.sfx).id, performer: clean(ev.performer, 30), at: new Date(now).toISOString() };
  return { events: state.events.concat([e]).filter(x => now - Date.parse(x.at) < EVENTS_KEEP_MS).slice(-EVENTS_MAX) };
}

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

module.exports = { SOUNDS, SOUND_IDS, DEFAULTS, MAX_AMOUNT, PAY_METHODS, normalizeSettings, patchSettings, parseTip, tipLine, isTip, normalizeEvents, pushEvent, normalizePayouts, parsePayout, summarize, publicView, soundOf };
