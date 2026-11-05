/* 言文字 KTV（ktv.emoji.tw，KK 11/6）：點歌從 POS 抽出成獨立系統，屬言文字、不分品牌（全公司一份設定／待播／播放裝置）。
 * 頁面：/ 控台（正在播放＋遙控＋接下來＋找歌代點）、/tv 電視畫面（接音響的螢幕全螢幕播放）、/remote 手機遙控、
 *       /playlists 歌單（常態＋時段）、/stats 統計、/settings 設定（開關、價格、播放裝置、YouTube 帳號）。
 * 播放：只有被指定為播放裝置的那台跑 YouTube IFrame 播放器，每 2 秒回報心跳並領遙控指令；其他台用遙控指令操作。
 * API 沿用 /api/admin/orders/songs*（品牌子帳號也能用）。動態文字一律經 esc() 再進 innerHTML。 */
'use strict';
/* innerHTML 安全：所有動態字串（歌名、頻道、桌號、錯誤訊息）都經 esc() 轉義；P.exec 是播放器指令分派，與 child_process 無關。 */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NT = n => 'NT$' + Number(n || 0).toLocaleString('en-US');
const dur = s => s ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
const KEY = 'tth_ktv_token';
let token = null;
try { const h = new URLSearchParams(location.hash.slice(1)); if (h.get('token')) { localStorage.setItem(KEY, h.get('token')); history.replaceState(null, '', location.pathname); } token = localStorage.getItem(KEY); } catch (e) {}
let DEVICE = '';
try { DEVICE = localStorage.getItem('tth_ktv_device') || ''; if (!DEVICE) { DEVICE = 'ktv-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('tth_ktv_device', DEVICE); } } catch (e) { DEVICE = 'ktv-' + Date.now().toString(36); }
let toastT;
function toast(m){ if (!m) return; const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }
async function api(path, { method = 'GET', body } = {}){
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (res.status === 401 && token) { try { localStorage.removeItem(KEY); } catch (e) {} token = null; renderLogin('登入已過期，請重新登入。'); }
  if (!res.ok) throw Object.assign(new Error(d.error || '伺服器錯誤（' + res.status + '）'), { status: res.status });
  return d;
}
const S = p => api('/admin/orders/songs' + p.replace(/^\/?/, p ? '/' : ''));

/* ---------- 路由 ---------- */
/* ktv.emoji.tw 在根目錄；DNS 生效前的備用入口 pos.emoji.tw/ktv 在 /ktv 底下 */
const BASE = /^ktv\./i.test(location.hostname) ? '' : '/ktv';
const PAGES = [['console', '/', '控台'], ['remote', '/remote', '遙控'], ['playlists', '/playlists', '歌單'], ['stats', '/stats', '統計'], ['settings', '/settings', '設定'], ['tv', '/tv', '電視畫面']].map(([k, h, l]) => [k, (BASE + h).replace(/(.)\/$/, '$1'), l]);
let PAGE = 'console';
const route = () => (PAGES.find(p => p[0] !== 'console' && location.pathname.replace(/\/+$/, '') === p[1]) || PAGES[0])[0];
function go(page){ const p = PAGES.find(x => x[0] === page); if (!p) return; if (location.pathname !== p[1]) history.pushState(null, '', p[1]); PAGE = page; render(); }
document.addEventListener('click', e => { const a = e.target.closest('a[data-go]'); if (!a) return; e.preventDefault(); go(a.dataset.go); });
addEventListener('popstate', () => { PAGE = route(); render(); });

/* ---------- 資料 ---------- */
let D = null, LIVE = null, DISC = null, STATS = null, MINE = null, VIEW = 'popular', Q = '', RESULTS = null, SEARCHING = false, PICK = { mode: 'artist', group: '' }, ME = null;
const isPlayer = () => !!(D && D.settings.player_device && D.settings.player_device === DEVICE);
const SFX = [['applause', '掌聲'], ['cheer', '歡呼'], ['wow', '哇～'], ['laugh', '笑聲'], ['drumroll', '鼓聲']];
async function loadData(){ const before = JSON.stringify(D); try { D = await S(''); } catch (e) { if (!D) throw e; return false; } return JSON.stringify(D) !== before; }
async function loadLive(){ const before = JSON.stringify(LIVE && { ...LIVE, pos: 0, at: 0 }); try { LIVE = await S('live'); } catch (e) { return false; } return JSON.stringify({ ...LIVE, pos: 0, at: 0 }) !== before; }
async function loadDisc(){ try { DISC = await S('discover'); } catch (e) { DISC = { popular: [], recent: [], chart: [], error: e.message }; } }

/* ---------- 共用元件 ---------- */
function who(t){
  if (!t) return '';
  if (t.kind === 'playlist') return '<span class="who pl">常態歌單</span>';
  if (t.source === 'pos') return '<span class="who">現場代點</span>';
  if (t.source === 'guest' || t.table) return `<span class="who guest">桌 ${esc(t.table || '—')}${t.by ? '・' + esc(t.by) : ''}</span>`;
  return '';
}
function metaLine(t){ return [t.channel, t.duration ? dur(t.duration) : '', t.source === 'guest' && t.price ? NT(t.price) : '', t.count ? `點過 ${t.count} 次` : ''].filter(Boolean).map(esc).join('・'); }
function row(t, act, rank){
  return `<li class="row">${rank != null ? `<span class="rank">${rank}</span>` : ''}${t.thumb ? `<img src="${esc(t.thumb)}" alt="" loading="lazy">` : '<span class="ph" aria-hidden="true">♪</span>'}<div class="meta">${t.kind || t.source ? who(t) : ''}<b>${esc(t.title)}</b><small>${metaLine(t)}</small></div>${act ? `<div class="act">${act}</div>` : ''}</li>`;
}
function liveState(){
  if (!D) return { label: '', on: false };
  if (!D.settings.player_device) return { label: '還沒有播放裝置', on: false };
  if (isPlayer()) return { label: '這台是播放裝置', on: true };
  if (!LIVE || !LIVE.online) return { label: '播放裝置離線', on: false };
  return { label: '播放裝置' + (LIVE.name ? '：' + LIVE.name : '在線'), on: true };
}
function cur(){ // 正在播放的狀態：播放裝置是自己就讀本機播放器，否則讀心跳
  if (isPlayer()) return { state: P.playing ? 'playing' : (P.yt ? 'paused' : 'idle'), pos: P.pos(), dur: P.dur(), vol: P.vol, muted: P.muted };
  return LIVE && LIVE.online ? LIVE : { state: 'offline', pos: 0, dur: 0, vol: 100, muted: false };
}
function nowCard({ slot = false, compact = false } = {}){
  const n = D.now, c = cur(), up = (D.upcoming || { items: [] }).items;
  if (!n) return `<section class="now idle" aria-label="正在播放"><span class="art" aria-hidden="true">KTV</span><div class="meta"><b>目前沒有在播放</b><small>${up.length ? (D.settings.player_device ? '按「開始播放」。' : '到「設定」指定播放裝置，或在接音響的螢幕開 ktv.emoji.tw/tv。') : '現在不在任何時段歌單內，也沒有人點歌。'}</small></div>${up.length ? '<div class="remote"><button type="button" class="btn btn--hit" data-k-skip>開始播放</button></div>' : ''}</section>`;
  const art = slot && isPlayer() ? '<div class="art" data-k-slot></div>' : n.thumb ? `<img class="art" src="${esc(n.thumb)}" alt="">` : '<span class="art" aria-hidden="true">♪</span>';
  const playing = c.state === 'playing';
  return `<section class="now" aria-label="正在播放">${art}<div class="meta">${who(n)}<b>${esc(n.title)}</b><small>${esc(n.channel || '')}</small>
    <div class="prog" data-k-prog><span data-k-pos>${dur(c.pos)}</span><i><s style="width:${c.dur ? Math.min(100, c.pos / c.dur * 100).toFixed(1) : 0}%"></s></i><span>${dur(c.dur || n.duration)}</span></div></div>
    <div class="remote">
      <button type="button" class="btn btn--hit" data-k-cmd="${playing ? 'pause' : 'play'}">${playing ? '暫停' : '播放'}</button>
      <button type="button" class="btn" data-k-skip>下一首</button>
      <button type="button" class="btn" data-k-cmd="restart">重唱</button>
      <button type="button" class="btn" data-k-cmd="${c.muted ? 'unmute' : 'mute'}">${c.muted ? '開聲音' : '靜音'}</button>
      ${compact ? '' : `<label class="vol">音量<input type="range" min="0" max="100" step="5" value="${esc(c.vol)}" data-k-vol aria-label="音量"><output data-k-volv>${esc(c.vol)}</output></label>`}
    </div></section>`;
}
function sfxGrid(){ return `<div class="sfx" role="group" aria-label="音效"><button type="button" class="stop" data-k-cmd="sfx_stop">停止音效</button>${SFX.map(([k, l]) => `<button type="button" data-k-sfx="${k}">${esc(l)}</button>`).join('')}</div>`; }


/* ---------- 點歌兌換碼（KK 11/6）：客人在桌邊點餐頁買好首數 → 這裡按「發兌換碼」→ 店員把 6 位數碼給客人
   → 客人掃播放裝置（電視 /tv）上的 QR（綁定這台）→ 輸入兌換碼選歌 ---------- */
function qrImg(url, size){ if (!url || typeof QRCode === 'undefined' || !QRCode.toDataURL) return ''; let out = ''; QRCode.toDataURL(url, { width: size, margin: 2 }, (e, d) => { out = e ? '' : d; }); return out; }
const QR_CACHE = {};
function qrSrc(url, size){ const k = size + '|' + url; if (!(k in QR_CACHE)) QR_CACHE[k] = qrImg(url, size); return QR_CACHE[k]; }
function ticketsOf(){ return (D && D.song_tickets) || { tables: [], tickets: [] }; }
const fmtCode = c => String(c || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');
const hhmm = iso => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
let SHOW_TICKET = '';
function ticketPanel(){
  const b = ticketsOf();
  const wait = b.tables.length ? `<ul class="list">${b.tables.map(x => `<li class="row"><div class="meta"><b>桌 ${esc(x.table)}</b><small>已購買 ${esc(x.unissued)} 首，還沒發兌換碼</small></div><div class="act"><button type="button" class="btn btn--sm btn--solid" data-k-issue="${esc(x.session_id)}">發兌換碼</button></div></li>`).join('')}</ul>` : '<p class="empty">目前沒有待發兌換碼的桌。客人在桌邊點餐頁買好點歌後會出現在這裡。</p>';
  const act = b.tickets.length ? `<ul class="list">${b.tickets.map(x => `<li class="row"><div class="meta"><b>${x.comp ? '招待' + (x.table ? '・' + esc(x.table) : '') : '桌 ' + esc(x.table)}・<span class="k-code">${esc(fmtCode(x.code))}</span></b><small>剩 ${esc(x.left)}／${esc(x.total)} 首・有效至 ${esc(hhmm(x.expires_at))}</small></div><div class="act"><button type="button" class="btn btn--sm" data-k-showqr="${esc(x.id)}">放大</button></div></li>`).join('')}</ul>` : '';
  const comp = `<form class="k-comp" data-k-compform><b>招待兌換碼</b><label>首數 <input name="n" type="number" inputmode="numeric" min="1" max="20" value="1" required></label><label>桌號／備註 <input name="label" maxlength="8" placeholder="選填"></label><button type="submit" class="btn btn--sm">產生招待碼</button><small>不用先購買、不記帳</small></form>`;
  return `<section class="panel k-tix" aria-labelledby="h-tix"><h2 id="h-tix">點歌兌換碼 <small>桌邊只能購買首數；把兌換碼給客人，客人掃播放裝置畫面上的 QR 後輸入</small></h2>${wait}${comp}${act ? '<h3>可使用</h3>' + act : ''}</section>`;
}
function qrOverlay(){
  const t = ticketsOf().tickets.find(x => x.id === SHOW_TICKET); if (!t) return '';
  return `<div class="qr-ov" role="dialog" aria-label="點歌兌換碼"><div class="qr-card"><h2>${t.comp ? '招待' + (t.table ? '・' + esc(t.table) : '') : '桌 ' + esc(t.table)}・點歌兌換碼</h2><p class="k-bigcode">${esc(fmtCode(t.code))}</p><p>可點 ${esc(t.left)}／${esc(t.total)} 首・有效至 ${esc(hhmm(t.expires_at))}</p><p class="muted">請客人掃播放裝置畫面上的 QR，輸入這組號碼選歌</p><button type="button" class="btn btn--solid" data-k-qrclose>關閉</button></div></div>`;
}

/* ---------- 頁面：控台 ---------- */
function queueActs(t, n){
  const i = t.pos - 1, id = esc(t.id);
  return `<button type="button" class="btn btn--sm" data-k-move="${id}" data-to="${i - 1}" aria-label="往前移 ${esc(t.title)}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn--sm" data-k-move="${id}" data-to="${i + 1}" aria-label="往後移 ${esc(t.title)}" ${i >= n - 1 ? 'disabled' : ''}>↓</button>${i > 0 ? `<button type="button" class="btn btn--sm" data-k-top="${id}">下一首播</button>` : ''}<button type="button" class="btn btn--sm btn--danger" data-k-del="${id}">移除</button>`;
}
function findHtml(){
  const tabs = [['popular', '熱門'], ['recent', '最近點過'], ['chart', '排行榜'], ['search', '搜尋']];
  let body;
  if (VIEW === 'search') body = `<form class="search" data-k-search><input type="search" name="q" value="${esc(Q)}" placeholder="歌名、歌手，或貼 YouTube 網址" maxlength="80" autocomplete="off" enterkeyhint="search" aria-label="搜尋歌曲"></form><div data-k-results aria-live="polite">${resultsHtml()}</div>`;
  else if (!DISC) body = '<p class="hint">載入中…</p>';
  else { const l = DISC[VIEW] || []; body = l.length ? listHtml(l, VIEW !== 'recent') : `<p class="empty">${esc({ popular: '還沒有客人點過歌，累積後依點播次數排行。', recent: '還沒有客人點過歌。', chart: '排行榜暫時讀不到（需要綁定 YouTube 帳號或設定 API 金鑰）。' }[VIEW])}</p>`; }
  return `<div class="tabs" role="tablist" aria-label="找歌方式">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${VIEW === k}" data-k-view="${k}">${l}</button>`).join('')}</div><div class="scroll" data-k-find>${body}</div>`;
}
function listHtml(list, ranked){
  const queued = new Set([...(D.queue || []).map(t => t.video_id), D.now && D.now.kind === 'request' ? D.now.video_id : ''].filter(Boolean));
  return `<ul class="list">${list.map((t, i) => row(t, queued.has(t.video_id) ? '<span class="pill">已在待播</span>' : `<button type="button" class="btn btn--sm" data-k-queue="${esc(t.video_id)}">代點</button><button type="button" class="btn btn--sm btn--solid" data-k-queue="${esc(t.video_id)}" data-front>插播</button>`, ranked ? i + 1 : null)).join('')}</ul>`;
}
function resultsHtml(){
  if (SEARCHING) return '<p class="hint">搜尋中…</p>';
  return RESULTS == null ? SongPicks.html(PICK, 'zh', esc) : SongPicks.back('zh', esc) + (RESULTS.length ? listHtml(RESULTS, false) : '<p class="empty">找不到可播放的歌曲。</p>');
}
function pageConsole(){
  const s = D.settings, up = D.upcoming || { items: [] }, ls = liveState(), reqN = D.queue.length;
  const queue = up.items.length ? `<ol class="list">${up.items.map(t => row(t, t.kind === 'request' ? queueActs(t, reqN) : '', t.pos)).join('')}</ol>` : '<p class="empty">沒有接下來的歌。歌單在「歌單」頁設定。</p>';
  const note = up.playlist_count ? `<p class="hint">${esc(up.playlist_name || '常態歌單')} 共 ${esc(up.playlist_count)} 首，${up.shuffle ? '隨機播放' : '依序播放'}，播完自動輪播。</p>` : '';
  const hist = D.history.length ? `<details><summary class="hint">最近播過（${Math.min(10, D.history.length)}）</summary><ul class="list">${D.history.slice(0, 10).map(t => row(t, t.result === 'error' ? '<span class="pill">無法播放已跳過</span>' : t.result === 'skip' ? '<span class="pill">跳過</span>' : '')).join('')}</ul></details>` : '';
  return `<div class="k-head"><h1>控台</h1><span class="pill ${s.enabled ? 'on' : 'off'}">客人點歌${s.enabled ? '開放中・每首 ' + NT(s.price) : '關閉'}</span><span class="pill ${ls.on ? 'on' : 'off'}">${esc(ls.label)}</span>
    <div class="k-act">${isPlayer() ? '' : '<button type="button" class="btn btn--sm" data-k-claim>在這台播放</button>'}<a class="btn btn--sm" href="${BASE}/tv" data-go="tv">電視畫面</a></div></div>
  ${sfxGrid()}
  ${ticketPanel()}${qrOverlay()}
  <div class="k-grid">
    <section class="panel" aria-labelledby="h-up">${nowCard({ slot: true })}<h2 id="h-up">接下來 <span class="cnt">${up.items.length}</span>${reqN ? `<small>點歌 ${reqN} 首優先</small>` : ''}</h2><div class="scroll">${queue}${note}${hist}</div></section>
    <section class="panel" aria-labelledby="h-find"><h2 id="h-find">找歌代點 <small>現場代點不收費</small></h2>${findHtml()}</section>
  </div>`;
}

/* ---------- 頁面：遙控（手機） ---------- */
function pageRemote(){
  const up = (D.upcoming || { items: [] }).items.slice(0, 5), c = cur(), ls = liveState();
  return `<div class="rc"><div class="k-head"><h1>遙控</h1><span class="pill ${ls.on ? 'on' : 'off'}">${esc(ls.label)}</span></div>
    ${nowCard({ compact: true })}
    <div class="rc-keys">
      <button type="button" class="btn" data-k-volstep="-10">音量 −<small data-k-volv>${esc(c.vol)}</small></button>
      <button type="button" class="btn" data-k-cmd="${c.muted ? 'unmute' : 'mute'}">${c.muted ? '開聲音' : '靜音'}</button>
      <button type="button" class="btn" data-k-volstep="10">音量 ＋</button>
    </div>
    ${sfxGrid()}
    <section class="panel"><h2>接下來</h2>${up.length ? `<ol class="list">${up.map(t => row(t, '', t.pos)).join('')}</ol>` : '<p class="empty">沒有接下來的歌。</p>'}<p class="hint"><a href="${BASE}/" data-go="console">到控台找歌、調整順序</a></p></section></div>`;
}

/* ---------- 頁面：歌單 ---------- */
const DAY = '日一二三四五六';
function pagePlaylists(){
  const s = D.settings, days = a => a.length === 7 ? '每天' : a.map(x => DAY[x]).join('、');
  const mine = MINE ? (MINE.length ? `<ul class="list">${MINE.map(p => `<li class="row"><div class="meta"><b>${esc(p.title)}</b><small>${esc(p.count)} 首</small></div><div class="act"><button type="button" class="btn btn--sm btn--solid" data-k-mine="${esc(p.id)}" data-mode="replace">取代</button><button type="button" class="btn btn--sm" data-k-mine="${esc(p.id)}" data-mode="append">接在後面</button></div></li>`).join('')}</ul>` : '<p class="empty">這個帳號沒有播放清單。</p>') : '';
  const pl = s.playlist.length ? `<details><summary class="hint">查看常態歌單（${s.playlist.length} 首）</summary><ol class="list">${s.playlist.map((t, i) => row(t, `<button type="button" class="btn btn--sm btn--danger" data-k-pldel="${i}" aria-label="移除 ${esc(t.title)}">移除</button>`, i + 1)).join('')}</ol><p><button type="button" class="btn btn--sm btn--danger" data-k-plclear>清空常態歌單</button></p></details>` : '<p class="empty">還沒有常態歌單。</p>';
  const sch = (s.schedules || []).length ? `<ol class="list">${s.schedules.map((x, i) => `<li class="row"><div class="meta"><b>${esc(x.name)}</b><small>${esc(days(x.days))} ${esc(x.start)}–${esc(x.end)}・${esc(x.playlist.length)} 首</small></div><div class="act"><button type="button" class="btn btn--sm btn--danger" data-k-schdel="${i}" aria-label="移除時段歌單 ${esc(x.name)}">移除</button></div></li>`).join('')}</ol>` : '<p class="empty">還沒有時段歌單。</p>';
  return `<div class="k-head"><h1>歌單</h1><span class="k-sub">沒有人點歌時播放；到了設定的時段改播時段歌單（台北時間）。</span></div>
  <div class="two">
    <section class="panel"><h2>常態歌單 <small>${s.playlist.length} 首</small></h2>
      <label class="switch"><input type="checkbox" data-k-shuffle ${s.shuffle ? 'checked' : ''}><span><b>隨機播放</b><small>${s.shuffle ? '每輪洗牌一次，每首各播一次。' : '依序播放，播完從頭。'}</small></span></label>
      <form class="form" data-k-import><label>YouTube 播放清單網址<input type="url" name="pl" placeholder="含 list= 的網址" autocomplete="off" required></label><button type="submit" class="btn btn--solid">匯入（取代）</button></form>
      ${D.youtube.connected ? '<p><button type="button" class="btn btn--sm" data-k-minelist>從我的 YouTube 播放清單匯入</button></p>' : ''}${mine}${pl}</section>
    <section class="panel"><h2>時段歌單 <small>${(s.schedules || []).length} 個</small></h2>${sch}
      <h3>新增時段歌單</h3>
      <form class="form" data-k-schadd>
        <label>名稱<input name="name" maxlength="60" required placeholder="例：平日午後"></label>
        <label>開始<input name="start" type="time" required value="08:00"></label>
        <label>結束<input name="end" type="time" required value="17:00"></label>
        <fieldset class="form" style="grid-column:1/-1;border:0;padding:0;margin:0;min-width:0"><legend class="hint">星期</legend>${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="switch" style="margin:0;padding:10px"><input type="checkbox" name="d" value="${d}" checked><span>週${DAY[d]}</span></label>`).join('')}</fieldset>
        <label style="grid-column:1/-1">YouTube 播放清單網址<input type="url" name="pl" placeholder="含 list= 的網址" autocomplete="off" required></label>
        <button type="submit" class="btn btn--solid">新增</button>
      </form><p class="hint">結束時間早於開始＝跨過午夜（例：21:00–02:30）。</p></section>
  </div>`;
}

/* ---------- 頁面：統計 ---------- */
const tpeDay = (n = 0) => new Date(Date.now() + 8 * 3600e3 - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
let RANGE = { from: tpeDay(-6), to: tpeDay(0) };
function pageStats(){
  const st = STATS;
  const head = `<div class="k-head"><h1>統計</h1><span class="k-sub">點歌營收只算已結帳、未作廢的點歌品項。</span></div>
    <form class="form panel" data-k-range style="margin:0 0 16px"><label>從<input type="date" name="from" value="${esc(RANGE.from)}" required></label><label>到<input type="date" name="to" value="${esc(RANGE.to)}" required></label><button type="submit" class="btn btn--solid">查詢</button></form>`;
  if (!st) return head + '<p class="hint">載入中…</p>';
  const days = st.days.length || 1, max = Math.max(1, ...st.days.map(d => d.count));
  return head + `<div class="kpis"><div class="kpi hit"><b>${esc(st.count)}</b><small>點歌首數</small></div><div class="kpi"><b>${esc(NT(st.amount))}</b><small>點歌營收</small></div><div class="kpi"><b>${esc((st.count / days).toFixed(1))}</b><small>有點歌的日子平均每日首數</small></div><div class="kpi"><b>${esc(st.tables.length)}</b><small>點過歌的桌數</small></div></div>
  <div class="two" style="margin-top:16px">
    <section class="panel"><h2>每日</h2>${st.days.length ? `<table class="tbl"><thead><tr><th>營業日</th><th>首數</th><th class="n">營收</th></tr></thead><tbody>${st.days.map(d => `<tr><td>${esc(d.day)}</td><td><span class="bar" style="width:${(d.count / max * 100).toFixed(0)}%"></span>${esc(d.count)}</td><td class="n">${esc(NT(d.amount))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">這段期間沒有點歌。</p>'}</section>
    <section class="panel"><h2>期間點播排行</h2>${st.songs.length ? `<ol class="list">${st.songs.slice(0, 15).map((t, i) => row({ ...t, count: t.count, thumb: t.video_id ? `https://i.ytimg.com/vi/${t.video_id}/mqdefault.jpg` : '' }, '', i + 1)).join('')}</ol>` : '<p class="empty">沒有資料。</p>'}</section>
    <section class="panel"><h2>桌次</h2>${st.tables.length ? `<table class="tbl"><thead><tr><th>桌號</th><th class="n">首數</th><th class="n">營收</th></tr></thead><tbody>${st.tables.map(t => `<tr><td>${esc(t.table || '—')}</td><td class="n">${esc(t.count)}</td><td class="n">${esc(NT(t.amount))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">沒有資料。</p>'}</section>
    <section class="panel"><h2>店內累計熱門 <small>全期間</small></h2>${(st.popular || []).length ? `<ol class="list">${st.popular.slice(0, 15).map((t, i) => row(t, '', i + 1)).join('')}</ol>` : '<p class="empty">還沒有資料。</p>'}</section>
  </div>`;
}
async function loadStats(){ STATS = null; paint(); try { STATS = await S('stats?from=' + RANGE.from + '&to=' + RANGE.to); } catch (e) { toast(e.message); STATS = { count: 0, amount: 0, days: [], tables: [], songs: [], popular: [] }; } if (PAGE === 'stats') paint(); }

/* ---------- 頁面：設定 ---------- */
function pageSettings(){
  const s = D.settings, yt = D.youtube, me = isPlayer(), ls = liveState();
  return `<div class="k-head"><h1>設定</h1><span class="k-sub">KTV 屬言文字系統，全公司共用一份設定，不分品牌。</span></div>
  <div class="two">
    <section class="panel"><h2>客人點歌</h2>
      <label class="switch"><input type="checkbox" data-k-enabled ${s.enabled ? 'checked' : ''}><span><b>開放客人點歌</b><small>${s.enabled ? `客人掃桌邊 QR 可點歌，每首 ${esc(NT(s.price))}，記在這桌帳上。` : '目前關閉：客人點餐頁不會出現點歌。'}</small></span></label>
      <form class="form" data-k-set><label>每首價格（NT$）<input type="number" name="price" min="0" max="1000" step="1" inputmode="numeric" value="${esc(s.price)}"></label><label>每桌同時最多排（首）<input type="number" name="max_per_table" min="1" max="20" step="1" inputmode="numeric" value="${esc(s.max_per_table)}"></label><label>單首長度上限（分鐘）<input type="number" name="max_minutes" min="1" max="60" step="1" inputmode="numeric" value="${esc(s.max_minutes)}"></label><button type="submit" class="btn btn--solid">儲存</button></form></section>
    <section class="panel"><h2>播放裝置</h2>
      <p class="hint">同一時間只有一台播放：接音響的螢幕開 <b>ktv.emoji.tw/tv</b> 按一下畫面即可接手。其他平板、手機都是遙控。</p>
      <p><span class="pill ${ls.on ? 'on' : 'off'}">${esc(ls.label)}</span></p>
      <p style="display:flex;gap:8px;flex-wrap:wrap">${me ? '<button type="button" class="btn" data-k-release>停止在這台播放</button>' : '<button type="button" class="btn btn--solid" data-k-claim>在這台播放</button>'}<a class="btn" href="${BASE}/tv" data-go="tv">開電視畫面</a></p></section>
    <section class="panel"><h2>YouTube 帳號</h2>${yt.connected
      ? `<p class="hint">已綁定${yt.channel ? '：<b>' + esc(yt.channel.title) + '</b>' : ''}${yt.connected_by ? `（${esc(yt.connected_by)} 綁定）` : ''}。搜尋、排行榜與歌單匯入用這個帳號。</p><button type="button" class="btn btn--danger" data-k-ytoff>解除綁定</button>`
      : `<p class="hint">${yt.api_key ? '目前用系統金鑰搜尋。' : '尚未綁定，客人與現場都無法搜尋。'}綁定後也可匯入帳號裡的播放清單。</p><button type="button" class="btn btn--solid" data-k-yton ${yt.oauth_ready ? '' : 'disabled'}>綁定 YouTube 帳號</button>`}</section>
    <section class="panel"><h2>登入</h2><p class="hint">${esc(ME ? (ME.email || ME.name || '已登入') : '')}</p><p class="hint">版本 v${esc(($('.k-ver') || {}).title ? $('.k-ver').title.replace(/^v/, '') : '')}</p></section>
  </div>`;
}

/* ---------- 頁面：電視 ---------- */
let TV_ARMED = false;
function pageTv(){
  const n = D.now, up = (D.upcoming || { items: [] }).items.slice(0, 6), c = cur();
  return `<div class="tv"><div class="tv-stage" data-k-slot>
      ${n ? '' : '<div class="tv-idle"><div><img src="/cis/assets/emoji-mark-reverse.svg" alt="言文字"><p>在桌邊點餐頁購買點歌，向店員索取兌換碼，掃右邊的 QR 輸入。</p></div></div>'}
      ${TV_ARMED && isPlayer() ? '' : `<button type="button" class="tv-tap" data-k-arm><span>${isPlayer() ? '點一下開始播放' : '點一下，改由這台播放'}</span></button>`}
      <div class="tv-sfx" data-k-sfxshow aria-live="polite"></div>
      <div class="tv-exit"><a class="btn btn--sm" href="${BASE}/" data-go="console">回控台</a></div></div>
    <div class="tv-bar">${n ? `${who(n)}<b>${esc(n.title)}</b>${n.channel ? `<span class="tv-ch">${esc(n.channel)}</span>` : ''}<div class="prog" data-k-prog><span data-k-pos>${dur(c.pos)}</span><i><s></s></i><span>${dur(c.dur || n.duration)}</span></div>` : '<b>言文字 KTV</b><span class="tv-ch">沒有人點歌時播放店內歌單</span>'}</div>
    <aside class="tv-side"><img src="/cis/assets/emoji-h-reverse.svg" alt="言文字">${D.device_url && isPlayer() ? `<div class="tv-qr"><img src="${esc(qrSrc(D.device_url, 480))}" alt="點歌 QR"><b>掃描點歌</b><small>輸入店員給的兌換碼</small><small>Scan, enter code</small></div>` : ''}<h2>接下來</h2>
      <ol class="tv-up">${up.length ? up.map((t, i) => `<li><span class="n">${esc(t.pos)}</span>${i === 0 ? '<span class="tv-next">下一首</span>' : ''}<b>${esc(t.title)}</b><small>${t.kind === 'playlist' ? '店內歌單' : t.source === 'pos' ? '現場代點' : '桌 ' + esc(t.table || '—') + (t.by ? '・' + esc(t.by) : '')}</small></li>`).join('') : '<li><small>還沒有人點歌</small></li>'}</ol></aside></div>`;
}

/* ---------- 繪製 ---------- */
const PAINT = { console: pageConsole, remote: pageRemote, playlists: pagePlaylists, stats: pageStats, settings: pageSettings, tv: pageTv };
function paintNav(){ $('#k-nav').innerHTML = PAGES.filter(p => p[0] !== 'tv').map(([k, href, l]) => `<a href="${href}" data-go="${k}"${PAGE === k ? ' aria-current="page"' : ''}>${l}</a>`).join(''); }
function paint(){
  const app = $('#app'); if (!D) return;
  document.body.classList.toggle('tv', PAGE === 'tv');
  if (PAGE === 'tv') { let tv = $('#tv-root'); if (!tv) { tv = document.createElement('div'); tv.id = 'tv-root'; document.body.appendChild(tv); } tv.innerHTML = pageTv(); }
  else { const tv = $('#tv-root'); if (tv) tv.remove(); const focus = document.activeElement && document.activeElement.matches('[data-k-search] input'); const scrolls = [...app.querySelectorAll('.scroll')].map(e => e.scrollTop); app.innerHTML = PAINT[PAGE](); [...app.querySelectorAll('.scroll')].forEach((e, i) => { e.scrollTop = scrolls[i] || 0; }); if (focus) { const i = $('[data-k-search] input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }
  placeDock();
}
function render(){ $('#k-top').hidden = PAGE === 'tv'; paintNav(); paint(); if (PAGE === 'stats') loadStats(); if (PAGE === 'console' && !DISC) loadDisc().then(() => { if (PAGE === 'console') paint(); }); }
function paintResults(){ const r = $('[data-k-results]'); if (r) r.innerHTML = resultsHtml(); }
/* 輪詢只更新進度條，不整頁重繪（避免按鈕被換掉、輸入中斷） */
function paintProgress(){
  const c = cur();
  document.querySelectorAll('[data-k-prog]').forEach(p => { const s = p.querySelector('s'), t = p.querySelector('[data-k-pos]'); const d = c.dur || (D && D.now && D.now.duration) || 0; if (s) s.style.width = (d ? Math.min(100, c.pos / d * 100) : 0).toFixed(1) + '%'; if (t) t.textContent = dur(c.pos); });
}

/* ---------- 操作 ---------- */
async function act(fn, msg){ try { const d = await fn(); if (d && d.settings) D = d; if (msg) toast(typeof msg === 'function' ? msg(d) : msg); } catch (e) { toast(e.message); } paint(); playerSync(); }
const post = (p, body) => api('/admin/orders/songs/' + p, { method: 'POST', body: body || {} });
/* 遙控：自己是播放裝置就直接操作，否則送指令給播放裝置（下次心跳約 2 秒內執行） */
async function remote(cmd, arg){
  if (isPlayer()) { P.exec({ cmd, arg }); setTimeout(paint, 300); return; }
  if (!LIVE || !LIVE.online) { if (cmd === 'sfx') { localSfx(arg); return toast('播放裝置離線，音效從這台播放'); } return toast('播放裝置離線，到「設定」確認接音響的螢幕有開 ktv.emoji.tw/tv'); }
  try { LIVE = await api('/admin/orders/songs/remote', { method: 'POST', body: { cmd, arg } }); toast({ play: '已送出：播放', pause: '已送出：暫停', restart: '已送出：重唱', mute: '已送出：靜音', unmute: '已送出：開聲音', sfx_stop: '已停止音效' }[cmd] || ''); } catch (e) { toast(e.message); }
}
function claim(){ P.unlock(); return act(() => post('player', { device: DEVICE }), '這台開始播放'); }
function release(){ P.stop(); return act(() => post('player', { release: true }), '已停止在這台播放'); }
let VOL_T = 0;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-k-vol]')) { document.querySelectorAll('[data-k-volv]').forEach(o => o.textContent = t.value); clearTimeout(VOL_T); VOL_T = setTimeout(() => remote('volume', Number(t.value)), 250); return; }
  if (t.matches('[data-k-search] input') && !e.isComposing) searchSoon(t.value);
});
document.addEventListener('compositionend', e => { if (e.target.matches && e.target.matches('[data-k-search] input')) searchSoon(e.target.value); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-k-enabled]')) return act(() => post('settings', { enabled: t.checked }), t.checked ? '已開放客人點歌' : '已關閉客人點歌');
  if (t.matches('[data-k-shuffle]')) return act(() => post('settings', { shuffle: t.checked }));
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-k-compform]'); if (!f) return; e.preventDefault();
  const n = Number(f.elements.n.value), label = f.elements.label.value.trim(), btn = f.querySelector('button'); btn.disabled = true;
  try { const r = await post('tickets', { comp: true, n, label }); D = { ...D, song_tickets: { tables: r.tables, tickets: r.tickets } }; SHOW_TICKET = r.ticket.id; toast('已產生招待兌換碼：' + r.ticket.total + ' 首'); }
  catch (err) { toast(err.message); btn.disabled = false; return; }
  paint();
});
document.addEventListener('click', async e => {
  if (e.target.matches && e.target.matches('.qr-ov')) { SHOW_TICKET = ''; return paint(); }
  const b = e.target.closest('button'); if (!b || !D) return;
  if (b.closest('.song-picks') || b.matches('[data-pick-back]')) { const pk = SongPicks.click(b, PICK); if (pk) { const i = $('[data-k-search] input'); if (pk.back) { if (i) i.value = ''; return runSearch(''); } if (pk.q) { if (i) i.value = pk.q; return runSearch(pk.q); } return paintResults(); } }
  if (b.dataset.kCmd) return remote(b.dataset.kCmd);
  if (b.dataset.kSfx) return remote('sfx', b.dataset.kSfx);
  if (b.dataset.kVolstep) { const v = Math.max(0, Math.min(100, (Number(cur().vol) || 0) + Number(b.dataset.kVolstep))); document.querySelectorAll('[data-k-volv]').forEach(o => o.textContent = v); return remote('volume', v); }
  if (b.matches('[data-k-skip]')) return act(() => post('next', { result: 'skip', current: D.now && D.now.id }));
  if (b.matches('[data-k-claim]')) return claim();
  if (b.matches('[data-k-release]')) return release();
  if (b.matches('[data-k-arm]')) return armTv();
  if (b.dataset.kIssue) { b.disabled = true; try { const r = await post('tickets', { session_id: b.dataset.kIssue }); D = { ...D, song_tickets: { tables: r.tables, tickets: r.tickets } }; SHOW_TICKET = r.ticket.id; toast('已發兌換碼：桌 ' + r.ticket.table + '，' + r.ticket.total + ' 首'); } catch (err) { toast(err.message); } return paint(); }
  if (b.dataset.kShowqr) { SHOW_TICKET = b.dataset.kShowqr; return paint(); }
  if (b.matches('[data-k-qrclose]')) { SHOW_TICKET = ''; return paint(); }
  if (b.dataset.kView) { VIEW = b.dataset.kView; paint(); if (VIEW === 'search') { const i = $('[data-k-search] input'); if (i) i.focus(); } return; }
  if (b.dataset.kQueue) { const front = b.hasAttribute('data-front'); b.disabled = true; return act(() => post('queue', { video_id: b.dataset.kQueue, front }), front ? '已插播，下一首播放' : '已排進待播'); }
  if (b.dataset.kMove) return act(() => post('queue/' + encodeURIComponent(b.dataset.kMove) + '/move', { to: Number(b.dataset.to) }));
  if (b.dataset.kTop) return act(() => post('queue/' + encodeURIComponent(b.dataset.kTop) + '/top'));
  if (b.dataset.kDel) { const t = D.queue.find(x => x.id === b.dataset.kDel); if (!t || !confirm(`移除「${t.title}」？${t.source === 'guest' && t.price ? `\n客人點的歌會一併從桌 ${t.table} 的帳上拿掉（${NT(t.price)}）。` : ''}`)) return; return act(() => api('/admin/orders/songs/queue/' + encodeURIComponent(t.id), { method: 'DELETE' }), d => d.refunded ? '已移除，並從桌上帳單拿掉' : '已移除'); }
  if (b.dataset.kPldel != null && b.dataset.kPldel !== '') { const i = Number(b.dataset.kPldel); return act(() => post('settings', { playlist: D.settings.playlist.filter((_, j) => j !== i) }), '常態歌單已更新'); }
  if (b.matches('[data-k-plclear]')) { if (!confirm('清空常態歌單？沒有人點歌、也不在時段內時會安靜無聲。')) return; return act(() => post('settings', { playlist: [] }), '常態歌單已清空'); }
  if (b.dataset.kSchdel != null && b.dataset.kSchdel !== '') { const i = Number(b.dataset.kSchdel), x = D.settings.schedules[i]; if (!x || !confirm(`移除時段歌單「${x.name}」？`)) return; return act(() => post('settings', { schedules: D.settings.schedules.filter((_, j) => j !== i) }), '時段歌單已更新'); }
  if (b.matches('[data-k-minelist]')) { try { MINE = (await api('/admin/orders/songs/youtube/playlists')).playlists; } catch (err) { toast(err.message); } return paint(); }
  if (b.dataset.kMine) { b.disabled = true; return act(() => post('playlist/import', { playlist: b.dataset.kMine, mode: b.dataset.mode }), d => `已匯入 ${d.imported} 首`); }
  if (b.matches('[data-k-yton]')) { try { const r = await post('youtube/connect', { redirect: location.origin + BASE + '/settings' }); location.href = r.url; } catch (err) { toast(err.message); } return; }
  if (b.matches('[data-k-ytoff]')) { if (!confirm('解除綁定 YouTube 帳號？')) return; try { await api('/admin/orders/songs/youtube', { method: 'DELETE' }); D = await S(''); } catch (err) { toast(err.message); } return paint(); }
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  if (f.matches('[data-k-search]')) return runSearch(f.q.value);
  if (f.matches('[data-k-set]')) return act(() => post('settings', { price: Number(f.price.value), max_per_table: Number(f.max_per_table.value), max_minutes: Number(f.max_minutes.value) }), '設定已儲存');
  if (f.matches('[data-k-import]')) return act(() => post('playlist/import', { playlist: f.pl.value.trim(), mode: 'replace' }), d => `已匯入 ${d.imported} 首`);
  if (f.matches('[data-k-schadd]')) { const days = [...f.querySelectorAll('[name=d]:checked')].map(x => Number(x.value)); if (!days.length) return toast('至少選一天'); return act(() => post('playlist/import', { playlist: f.pl.value.trim(), schedule: { name: f.name.value.trim(), days, start: f.start.value, end: f.end.value } }), d => `已新增時段歌單（${d.imported} 首）`); }
  if (f.matches('[data-k-range]')) { RANGE = { from: f.from.value, to: f.to.value }; return loadStats(); }
});
/* 即時搜尋：停 0.5 秒才送（YouTube 搜尋一次 100 額度）、注音組字中不送、丟棄舊回應 */
let SEARCH_T = 0, SEARCH_SEQ = 0, LAST_Q = '';
function searchSoon(q){ clearTimeout(SEARCH_T); Q = String(q || '').trim(); SEARCH_T = setTimeout(() => runSearch(q), 500); }
async function runSearch(q){
  clearTimeout(SEARCH_T); q = String(q || '').trim(); if (q && q === LAST_Q && (RESULTS != null || SEARCHING)) return;
  const seq = ++SEARCH_SEQ; Q = q; LAST_Q = q;
  if (!q) { RESULTS = null; SEARCHING = false; return paintResults(); }
  SEARCHING = true; paintResults(); let items = null;
  try { items = (await S('search?q=' + encodeURIComponent(q))).items; } catch (err) { if (seq === SEARCH_SEQ) toast(err.message); }
  if (seq !== SEARCH_SEQ) return; SEARCHING = false; if (items) RESULTS = items; else LAST_Q = ''; paintResults();
}

/* ---------- 音效（在播放裝置播放，和歌曲混音） ---------- */
const SFX_AUDIO = {};
function localSfx(id){
  let a = SFX_AUDIO[id]; if (!a) { a = SFX_AUDIO[id] = new Audio('/sfx/' + id + '.mp3'); a.preload = 'auto'; }
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  const p = a.play(); if (p && p.catch) p.catch(() => {});
  const show = $('[data-k-sfxshow]'); if (show) { show.textContent = (SFX.find(x => x[0] === id) || [, ''])[1]; show.classList.add('show'); setTimeout(() => show.classList.remove('show'), 2200); }
}
function stopSfx(){ Object.values(SFX_AUDIO).forEach(a => { try { a.pause(); a.currentTime = 0; } catch (e) {} }); }

/* ---------- 播放器（只在播放裝置） ---------- */
const P = {
  yt: null, ready: false, loaded: '', playing: false, muted: false, vol: 100, ack: 0, watch: 0, retry: '', busy: false, emptyAt: 0,
  pos(){ try { return this.yt ? this.yt.getCurrentTime() || 0 : 0; } catch (e) { return 0; } },
  dur(){ try { return this.yt ? this.yt.getDuration() || 0 : 0; } catch (e) { return 0; } },
  unlock(){ this.api(); },
  api(){
    if (window.YT && window.YT.Player) { this.ready = true; return; }
    if ($('#yt-iframe-api')) return;
    window.onYouTubeIframeAPIReady = () => { P.ready = true; playerSync(); };
    const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  },
  stop(){ clearTimeout(this.watch); try { this.yt && this.yt.destroy(); } catch (e) {} this.yt = null; this.loaded = ''; this.playing = false; const d = $('#ktv-dock'); if (d) d.remove(); },
  exec(c){
    const y = this.yt;
    if (c.cmd === 'sfx') return localSfx(c.arg);
    if (c.cmd === 'sfx_stop') return stopSfx();
    if (!y) return;
    try {
      if (c.cmd === 'play') { y.unMute(); this.muted = false; y.playVideo(); }
      else if (c.cmd === 'pause') y.pauseVideo();
      else if (c.cmd === 'volume') { this.vol = Math.max(0, Math.min(100, Number(c.arg) || 0)); y.setVolume(this.vol); if (this.vol > 0) { y.unMute(); this.muted = false; } }
      else if (c.cmd === 'mute') { y.mute(); this.muted = true; }
      else if (c.cmd === 'unmute') { y.unMute(); this.muted = false; }
      else if (c.cmd === 'restart') { y.seekTo(0, true); y.playVideo(); }
    } catch (e) {}
  },
};
function dock(){ let d = $('#ktv-dock'); if (!d) { d = document.createElement('div'); d.id = 'ktv-dock'; d.innerHTML = '<div id="ktv-yt"></div>'; document.body.appendChild(d); } return d; }
/* 播放器疊在畫面上的播放位置（控台大卡左側、電視畫面舞台）；其他頁面放畫面外繼續播（不搬 DOM，iframe 不重載） */
function placeDock(){
  const d = $('#ktv-dock'); if (!d) return;
  const slot = isPlayer() && $('[data-k-slot]');
  if (!slot) { d.classList.remove('placed'); d.style.left = d.style.top = d.style.width = d.style.height = ''; return; }
  const r = slot.getBoundingClientRect(); d.classList.add('placed');
  Object.assign(d.style, { left: r.left + 'px', top: r.top + 'px', width: Math.max(200, r.width) + 'px', height: Math.max(200, r.height) + 'px' });
}
addEventListener('resize', placeDock); document.addEventListener('scroll', placeDock, true);
async function next(result){
  if (P.busy) return; P.busy = true; const before = JSON.stringify(D);
  try { D = await api('/admin/orders/songs/next', { method: 'POST', body: { result, current: D && D.now ? D.now.id : null, device: DEVICE } }); if (D.refunded) toast('客人點的歌無法播放，已跳過並從帳上拿掉'); } catch (e) { toast(e.message); }
  P.busy = false; if (result === 'ended' && D && !D.now) P.emptyAt = Date.now();
  if (JSON.stringify(D) !== before) paint(); playerSync();
}
/* 卡在載入中（iPad 從外部按播放常停在緩衝 0%）：20 秒沒開始播 → 靜音重載一次，再不行換下一首 */
function watch(){
  clearTimeout(P.watch);
  P.watch = setTimeout(() => {
    if (!P.yt || !D || !D.now) return; if (document.visibilityState === 'hidden') return watch();
    let st = -1; try { st = P.yt.getPlayerState(); } catch (e) {}
    if (st === 1 || st === 2 || st === 0) return;
    if (P.retry !== D.now.id) { P.retry = D.now.id; try { P.yt.mute(); P.muted = true; P.yt.loadVideoById(D.now.video_id); } catch (e) {} return watch(); }
    next('error');
  }, 20000);
}
function playerSync(){
  if (!isPlayer()) { if (P.yt || $('#ktv-dock')) P.stop(); return; }
  P.api(); if (!P.ready) return;
  const n = D.now; dock(); placeDock();
  // 只看伺服器算好的「接下來」；換不出歌時 60 秒內不再要，避免一直重畫
  if (!n && (D.upcoming ? D.upcoming.items.length : D.queue.length) && Date.now() - P.emptyAt > 60000) return next('ended');
  if (n && n.kind === 'playlist' && D.queue.length) return next('preempt');
  if (!n) { try { P.yt && P.yt.stopVideo(); } catch (e) {} P.loaded = ''; return; }
  if (P.loaded === n.id) return;
  P.loaded = n.id;
  if (!P.yt) {
    P.yt = new YT.Player('ktv-yt', { width: '356', height: '200', videoId: n.video_id, playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: ev => { try { ev.target.setVolume(P.vol); if (TV_ARMED) { ev.target.unMute(); P.muted = false; } else { ev.target.mute(); P.muted = true; } ev.target.playVideo(); } catch (e) {} },
        onStateChange: ev => { P.playing = ev.data === YT.PlayerState.PLAYING; try { P.muted = ev.target.isMuted(); } catch (e) {} syncButtons(); if (ev.data === YT.PlayerState.ENDED) next('ended'); },
        onError: () => next('error') } });
  } else { try { P.yt.loadVideoById(n.video_id); } catch (e) { next('error'); } }
  watch();
}
/* 播放／暫停、靜音按鈕跟著播放器狀態換字（不整頁重繪） */
function syncButtons(){
  const c = cur();
  document.querySelectorAll('[data-k-cmd=play],[data-k-cmd=pause]').forEach(b => { b.dataset.kCmd = c.state === 'playing' ? 'pause' : 'play'; b.textContent = c.state === 'playing' ? '暫停' : '播放'; });
  document.querySelectorAll('[data-k-cmd=mute],[data-k-cmd=unmute]').forEach(b => { b.dataset.kCmd = c.muted ? 'unmute' : 'mute'; b.textContent = c.muted ? '開聲音' : '靜音'; });
}
/* 電視畫面：第一次點畫面＝解鎖聲音（瀏覽器規定要使用者手勢）、接手播放、全螢幕 */
async function armTv(){
  TV_ARMED = true; P.unlock();
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch (e) {}
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) {}
  if (!isPlayer()) await act(() => post('player', { device: DEVICE }), '這台開始播放');
  try { if (P.yt) { P.yt.unMute(); P.muted = false; P.yt.playVideo(); } } catch (e) {}
  paint(); playerSync();
}
/* 心跳：播放裝置每 2 秒回報狀態並領遙控指令 */
async function beatTick(){
  if (!isPlayer() || document.hidden) return;
  const c = cur();
  try {
    const out = await api('/admin/orders/songs/beat', { method: 'POST', body: { device: DEVICE, name: PAGE === 'tv' ? '電視畫面' : '控台', mode: PAGE === 'tv' ? 'tv' : 'console', state: P.yt ? (P.playing ? 'playing' : 'paused') : 'idle', pos: c.pos, dur: c.dur, vol: P.vol, muted: P.muted, video_id: D.now ? D.now.video_id : '', ack: P.ack } });
    if (!P.ack) P.ack = out.seq; // 剛接手：之前的指令不補做
    for (const cmd of out.cmds || []) { if (cmd.seq > P.ack) { P.exec(cmd); P.ack = cmd.seq; } }
    syncButtons();
  } catch (e) { if (e.status === 409) { await loadData(); playerSync(); paint(); } }
}

/* ---------- 登入 ---------- */
function renderLogin(msg){
  $('#k-top').hidden = true; document.body.classList.remove('tv'); const tv = $('#tv-root'); if (tv) tv.remove(); P.stop();
  const back = location.origin + location.pathname;
  const redirect = encodeURIComponent(globalThis.EmojiSSO ? EmojiSSO.wrap(back) : back);
  $('#app').innerHTML = `<div class="login"><div class="login-card"><img src="/cis/assets/emoji-mark.svg" alt="言文字" width="64" height="64"><h1>言文字 KTV</h1>
    <p class="hint"${msg ? ' role="alert"' : ''}>${esc(msg || '用言文字管理員或 POS 帳號登入。')}</p>
    <a class="btn btn--solid" href="/auth/google?redirect=${redirect}">使用 Google 登入</a>
    <p class="login-or">或用 Email</p>
    <form id="k-pw"><input name="email" type="email" autocomplete="username" placeholder="Email" required aria-label="Email"><input name="password" type="password" autocomplete="current-password" placeholder="密碼" required aria-label="密碼"><button type="submit" class="btn">Email 密碼登入</button><p class="hint" id="k-pw-err" role="alert" hidden></p></form>
  </div></div>`;
  $('#k-pw').onsubmit = async ev => { ev.preventDefault(); const f = ev.target, er = $('#k-pw-err'); er.hidden = true;
    try { const r = await api('/auth/admin/password', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); token = r.token; localStorage.setItem(KEY, token); main(); }
    catch (e) { f.password.value = ''; er.textContent = e.message; er.hidden = false; } };
}
$('#k-logout').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} token = null; if (isPlayer()) post('player', { release: true }).catch(() => {}); renderLogin(); };

/* ---------- 開機 ---------- */
let TIMERS = [];
async function main(){
  PAGE = route();
  if (!token) return renderLogin();
  try {
    const st = await api('/state');
    if (st.role !== 'admin') return renderLogin('這個帳號沒有言文字後台權限。');
    ME = st.me || {};
    await loadData();
  } catch (e) { if (e.status === 401) return; $('#app').innerHTML = `<p class="hint">暫時無法連線：${esc(e.message)}</p><button type="button" class="btn" onclick="location.reload()">重新整理</button>`; return; }
  $('#k-top').hidden = PAGE === 'tv';
  render(); playerSync(); loadLive().then(paint);
  TIMERS.forEach(clearInterval);
  TIMERS = [
    setInterval(async () => { if (document.hidden) return; const ch = await loadData(); const typing = document.activeElement && document.activeElement.matches('input,select'); if (ch && !typing) paint(); playerSync(); }, 5000),
    setInterval(async () => { if (document.hidden || isPlayer()) return; const ch = await loadLive(); if (ch) syncButtons(); paintProgress(); }, 2000),
    setInterval(beatTick, 2000),
    setInterval(paintProgress, 1000),
    setInterval(async () => { try { const d = await api('/auth/renew', { method: 'POST', body: {} }); if (d.token) { token = d.token; localStorage.setItem(KEY, token); } } catch (e) {} }, 6 * 3600e3),
  ];
  (function(){ const p = new URLSearchParams(location.search).get('youtube'); if (p) { setTimeout(() => toast({ connected: 'YouTube 帳號已綁定', cancelled: '已取消綁定 YouTube', failed: 'YouTube 綁定失敗，請再試一次' }[p] || ''), 600); history.replaceState(null, '', location.pathname); } })();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && D) loadData().then(() => { paint(); playerSync(); }); });
main();
