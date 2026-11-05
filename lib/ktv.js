'use strict';
/* KTV（ktv.emoji.tw）：點歌從 POS 抽出成獨立系統（KK 11/6）。本檔只放純邏輯，路由在 server.js 的點歌區塊。
 * - 遙控：控台（任何一台平板／手機）送指令給播放裝置（電視／接音響那台）：播放、暫停、音量、靜音、重唱、音效。
 *   指令與播放裝置心跳存在 site_content `song_live:<VENUE>`（Cloud Run 多台機器共用，不放記憶體）。
 * - 統計：點歌營收（已結帳、未作廢的點歌品項）與點播排行。 */
const CMDS = ['play', 'pause', 'volume', 'mute', 'unmute', 'restart', 'sfx', 'sfx_stop'];
const SFX = ['applause', 'cheer', 'wow', 'laugh', 'drumroll'];
const CMD_TTL = 30e3, CMD_MAX = 20, BEAT_ONLINE = 15e3;
const err = (message, status = 400) => Object.assign(Error(message), { status });
const parse = raw => { try { const v = typeof raw === 'string' && raw ? JSON.parse(raw) : raw; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

function normalizeLive(raw) {
  const s = parse(raw);
  return { seq: Number.isInteger(s.seq) && s.seq >= 0 ? s.seq : 0, cmds: Array.isArray(s.cmds) ? s.cmds.slice(-CMD_MAX) : [], beat: s.beat && typeof s.beat === 'object' ? s.beat : null };
}
/* 控台送指令：驗證後排進佇列（只留最近 20 筆、30 秒內有效） */
function pushCmd(live, { cmd, arg } = {}, { now = Date.now(), by = '' } = {}) {
  if (!CMDS.includes(cmd)) throw err('不支援的遙控指令。');
  let a = null;
  if (cmd === 'volume') { a = num(arg, 0, 100); if (a == null) throw err('音量須為 0–100。'); a = Math.round(a); }
  if (cmd === 'sfx') { if (!SFX.includes(arg)) throw err('沒有這個音效。'); a = arg; }
  const seq = live.seq + 1, at = new Date(now).toISOString();
  const cmds = live.cmds.filter(c => now - Date.parse(c.at) < CMD_TTL).concat([{ seq, cmd, arg: a, at, by: String(by || '').slice(0, 40) }]).slice(-CMD_MAX);
  return { ...live, seq, cmds };
}
/* 播放裝置還沒執行的指令（seq 大於 ack、30 秒內） */
function pendingCmds(live, ack, now = Date.now()) {
  const n = Number(ack) || 0;
  return live.cmds.filter(c => c.seq > n && now - Date.parse(c.at) < CMD_TTL);
}
/* 播放裝置心跳：狀態、播放進度、音量；ack＝已執行到第幾號指令 */
function beat(live, b = {}, now = Date.now()) {
  const st = ['playing', 'paused', 'buffering', 'idle', 'blocked'].includes(b.state) ? b.state : 'idle';
  const beatRow = { device: String(b.device || '').slice(0, 64), name: String(b.name || '').slice(0, 40), mode: b.mode === 'tv' ? 'tv' : 'console', state: st,
    pos: num(b.pos, 0, 36000) ?? 0, dur: num(b.dur, 0, 36000) ?? 0, vol: Math.round(num(b.vol, 0, 100) ?? 100), muted: b.muted === true,
    video_id: /^[A-Za-z0-9_-]{11}$/.test(String(b.video_id || '')) ? b.video_id : '', ack: Math.max(0, Math.min(live.seq, Number(b.ack) || 0)), at: new Date(now).toISOString() };
  return { ...live, beat: beatRow };
}
/* 控台看到的播放裝置狀態：15 秒沒心跳＝離線；播放中的進度依心跳後經過的時間推算 */
function liveView(live, now = Date.now()) {
  const b = live.beat; if (!b) return { online: false, seq: live.seq };
  const age = now - Date.parse(b.at), online = age < BEAT_ONLINE;
  const pos = b.state === 'playing' && online ? Math.min(b.dur || Infinity, b.pos + age / 1000) : b.pos;
  return { online, seq: live.seq, device: b.device, name: b.name, mode: b.mode, state: online ? b.state : 'offline', pos: Math.round(pos), dur: Math.round(b.dur), vol: b.vol, muted: b.muted, video_id: b.video_id, at: b.at };
}

/* 點歌營收：已結帳、未作廢的訂單裡的點歌行（cat SONG），依品牌（行的 venue）過濾；回總數、金額、每日、每桌 */
const TPE = iso => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10);
function songSales(orders, { venue = null } = {}) {
  let count = 0, amount = 0; const byDay = {}, byTable = {}, bySong = {};
  for (const o of orders || []) {
    if (o.status === 'void') continue;
    const items = Array.isArray(o.items) ? o.items : parse(o.items);
    for (const l of Array.isArray(items) ? items : []) {
      if (!l || !l.song || l.cancelled || (venue && l.venue && l.venue !== venue)) continue;
      const n = (Number(l.price) || 0) * (Number(l.qty) || 1), day = o.paid_at ? TPE(o.paid_at instanceof Date ? o.paid_at.toISOString() : o.paid_at) : '';
      count++; amount += n;
      byDay[day] = byDay[day] || { day, count: 0, amount: 0 }; byDay[day].count++; byDay[day].amount += n;
      const t = String(o.table_no || ''); byTable[t] = byTable[t] || { table: t, count: 0, amount: 0 }; byTable[t].count++; byTable[t].amount += n;
      const title = String(l.zh || '').replace(/^點歌｜/, ''), k = l.song.video_id || title;
      bySong[k] = bySong[k] || { video_id: l.song.video_id || '', title, count: 0 }; bySong[k].count++;
    }
  }
  const sort = (a, k) => Object.values(a).sort((x, y) => y[k] - x[k] || String(x.day || x.table || x.title).localeCompare(String(y.day || y.table || y.title)));
  return { count, amount, days: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)), tables: sort(byTable, 'count').slice(0, 20), songs: sort(bySong, 'count').slice(0, 30) };
}

/* 舊資料是各品牌一份（song_settings:<VENUE>）；KTV 不分品牌後合併成一份：開關任一開＝開、價格／上限取第一份有開的、
   常態歌單取最長、時段歌單取聯集（同名同時段只留一個）、播放裝置取第一個有設的 */
function mergeSettings(list) {
  const all = (list || []).filter(Boolean); if (!all.length) return { enabled: false, price: 10, max_per_table: 3, max_minutes: 10, shuffle: false, playlist: [], schedules: [], player_device: '' };
  const base = all.find(s => s.enabled) || all[0], seen = new Set(), schedules = [];
  for (const s of all) for (const x of s.schedules || []) { const k = [x.name, x.days.join(''), x.start, x.end].join('|'); if (!seen.has(k)) { seen.add(k); schedules.push(x); } }
  return { ...base, enabled: all.some(s => s.enabled), shuffle: all.some(s => s.shuffle), playlist: all.map(s => s.playlist || []).sort((a, b) => b.length - a.length)[0], schedules: schedules.slice(0, 20), player_device: (all.find(s => s.player_device) || {}).player_device || '' };
}

module.exports = { mergeSettings, CMDS, SFX, CMD_TTL, BEAT_ONLINE, normalizeLive, pushCmd, pendingCmds, beat, liveView, songSales };
