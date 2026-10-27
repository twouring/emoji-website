'use strict';
/* 點歌：客人掃桌邊 QR 搜尋 YouTube 點歌（每首計價進這桌帳單），POS「點歌」分頁的播放裝置自動依序播放；沒人點歌時播常態歌單。
 * 狀態只存 site_content 兩列（不新增資料表）：song_settings（開關、單價、常態歌單、播放裝置）、song_state（待播、正在播、最近播過）。
 * 綁定的 YouTube 帳號存 song_youtube（伺服器端加密）。本檔只放純邏輯與 YouTube API 呼叫，交易與路由在 server.js。 */
const crypto = require('node:crypto');

const DEFAULTS = { enabled: false, price: 10, max_per_table: 3, max_minutes: 10, shuffle: false, playlist: [], player_device: '' };
const QUEUE_MAX = 50, HISTORY_MAX = 30, PLAYLIST_MAX = 300;
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const clean = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
const err = (message, status = 400) => Object.assign(Error(message), { status });
const parseJson = raw => { try { const v = typeof raw === 'string' && raw ? JSON.parse(raw) : raw; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

function track(t) {
  const id = String(t?.video_id || t?.id || '');
  if (!VIDEO_RE.test(id)) return null;
  const d = Number(t.duration);
  return { video_id: id, title: clean(t.title, 120) || id, channel: clean(t.channel, 80), thumb: /^https:\/\/i\.ytimg\.com\//.test(String(t.thumb || '')) ? String(t.thumb).slice(0, 200) : '', duration: Number.isFinite(d) && d > 0 ? Math.round(d) : null };
}
function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...parseJson(raw) };
  const int = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt; };
  const seen = new Set();
  return {
    enabled: s.enabled === true, price: int(s.price, 0, 1000, DEFAULTS.price), max_per_table: int(s.max_per_table, 1, 20, DEFAULTS.max_per_table),
    max_minutes: int(s.max_minutes, 1, 60, DEFAULTS.max_minutes), shuffle: s.shuffle === true,
    playlist: (Array.isArray(s.playlist) ? s.playlist : []).map(track).filter(t => t && !seen.has(t.video_id) && seen.add(t.video_id)).slice(0, PLAYLIST_MAX),
    player_device: clean(s.player_device, 64),
  };
}
/* 店家可改的欄位；player_device 只走「在這台播放」 */
function patchSettings(cur, body) {
  const b = body || {}, next = { ...cur };
  for (const k of ['enabled', 'shuffle']) if (typeof b[k] === 'boolean') next[k] = b[k];
  for (const k of ['price', 'max_per_table', 'max_minutes']) if (b[k] !== undefined) next[k] = b[k];
  if (Array.isArray(b.playlist)) next.playlist = b.playlist;
  const out = normalizeSettings(next);
  for (const k of ['price', 'max_per_table', 'max_minutes']) if (b[k] !== undefined && out[k] !== Math.round(Number(b[k]))) throw err({ price: '單價須為 0–1000 元。', max_per_table: '每桌待播上限須為 1–20 首。', max_minutes: '單首長度上限須為 1–60 分鐘。' }[k]);
  return out;
}
function normalizeState(raw) {
  const s = parseJson(raw);
  return { queue: Array.isArray(s.queue) ? s.queue.slice(0, QUEUE_MAX) : [], now: s.now && typeof s.now === 'object' ? s.now : null, history: Array.isArray(s.history) ? s.history.slice(0, HISTORY_MAX) : [], fallback_index: Number.isInteger(s.fallback_index) && s.fallback_index >= 0 ? s.fallback_index : 0 };
}

/* 排進待播：同一首不能重複排、每桌待播有上限；source 'guest'（客人付費）或 'pos'（店員免費） */
function enqueue(state, t, { table = '', by = '', source = 'guest', session_id = null, line = null, price = 0, maxPerTable = DEFAULTS.max_per_table, now = Date.now() } = {}) {
  const tr = track(t); if (!tr) throw err('找不到這首歌。');
  if (state.queue.length >= QUEUE_MAX) throw err('待播清單已滿，請稍後再點。', 409);
  if (state.queue.some(e => e.video_id === tr.video_id) || (state.now?.kind === 'request' && state.now.video_id === tr.video_id)) throw err('這首歌已經在待播清單裡了。', 409);
  if (source === 'guest' && table && state.queue.filter(e => e.table === table && e.source === 'guest').length >= maxPerTable) throw err(`每桌最多同時排 ${maxPerTable} 首，等前面的播完再點。`, 409);
  const entry = { id: 'sr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), ...tr, table: clean(table, 8), by: clean(by, 20), source: source === 'pos' ? 'pos' : 'guest', session_id, line, price: Math.max(0, Math.round(Number(price) || 0)), at: new Date(now).toISOString() };
  return { state: { ...state, queue: state.queue.concat([entry]) }, entry };
}
/* 播下一首：先把正在播的記進最近播過（result：ended／skip／error／preempt）。有人點歌就播最早那首，沒有就播常態歌單。
 * error（影片不能嵌入或已下架）回 refund＝那筆客人點歌，server 把還沒結帳的點歌品項從帳上拿掉。
 * preempt（有人點歌時切掉常態歌單）只對常態歌單有效，避免兩台同時按把客人的歌切掉。 */
function advance(state, settings, { result = 'ended', current = null, now = Date.now(), random = Math.random } = {}) {
  const at = new Date(now).toISOString();
  let { queue, history, fallback_index } = state, cur = state.now, refund = null;
  if (current && cur && current !== cur.id) return { state, song: cur, refund: null, stale: true };   // 別台已經換過歌
  if (result === 'preempt' && (cur?.kind === 'request' || !queue.length)) return { state, song: cur, refund: null, stale: true };
  if (cur) {
    history = [{ ...cur, result, ended_at: at }].concat(history).slice(0, HISTORY_MAX);
    if (result === 'error' && cur.kind === 'request' && cur.source === 'guest') refund = cur;
  }
  let song = null;
  if (queue.length) { const [next, ...rest] = queue; queue = rest; song = { ...next, kind: 'request', started_at: at }; }
  else if (settings.playlist.length) {
    const list = settings.playlist, i = settings.shuffle ? Math.floor(random() * list.length) : fallback_index % list.length;
    song = { ...list[i], id: 'pl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), kind: 'playlist', started_at: at };
    fallback_index = (i + 1) % list.length;
  }
  return { state: { queue, history, fallback_index, now: song }, song, refund };
}
function removeFromQueue(state, id) {
  const entry = state.queue.find(e => e.id === id);
  if (!entry) throw err('這首歌已經不在待播清單（可能已開始播放）。', 404);
  return { state: { ...state, queue: state.queue.filter(e => e.id !== id) }, entry };
}
/* 店員調整順序：把一首移到最前面 */
function moveToFront(state, id) {
  const entry = state.queue.find(e => e.id === id);
  if (!entry) throw err('這首歌已經不在待播清單。', 404);
  return { ...state, queue: [entry].concat(state.queue.filter(e => e.id !== id)) };
}
/* 客人看到的待播：只露歌名、桌號、是不是自己這桌點的 */
const pub = (e, table) => e && ({ id: e.id, video_id: e.video_id, title: e.title, channel: e.channel, thumb: e.thumb, duration: e.duration, table: e.kind === 'playlist' ? '' : e.table, mine: !!table && e.table === table && e.source === 'guest', kind: e.kind || 'request' });
function publicView(state, settings, table = '') {
  return { enabled: settings.enabled, price: settings.price, max_per_table: settings.max_per_table, max_minutes: settings.max_minutes, now: pub(state.now, table), queue: state.queue.map(e => pub(e, table)) };
}
/* 點歌品項：直接以「已送出、已完成」狀態掛在桌上（不進出餐看板、不印出餐單，客人也不能自己刪），結帳時和餐點一起收 */
function songLine(entry, { venue, guest, now = Date.now() }) {
  const at = new Date(now).toISOString();
  return {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: 'song', venue: venue || 'BAR', cat: 'SONG',
    zh: ('點歌｜' + entry.title).slice(0, 60), en: ('Song | ' + entry.title).slice(0, 60), ja: ('リクエスト曲｜' + entry.title).slice(0, 60),
    price: entry.price, qty: 1, by: entry.by || '客人', guest: String(guest), note: '', order_id: null, added_at: at, placed_at: at, served_at: at,
    song: { request_id: entry.id, video_id: entry.video_id },
  };
}

/* ---- 點播統計（site_content.song_stats）：客人點過的歌累計次數與最後點播時間，供「熱門」「最近點過」 ---- */
const STATS_MAX = 500;
function normalizeStats(raw) { const s = parseJson(raw); return s && typeof s.songs === 'object' && s.songs ? { songs: s.songs } : { songs: {} }; }
function bumpStats(stats, t, now = Date.now()) {
  const tr = track(t); if (!tr) return stats;
  const songs = { ...stats.songs }, cur = songs[tr.video_id];
  songs[tr.video_id] = { ...tr, count: (cur ? Number(cur.count) || 0 : 0) + 1, last_at: new Date(now).toISOString() };
  const keys = Object.keys(songs);
  if (keys.length > STATS_MAX) keys.sort((a, b) => String(songs[a].last_at).localeCompare(String(songs[b].last_at))).slice(0, keys.length - STATS_MAX).forEach(k => delete songs[k]);
  return { songs };
}
function discoverLists(stats, { limit = 20, maxSeconds = 0 } = {}) {
  const fits = t => !maxSeconds || !t.duration || t.duration <= maxSeconds;
  const all = Object.values(stats.songs || {}).filter(t => track(t) && fits(t));
  const out = t => ({ ...track(t), count: Number(t.count) || 0, last_at: t.last_at || null });
  return {
    popular: all.slice().sort((a, b) => (b.count - a.count) || String(b.last_at).localeCompare(String(a.last_at))).slice(0, limit).map(out),
    recent: all.slice().sort((a, b) => String(b.last_at).localeCompare(String(a.last_at))).slice(0, limit).map(out),
  };
}

/* ---- YouTube 網址解析 ---- */
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (VIDEO_RE.test(s)) return s;
  try { const u = new URL(s), h = u.hostname.replace(/^(www|m|music)\./, ''); if (h === 'youtu.be') return VIDEO_RE.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null; if (h === 'youtube.com') { const v = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/)?.[1]; return VIDEO_RE.test(v || '') ? v : null; } } catch {}
  return null;
}
function parsePlaylistId(input) {
  const s = String(input || '').trim();
  if (/^(PL|UU|LL|FL|OL|RD)[A-Za-z0-9_-]{8,}$/.test(s)) return s;
  try { const l = new URL(s).searchParams.get('list'); return l && /^[A-Za-z0-9_-]{10,}$/.test(l) ? l : null; } catch { return null; }
}
/* ISO 8601 PT#H#M#S → 秒 */
function parseDuration(iso) { const m = String(iso || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/); return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) : null; }
const decodeHtml = s => String(s || '').replace(/&(amp|lt|gt|quot|#39);/g, (_, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[c]));

/* ---- YouTube Data API v3：有綁帳號用帳號 token，否則用 API Key（YOUTUBE_API_KEY） ---- */
const API = 'https://www.googleapis.com/youtube/v3/';
function createYouTube({ fetchImpl = fetch, apiKey = '', getToken = async () => null } = {}) {
  async function call(path, params) {
    const token = await getToken(), key = typeof apiKey === 'function' ? apiKey() : apiKey;
    if (!token && !key) throw err('尚未綁定 YouTube 帳號，也沒有設定 YOUTUBE_API_KEY，無法搜尋。請在 POS「點歌」分頁綁定 YouTube 帳號。', 503);
    const qs = new URLSearchParams({ ...params, ...(token ? {} : { key }) });
    const r = await fetchImpl(API + path + '?' + qs, { signal: AbortSignal.timeout(10000), headers: token ? { authorization: 'Bearer ' + token } : {} });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const reason = d?.error?.errors?.[0]?.reason || ''; throw err(/quota/i.test(reason) ? 'YouTube 今日搜尋額度已用完，請明天再試或改貼影片網址。' : 'YouTube 暫時無法使用（' + (d?.error?.message || r.status) + '）。', /quota/i.test(reason) ? 429 : 502); }
    return d;
  }
  async function videos(ids) {
    const list = [...new Set(ids.filter(id => VIDEO_RE.test(id)))].slice(0, 50);
    if (!list.length) return [];
    const d = await call('videos', { part: 'snippet,contentDetails,status', id: list.join(','), maxResults: '50' });
    return (d.items || []).map(v => ({ ...track({ video_id: v.id, title: decodeHtml(v.snippet?.title), channel: decodeHtml(v.snippet?.channelTitle), thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url, duration: parseDuration(v.contentDetails?.duration) }), embeddable: v.status?.embeddable !== false && v.status?.privacyStatus !== 'private', live: v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none' }));
  }
  async function search(q) {
    const term = clean(q, 80); if (!term) return [];
    const direct = parseVideoId(term);
    if (direct) return videos([direct]);
    const d = await call('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', maxResults: '12', regionCode: 'TW', relevanceLanguage: 'zh-Hant', safeSearch: 'moderate', q: term });
    const ids = (d.items || []).map(i => i.id?.videoId).filter(Boolean);
    const info = new Map((await videos(ids)).map(v => [v.video_id, v]));
    return ids.map(id => info.get(id)).filter(v => v && v.embeddable && !v.live);
  }
  async function playlistItems(playlistId, max = PLAYLIST_MAX) {
    const ids = []; let pageToken = '';
    do { const d = await call('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) }); ids.push(...(d.items || []).map(i => i.contentDetails?.videoId).filter(Boolean)); pageToken = d.nextPageToken || ''; } while (pageToken && ids.length < max);
    const out = [];
    for (let i = 0; i < ids.length && i < max; i += 50) out.push(...await videos(ids.slice(i, i + 50)));
    return out.filter(v => v.embeddable && !v.live);
  }
  /* 排行榜：YouTube 台灣「音樂」類熱門影片（chart=mostPopular，1 單位額度） */
  async function chart(max = 30) {
    const d = await call('videos', { part: 'snippet,contentDetails,status', chart: 'mostPopular', regionCode: 'TW', videoCategoryId: '10', maxResults: String(Math.min(50, max)) });
    return (d.items || []).map(v => ({ ...track({ video_id: v.id, title: decodeHtml(v.snippet?.title), channel: decodeHtml(v.snippet?.channelTitle), thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url, duration: parseDuration(v.contentDetails?.duration) }), embeddable: v.status?.embeddable !== false, live: v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none' })).filter(v => v.video_id && v.embeddable && !v.live);
  }
  async function myPlaylists() {
    if (!await getToken()) throw err('請先綁定 YouTube 帳號。', 409);
    const d = await call('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: '50' });
    return (d.items || []).map(p => ({ id: p.id, title: decodeHtml(p.snippet?.title), count: p.contentDetails?.itemCount || 0 }));
  }
  async function myChannel() { const d = await call('channels', { part: 'snippet', mine: 'true' }); const c = d.items?.[0]; return c ? { id: c.id, title: decodeHtml(c.snippet?.title) } : null; }
  return { search, videos, playlistItems, myPlaylists, myChannel, chart };
}

/* ---- 綁定 YouTube 帳號（OAuth 2.0，沿用官網 Google 登入的 client） ---- */
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
function authUrl({ clientId, redirectUri, state }) {
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
}
async function tokenRequest(fetchImpl, body) {
  const r = await fetchImpl('https://oauth2.googleapis.com/token', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw err('YouTube 授權失敗（' + (d.error_description || d.error || r.status) + '），請重新綁定。', 502);
  return d;
}

module.exports = { normalizeStats, bumpStats, discoverLists, DEFAULTS, QUEUE_MAX, VIDEO_RE, SCOPE, track, normalizeSettings, patchSettings, normalizeState, enqueue, advance, removeFromQueue, moveToFront, publicView, songLine, parseVideoId, parsePlaylistId, parseDuration, createYouTube, authUrl, tokenRequest };
