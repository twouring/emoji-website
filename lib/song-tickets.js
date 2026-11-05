'use strict';
/* 一次性點歌 QR（KK 11/6）：桌邊 QR 只能「購買點歌」（桌上加點歌品項、還沒選歌），店員再發一張一次性點歌 QR 給客人，客人掃了才選歌。
 * 一張 QR＝這桌目前已買、還沒發過 QR 的點歌品項（幾首就能點幾首），綁定發券時的播放裝置；6 小時有效，每點一首用掉一格。
 * 狀態存 site_content ktv_tickets（{tickets:[...]}，不開新表）。本檔只放純邏輯，交易與路由在 server.js 點歌區塊。 */
const crypto = require('node:crypto');
const TTL = 6 * 3600e3, KEEP = 24 * 3600e3, MAX = 500;
const err = (message, status = 400) => Object.assign(Error(message), { status });
const parse = raw => { try { const v = typeof raw === 'string' && raw ? JSON.parse(raw) : raw; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

function normalize(raw) { const s = parse(raw); return { tickets: Array.isArray(s.tickets) ? s.tickets.filter(t => t && t.id && Array.isArray(t.lines)) : [] }; }
function prune(state, now = Date.now()) { return { tickets: state.tickets.filter(t => now - Date.parse(t.at) < KEEP).slice(-MAX) }; }
const sign = (id, secret) => crypto.createHmac('sha256', String(secret)).update('ktv-ticket:' + id).digest('base64url').slice(0, 22);
function verify(id, k, secret) {
  if (!/^kt_[a-z0-9]{12}$/.test(String(id || '')) || typeof k !== 'string') return false;
  const a = Buffer.from(sign(id, secret)), b = Buffer.from(k);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* 這桌已買、還沒選歌、也還沒發過 QR 的點歌品項 */
const isPending = l => !!(l && l.song && l.song.pending && !l.cancelled);
function unissued(items, state) {
  const taken = new Set(state.tickets.flatMap(t => t.lines));
  return (items || []).filter(l => isPending(l) && !taken.has(l.line));
}
function issue(state, { session, device = '', by = '', now = Date.now(), id } = {}) {
  if (!session || session.status !== 'open') throw err('這桌已結束，不能發點歌 QR。', 409);
  const lines = unissued(session.items, state).map(l => l.line);
  if (!lines.length) throw err('這桌沒有待發 QR 的點歌（請客人先在桌邊點餐頁購買點歌）。', 409);
  const t = { id: id || 'kt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), session_id: session.id, table: String(session.table_no || ''), device: String(device || '').slice(0, 64), lines, used: [], by: String(by || '').slice(0, 40), at: new Date(now).toISOString() };
  return { state: { tickets: state.tickets.concat([t]) }, ticket: t };
}
/* 可用的格數：還沒用、品項仍在這桌（沒被店員刪掉）、還在效期內 */
function remaining(t, items, now = Date.now()) {
  if (!t || now - Date.parse(t.at) > TTL) return [];
  const alive = new Set((items || []).filter(isPending).map(l => l.line));
  return t.lines.filter(x => !t.used.includes(x) && alive.has(x));
}
function use(state, id, line) {
  return { tickets: state.tickets.map(t => t.id === id ? { ...t, used: t.used.concat([line]) } : t) };
}
/* 客人購買 n 首：每首一行，標記待選歌；選歌後由 server 換成正式點歌品項（song.video_id、品名帶歌名） */
function buyLines(n, { price, venue, guest, by, now = Date.now() }) {
  const at = new Date(now).toISOString();
  return Array.from({ length: n }, () => ({
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: 'song', venue: venue || 'BAR', cat: 'SONG',
    zh: '點歌（待選歌）', en: 'Song request (to pick)', ja: 'リクエスト曲（選曲前）', ko: '노래 신청(곡 선택 전)',
    price: Math.max(0, Math.round(Number(price) || 0)), qty: 1, by: String(by || '客人').slice(0, 20), guest: String(guest || ''), note: '', order_id: null,
    added_at: at, placed_at: at, served_at: at, song: { pending: true },
  }));
}
function pickLine(l, entry) {
  const title = String(entry.title || '').slice(0, 50);
  return { ...l, zh: ('點歌｜' + title).slice(0, 60), en: ('Song | ' + title).slice(0, 60), ja: ('リクエスト曲｜' + title).slice(0, 60), ko: ('노래 신청 | ' + title).slice(0, 60), song: { request_id: entry.id, video_id: entry.video_id } };
}
/* 客人看到的券：剩幾首、桌號 */
const view = (t, items, now = Date.now()) => ({ table: t.table, left: remaining(t, items, now).length, total: t.lines.length, expires_at: new Date(Date.parse(t.at) + TTL).toISOString() });
module.exports = { TTL, normalize, prune, sign, verify, isPending, unissued, issue, remaining, use, buyLines, pickLine, view };
