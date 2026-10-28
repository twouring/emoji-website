/* POS 點歌分頁（/pos/songs）＋播放器＋設定頁「點歌設定」區塊。依賴 pos.html 的 esc/api/toast/TAB/DEVICE_ID/go/POSIcon 與 pos-ops.js 的 posConfirm。
 * 分頁只放營業現場要用的：正在播放（大卡＋下一首）、待播清單、找歌代點（熱門／最近點過／排行榜／搜尋）。
 * 開關、價格、上限、常態歌單、播放裝置、YouTube 帳號放在「設定」頁的點歌區塊（songSettingsSection／bindSongSettings，由 pos-settings.js 呼叫）。
 * 播放裝置：接音響的那台按「在這台播放」，播放器常駐右下角（切分頁也繼續播），播完自動換下一首；有人點歌時若在播常態歌單，立刻切過去。
 * 動態文字一律經 esc() 再進 innerHTML（與其他 POS 分頁相同）。 */
let SONGS = { data: null, view: 'popular', disc: null, results: null, q: '', searching: false, mine: null, focus: false };
const SONG_POLL_MS = 5000;
const songDur = s => s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '';
function tabSongs(){ return '<div class="a-sec" id="songs-body"></div>'; }
function resetSongs(){ SONGS = { data: null, view: 'popular', disc: null, results: null, q: '', searching: false, mine: null, focus: false }; }
function isSongPlayer(){ return !!(SONGS.data && SONGS.data.settings.player_device && SONGS.data.settings.player_device === DEVICE_ID); }

async function loadSongs(){
  const host = document.getElementById('songs-body'); if (!host) return;
  if (!SONGS.data) host.innerHTML = '<div class="ops-head"><h2>點歌</h2></div><p class="hint">載入中…</p>';
  try { SONGS.data = await api('/admin/orders/songs'); } catch (e) { host.innerHTML = `<div class="ops-head"><h2>點歌</h2></div><p class="a-empty">載入失敗：${esc(e.message)}</p>`; return; }
  paintSongs(); songPlayerSync();
  if (!SONGS.disc) songLoadDiscover();
}
async function songLoadDiscover(){
  try { SONGS.disc = await api('/admin/orders/songs/discover'); } catch (e) { SONGS.disc = { popular: [], recent: [], chart: [], error: e.message }; }
  if (TAB === 'songs') paintSongs();
}
/* 歌曲列：標題最多兩行（不再截成一行），次要資訊另起一行並可換行 */
function songMeta(t){
  return [t.channel, songDur(t.duration), t.source === 'guest' && t.price ? `NT$${t.price}` : '', t.count ? `點過 ${t.count} 次` : '']
    .filter(Boolean).map(esc).join('<i aria-hidden="true">・</i>');
}
/* 誰點的：客人點歌＝「桌 A3・小明」、櫃檯代點、常態歌單 */
function songWho(t){
  if (t.kind === 'playlist') return '<span class="song-who is-pl">常態歌單</span>';
  if (t.source === 'pos') return '<span class="song-who is-pos">櫃檯代點</span>';
  if (t.source === 'guest' || t.table) return `<span class="song-who is-guest"><b>桌 ${esc(t.table || '—')}</b>${t.by ? `・${esc(t.by)}` : ''}</span>`;
  return '';
}
function songRow(t, actions, { rank = null } = {}){
  return `<li class="song-row">${rank != null ? `<span class="song-rank">${rank}</span>` : ''}${t.thumb ? `<img src="${esc(t.thumb)}" alt="" loading="lazy">` : '<span class="song-ph" aria-hidden="true">♪</span>'}<div class="song-meta">${t.kind || t.source ? songWho(t) : ''}<b>${esc(t.title)}</b><small>${songMeta(t)}</small></div>${actions ? `<div class="song-act">${actions}</div>` : ''}</li>`;
}
const SONG_VIEWS = [['popular', '熱門'], ['recent', '最近點過'], ['chart', '排行榜'], ['search', '搜尋']];
function songListHtml(list, ranked){
  const D = SONGS.data, queued = new Set([...(D.queue || []).map(t => t.video_id), D.now && D.now.kind === 'request' ? D.now.video_id : ''].filter(Boolean));
  return `<ul class="song-list">${list.map((t, i) => songRow(t, queued.has(t.video_id) ? '<span class="pill pill-draft">已在待播</span>' : `<button type="button" class="btn btn--ghost btn-sm" data-song-queue="${esc(t.video_id)}">代點</button><button type="button" class="btn btn--solid btn-sm" data-song-queue="${esc(t.video_id)}" data-song-front>插播</button>`, { rank: ranked ? i + 1 : null })).join('')}</ul>`;
}
/* 待播排序：↑／↓ 一次挪一格、「下一首播」直接排到最前；第一首與最後一首對應的按鈕停用 */
function songQueueActs(t, n){
  const i = t.pos - 1, id = esc(t.id), dis = c => c ? ' disabled' : '';
  return `<button type="button" class="btn btn--ghost btn-sm song-mv" data-song-move="${id}" data-to="${i - 1}" aria-label="往前移 ${esc(t.title)}"${dis(i === 0)}>↑</button>`
    + `<button type="button" class="btn btn--ghost btn-sm song-mv" data-song-move="${id}" data-to="${i + 1}" aria-label="往後移 ${esc(t.title)}"${dis(i >= n - 1)}>↓</button>`
    + (i > 0 ? `<button type="button" class="btn btn--ghost btn-sm" data-song-top="${id}">下一首播</button>` : '')
    + `<button type="button" class="btn btn--ghost btn-sm song-danger" data-song-del="${id}">移除</button>`;
}
/* KTV 音效：在按下的這台平板播放（接音響的播放裝置上按，聲音就從音響出來），和歌曲混音、不打斷播放。音檔 CC0（BigSoundBank）放 /sfx */
const SONG_SFX = [['applause', '掌聲'], ['cheer', '歡呼'], ['wow', '哇～'], ['laugh', '笑聲'], ['drumroll', '鼓聲']];
const SONG_SFX_AUDIO = {};
function songSfx(id){
  let a = SONG_SFX_AUDIO[id];
  if (!a) { a = SONG_SFX_AUDIO[id] = new Audio('/sfx/' + id + '.mp3'); a.preload = 'auto'; }
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  const p = a.play(); if (p && p.catch) p.catch(() => toast('音效無法播放，請再按一次'));
}
function songSfxStop(){ Object.values(SONG_SFX_AUDIO).forEach(a => { try { a.pause(); a.currentTime = 0; } catch (e) {} }); }
function songSfxPanel(me){
  return `<section class="song-sfx" aria-labelledby="song-sfx-h"><h3 id="song-sfx-h">音效 <small>${me ? '從這台（音響）播放' : '只從這台平板出聲'}</small></h3><div class="song-sfx-grid"><button type="button" class="song-sfx-btn is-stop" data-song-sfx-stop>停止音效</button>${SONG_SFX.map(([k, l]) => `<button type="button" class="song-sfx-btn" data-song-sfx="${k}">${esc(l)}</button>`).join('')}</div></section>`;
}
function songFindList(){
  const v = SONGS.view;
  if (v === 'search') {
    const form = `<form class="song-search" data-song-search><input type="search" name="q" value="${esc(SONGS.q)}" placeholder="輸入歌名、歌手，或貼 YouTube 網址" maxlength="80" autocomplete="off" enterkeyhint="search" aria-label="搜尋歌曲"></form>`;
    return form + `<div data-song-results aria-live="polite">${songSearchResults()}</div>`;
  }
  if (!SONGS.disc) return '<p class="hint">載入中…</p>';
  const list = SONGS.disc[v] || [];
  const empty = { popular: '還沒有客人點過歌，累積後會依點播次數排行。', recent: '還沒有客人點過歌。', chart: '排行榜暫時讀不到（需要綁定 YouTube 帳號或設定 API 金鑰）。' }[v];
  return list.length ? songListHtml(list, v !== 'recent') : `<p class="a-empty">${esc(empty)}</p>`;
}
/* 即時搜尋：打字停 0.5 秒自動搜（YouTube 搜尋一次 100 額度，不逐字送）；注音／倉頡組字中不送；只重畫結果區，不換掉輸入框 */
let SONG_PICK = { mode: 'artist', group: '' }; // 快速選歌手／歌曲（public/song-picks.js）
function songSearchResults(){
  if (SONGS.searching) return '<p class="hint">搜尋中…</p>';
  return SONGS.results == null ? SongPicks.html(SONG_PICK, 'zh', esc) : SongPicks.back('zh', esc) + (SONGS.results.length ? songListHtml(SONGS.results, false) : '<p class="a-empty">找不到可在店內播放的歌曲。</p>');
}
function paintSongResults(){ const r = document.querySelector('#songs-body [data-song-results]'); if (r) r.innerHTML = songSearchResults(); }
let SONG_SEARCH_T = 0, SONG_SEARCH_SEQ = 0;
async function songRunSearch(q){
  clearTimeout(SONG_SEARCH_T); q = String(q || '').trim();
  if (q === SONGS.lastQ && (SONGS.results != null || SONGS.searching)) return; // 同一個關鍵字已搜過或正在搜
  const seq = ++SONG_SEARCH_SEQ; SONGS.q = q; SONGS.lastQ = q;
  if (!q) { SONGS.results = null; SONGS.searching = false; return paintSongResults(); }
  SONGS.searching = true; paintSongResults();
  let items = null; try { items = (await api('/admin/orders/songs/search?q=' + encodeURIComponent(q))).items; } catch (err) { if (seq === SONG_SEARCH_SEQ) toast(err.message); }
  if (seq !== SONG_SEARCH_SEQ) return; // 已有更新的關鍵字，丟掉舊回應
  SONGS.searching = false; if (items) SONGS.results = items; else SONGS.lastQ = ''; paintSongResults();
}
function songSearchSoon(q){ clearTimeout(SONG_SEARCH_T); SONGS.q = String(q || '').trim(); SONG_SEARCH_T = setTimeout(() => songRunSearch(q), 500); }
document.addEventListener('input', e => { const i = e.target; if (!i.matches || !i.matches('#songs-body [data-song-search] input') || e.isComposing) return; songSearchSoon(i.value); });
document.addEventListener('compositionend', e => { const i = e.target; if (i.matches && i.matches('#songs-body [data-song-search] input')) songSearchSoon(i.value); });
function paintSongs(){
  const host = document.getElementById('songs-body'); if (!host || !SONGS.data) return;
  const d = SONGS.data, s = d.settings, me = isSongPlayer(), now = d.now;
  const status = !s.enabled ? '<span class="pill pill-draft">客人點歌：關閉</span>' : `<span class="pill pill-ok">客人點歌：開放中・每首 NT$${esc(s.price)}</span>`;
  const player = s.player_device ? (me ? '<span class="pill pill-ok">這台播放中</span>' : '<span class="pill pill-wait">另一台播放中</span>') : '<span class="pill pill-bad">未指定播放裝置</span>';
  const nowCard = now
    ? `<div class="song-now">${now.thumb ? `<img src="${esc(now.thumb)}" alt="">` : '<span class="song-ph lg" aria-hidden="true">♪</span>'}<div class="song-now-main">${songWho(now)}<b>${esc(now.title)}</b><small>${songMeta(now)}</small></div><button type="button" class="btn btn--solid" data-song-skip>下一首</button></div>`
    : `<div class="song-now is-empty"><span class="song-ph lg" aria-hidden="true">♪</span><div class="song-now-main"><b>目前沒有在播放</b><small>${s.playlist.length ? (s.player_device ? '播放裝置會自動開始播常態歌單。' : '先在接音響的平板按「在這台播放」。') : '到「設定 → 點歌」匯入常態歌單，沒人點歌時會自動播放。'}</small></div>${d.queue.length || s.playlist.length ? '<button type="button" class="btn btn--solid" data-song-skip>開始播放</button>' : ''}</div>`;
  const up = d.upcoming || { items: d.queue.map((t, i) => ({ ...t, kind: 'request', pos: i + 1 })), shuffle: false };
  const reqN = d.queue.length;
  const queue = (up.items.length
    ? `<ol class="song-list song-queue">${up.items.map(t => songRow(t, t.kind === 'request' ? songQueueActs(t, reqN) : '', { rank: t.pos })).join('')}</ol>`
    : '<p class="a-empty">沒有接下來的歌。到「設定 → 點歌」匯入常態歌單。</p>')
    + (up.shuffle ? `<p class="hint">常態歌單 ${esc(up.playlist_count)} 首隨機播放，以上是這一輪已洗好的順序。</p>` : '');
  const hist = d.history.length ? `<details class="song-hist"><summary>最近播過（${Math.min(8, d.history.length)}）</summary><ul class="song-list">${d.history.slice(0, 8).map(t => songRow(t, t.result === 'error' ? '<span class="pill pill-wait">無法播放已跳過</span>' : t.result === 'skip' ? '<span class="pill pill-draft">跳過</span>' : '')).join('')}</ul></details>` : '';
  // 重繪會換掉整個 DOM：先記下兩欄捲動位置，畫完還原（找歌換分頁才回到頂端），輪詢時才不會一直跳回最上面
  const keep = [...host.querySelectorAll('.song-scroll')].map(e => e.scrollTop), sameView = SONGS.painted === SONGS.view; SONGS.painted = SONGS.view;
  const qIn = host.querySelector('[data-song-search] input'); if (qIn && document.activeElement === qIn) SONGS.focus = true;
  host.innerHTML = `
  <div class="ops-head song-head"><h2>點歌</h2><div class="song-head-act">${status}${player}${me ? '<button type="button" class="btn btn--ghost btn-sm" data-song-release>停止在這台播放</button>' : '<button type="button" class="btn btn--solid btn-sm" data-song-claim>在這台播放</button>'}<button type="button" class="btn btn--ghost btn-sm" data-song-settings>點歌設定</button></div></div>
  ${songSfxPanel(me)}
  <div class="song-grid">
    <section class="song-col" aria-labelledby="song-q-h">${nowCard}<h3 id="song-q-h">接下來 <span class="song-count">${up.items.length}</span>${reqN ? `<small>客人／櫃檯點歌 ${reqN} 首優先</small>` : ''}</h3><div class="song-scroll">${queue}${hist}</div></section>
    <section class="song-col" aria-labelledby="song-f-h"><h3 id="song-f-h">找歌代點 <small>店員代點不收費</small></h3>
      <div class="song-tabs" role="tablist" aria-label="找歌方式">${SONG_VIEWS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${SONGS.view === k}" data-song-view="${k}">${l}</button>`).join('')}</div>
      <div class="song-scroll">${songFindList()}</div>
    </section>
  </div>`;
  const sc = host.querySelectorAll('.song-scroll'); if (sc[0]) sc[0].scrollTop = keep[0] || 0; if (sc[1] && sameView) sc[1].scrollTop = keep[1] || 0;
  songFit();
  if (SONGS.view === 'search' && SONGS.focus) { const i = host.querySelector('[data-song-search] input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } SONGS.focus = false; }
}
/* 平板橫放／桌機（寬 ≥1000、高 ≥600）：兩欄撐到視窗底、各自捲動，正在播放與找歌都不用捲整頁；直放與手機維持上下堆疊 */
const SONG_WIDE = matchMedia('(min-width:1000px) and (min-height:600px)');
function songFit(){
  const g = document.querySelector('#songs-body .song-grid'), m = document.querySelector('body>main'); if (!g || !m) return;
  if (!SONG_WIDE.matches) { g.style.height = ''; return; }
  const sec = document.getElementById('songs-body'), cs = getComputedStyle(sec), ms = getComputedStyle(m);
  const top = g.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop;
  const below = (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0) + (parseFloat(cs.marginBottom) || 0) + (parseFloat(ms.paddingBottom) || 0);
  g.style.height = Math.max(360, Math.floor(m.clientHeight - top - below)) + 'px';
}
addEventListener('resize', () => { if (TAB === 'songs') songFit(); });
async function songDo(fn, msg){
  try { const d = await fn(); if (d && d.settings) SONGS.data = d; if (msg) toast(typeof msg === 'function' ? msg(d) : msg); } catch (e) { toast(e.message); }
  if (TAB === 'songs') paintSongs(); if (TAB === 'settings') paintSongSettings(); songPlayerSync();
}
function songClaim(){ songUnlock(); return songDo(() => api('/admin/orders/songs/player', { method: 'POST', body: { device: DEVICE_ID } }), '這台平板開始播放'); }
function songRelease(){ songPlayerStop(); return songDo(() => api('/admin/orders/songs/player', { method: 'POST', body: { release: true } }), '已停止在這台播放'); }
document.addEventListener('click', async e => {
  if (!e.target.closest('#songs-body')) return;
  const b = e.target.closest('button'); if (!b) return; const D = SONGS.data; if (!D) return;
  const pk = SongPicks.click(b, SONG_PICK);
  if (pk) { const i = document.querySelector('#songs-body [data-song-search] input');
    if (pk.back) { if (i) i.value = ''; return songRunSearch(''); }
    if (pk.q) { if (i) i.value = pk.q; const sc = document.querySelectorAll('#songs-body .song-scroll')[1]; if (sc) sc.scrollTop = 0; return songRunSearch(pk.q); }
    return paintSongResults(); }
  if (b.dataset.songSfx) return songSfx(b.dataset.songSfx);
  if (b.matches('[data-song-sfx-stop]')) return songSfxStop();
  if (b.dataset.songMove) return songDo(() => api('/admin/orders/songs/queue/' + encodeURIComponent(b.dataset.songMove) + '/move', { method: 'POST', body: { to: Number(b.dataset.to) } }));
  if (b.dataset.songView) { SONGS.view = b.dataset.songView; SONGS.focus = SONGS.view === 'search'; return paintSongs(); }
  if (b.matches('[data-song-settings]')) { SONG_SET_FOCUS = true; return go('settings'); }
  if (b.matches('[data-song-claim]')) return songClaim();
  if (b.matches('[data-song-release]')) return songRelease();
  if (b.matches('[data-song-skip]')) return songDo(() => api('/admin/orders/songs/next', { method: 'POST', body: { result: 'skip', current: D.now && D.now.id } }));
  if (b.dataset.songTop) return songDo(() => api('/admin/orders/songs/queue/' + encodeURIComponent(b.dataset.songTop) + '/top', { method: 'POST' }));
  if (b.dataset.songDel) {
    const t = D.queue.find(x => x.id === b.dataset.songDel); if (!t) return;
    if (!await posConfirm(`移除「${t.title}」？${t.source === 'guest' && t.price ? `\n客人點的歌會一併從桌 ${t.table} 的帳上拿掉（NT$${t.price}）。` : ''}`, { ok: '移除', danger: true })) return;
    return songDo(() => api('/admin/orders/songs/queue/' + encodeURIComponent(t.id), { method: 'DELETE' }), d => d.refunded ? '已移除，並從桌上帳單拿掉' : '已移除');
  }
  if (b.dataset.songQueue) { const front = b.hasAttribute('data-song-front'); b.disabled = true; return songDo(() => api('/admin/orders/songs/queue', { method: 'POST', body: { video_id: b.dataset.songQueue, front } }), front ? '已插播，下一首播放' : '已排進待播'); }
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.closest('#songs-body')) return; e.preventDefault();
  if (f.matches('[data-song-search]')) {
    return songRunSearch(f.q.value); // Enter 立即搜，不等 0.5 秒
  }
});

/* ---- 設定頁：點歌區塊（pos-settings.js 的 paintSettings 會插入 songSettingsSection() 並呼叫 bindSongSettings()） ---- */
let SONG_SET_FOCUS = false;
function songSettingsSection(){ return '<div class="set-sec" id="set-songs" aria-labelledby="set-songs-h"><h3 id="set-songs-h">點歌</h3><div id="set-songs-body"><p class="hint">載入中…</p></div></div>'; }
async function bindSongSettings(){
  if (!SONGS.data) { try { SONGS.data = await api('/admin/orders/songs'); } catch (e) { const h = document.getElementById('set-songs-body'); if (h) h.innerHTML = `<p class="a-empty">載入失敗：${esc(e.message)}</p>`; return; } }
  paintSongSettings();
  if (SONG_SET_FOCUS) { SONG_SET_FOCUS = false; const sec = document.getElementById('set-songs'); if (sec) sec.scrollIntoView({ block: 'start' }); }
}
function paintSongSettings(){
  const host = document.getElementById('set-songs-body'); if (!host || !SONGS.data) return;
  const d = SONGS.data, s = d.settings, yt = d.youtube, me = isSongPlayer();
  const mine = SONGS.mine ? (SONGS.mine.length ? `<ul class="song-list">${SONGS.mine.map(p => `<li class="song-row"><div class="song-meta"><b>${esc(p.title)}</b><small>${esc(p.count)} 首</small></div><div class="song-act"><button type="button" class="btn btn--solid btn-sm" data-song-mine-import="${esc(p.id)}">取代</button><button type="button" class="btn btn--ghost btn-sm" data-song-mine-append="${esc(p.id)}">接在後面</button></div></li>`).join('')}</ul>` : '<p class="a-empty">這個帳號沒有播放清單。</p>') : '';
  const pl = s.playlist.length
    ? `<details class="song-hist"><summary>查看常態歌單（${s.playlist.length} 首）</summary><ol class="song-list song-pl">${s.playlist.map((t, i) => songRow(t, `<button type="button" class="btn btn--ghost btn-sm song-danger" data-song-pl-del="${i}" aria-label="從常態歌單移除 ${esc(t.title)}">移除</button>`, { rank: i + 1 })).join('')}</ol><div class="song-btns"><button type="button" class="btn btn--ghost btn-sm song-danger" data-song-pl-clear>清空常態歌單</button></div></details>`
    : '<p class="a-empty">還沒有常態歌單。貼 YouTube 播放清單網址匯入。</p>';
  host.innerHTML = `
    <label class="song-switch"><input type="checkbox" data-song-enabled ${s.enabled ? 'checked' : ''}><span><b>開放客人點歌</b><small>${s.enabled ? `已開放：客人掃桌邊 QR 可點歌，每首 NT$${esc(s.price)}，記在這桌帳上。` : '目前關閉：客人菜單不會出現「點歌」。'}</small></span></label>
    <form class="song-set" data-song-set><label>每首價格（NT$）<input type="number" name="price" min="0" max="1000" step="1" inputmode="numeric" value="${esc(s.price)}"></label><label>每桌同時最多排（首）<input type="number" name="max_per_table" min="1" max="20" step="1" inputmode="numeric" value="${esc(s.max_per_table)}"></label><label>單首長度上限（分鐘）<input type="number" name="max_minutes" min="1" max="60" step="1" inputmode="numeric" value="${esc(s.max_minutes)}"></label><button type="submit" class="btn btn--solid">儲存</button></form>
    <h4>播放裝置</h4><p class="hint">${s.player_device ? (me ? '這台平板是播放裝置（接音響）。' : '由另一台平板播放。') : '尚未指定。在接音響的那台平板按「在這台播放」。'}</p>
    <div class="song-btns">${me ? '<button type="button" class="btn btn--ghost btn-sm" data-song-release>停止在這台播放</button>' : '<button type="button" class="btn btn--solid btn-sm" data-song-claim>在這台播放</button>'}</div>
    <h4>常態歌單</h4><p class="hint">沒有人點歌時播放。</p>
    <label class="song-switch sm"><input type="checkbox" data-song-shuffle ${s.shuffle ? 'checked' : ''}><span><b>隨機播放</b><small>${s.shuffle ? '隨機挑歌。' : '依序播放，播完從頭。'}</small></span></label>
    <form class="song-search" data-song-import><input type="url" name="pl" placeholder="貼 YouTube 播放清單網址（含 list=）" autocomplete="off"><button type="submit" class="btn btn--solid">匯入（取代）</button></form>
    ${yt.connected ? '<div class="song-btns"><button type="button" class="btn btn--ghost btn-sm" data-song-mine>從我的 YouTube 播放清單匯入</button></div>' : ''}
    ${mine}${pl}
    <h4>YouTube 帳號</h4>${yt.connected
      ? `<p class="hint">已綁定${yt.channel ? `：<b>${esc(yt.channel.title)}</b>` : ''}${yt.connected_by ? `（${esc(yt.connected_by)} 綁定）` : ''}。搜尋、排行榜與匯入使用這個帳號。</p><div class="song-btns"><button type="button" class="btn btn--ghost btn-sm song-danger" data-song-yt-off>解除綁定</button></div>`
      : `<p class="hint">${yt.api_key ? '目前用系統金鑰搜尋。' : '尚未綁定，客人與店員都無法搜尋。'}綁定後也可匯入帳號裡的播放清單。</p><div class="song-btns"><button type="button" class="btn btn--solid btn-sm" data-song-yt-on ${yt.oauth_ready ? '' : 'disabled'}>綁定 YouTube 帳號</button></div>`}`;
}
function songSavePlaylist(list){ return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { playlist: list } }), '常態歌單已更新'); }
document.addEventListener('click', async e => {
  if (!e.target.closest('#set-songs-body')) return;
  const b = e.target.closest('button'); if (!b) return; const D = SONGS.data; if (!D) return;
  if (b.matches('[data-song-claim]')) return songClaim();
  if (b.matches('[data-song-release]')) return songRelease();
  if (b.dataset.songPlDel != null && b.dataset.songPlDel !== '') { const i = Number(b.dataset.songPlDel); return songSavePlaylist(D.settings.playlist.filter((_, j) => j !== i)); }
  if (b.matches('[data-song-pl-clear]')) { if (!await posConfirm('清空常態歌單？沒有人點歌時會變成安靜無聲。', { ok: '清空', danger: true })) return; return songSavePlaylist([]); }
  if (b.matches('[data-song-mine]')) { try { SONGS.mine = (await api('/admin/orders/songs/youtube/playlists')).playlists; } catch (err) { toast(err.message); } return paintSongSettings(); }
  if (b.dataset.songMineImport || b.dataset.songMineAppend) { const id = b.dataset.songMineImport || b.dataset.songMineAppend; b.disabled = true; return songDo(() => api('/admin/orders/songs/playlist/import', { method: 'POST', body: { playlist: id, mode: b.dataset.songMineAppend ? 'append' : 'replace' } }), d => `已匯入 ${d.imported} 首`); }
  if (b.matches('[data-song-yt-on]')) { try { const r = await api('/admin/orders/songs/youtube/connect', { method: 'POST', body: { redirect: location.origin + '/pos/settings' } }); location.href = r.url; } catch (err) { toast(err.message); } return; }
  if (b.matches('[data-song-yt-off]')) { if (!await posConfirm('解除綁定 YouTube 帳號？', { ok: '解除', danger: true })) return; try { await api('/admin/orders/songs/youtube', { method: 'DELETE' }); SONGS.data = await api('/admin/orders/songs'); } catch (err) { toast(err.message); } return paintSongSettings(); }
});
document.addEventListener('change', e => {
  if (!e.target.closest('#set-songs-body')) return;
  if (e.target.matches('[data-song-enabled]')) return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { enabled: e.target.checked } }), e.target.checked ? '已開放客人點歌' : '已關閉點歌');
  if (e.target.matches('[data-song-shuffle]')) return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { shuffle: e.target.checked } }));
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.closest('#set-songs-body')) return; e.preventDefault();
  if (f.matches('[data-song-import]')) { const v = f.pl.value.trim(); if (!v) return; return songDo(() => api('/admin/orders/songs/playlist/import', { method: 'POST', body: { playlist: v, mode: 'replace' } }), d => `已匯入 ${d.imported} 首`); }
  if (f.matches('[data-song-set]')) return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { price: Number(f.price.value), max_per_table: Number(f.max_per_table.value), max_minutes: Number(f.max_minutes.value) } }), '設定已儲存');
});

/* ---- 播放器（只在播放裝置上運作）：YouTube IFrame API，常駐右下角 ---- */
let SONG_YT = null, SONG_YT_READY = false, SONG_LOADED = '', SONG_TIMER = null, SONG_BUSY = false;
function songUnlock(){ songEnsureApi(); }
function songEnsureApi(){
  if (window.YT && window.YT.Player) { SONG_YT_READY = true; return; }
  if (document.getElementById('yt-iframe-api')) return;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { SONG_YT_READY = true; if (typeof prev === 'function') prev(); songPlayerSync(); };
  const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
}
/* 播放器小視窗：按住頂部把手拖移（滑鼠與觸控都可），「－」縮到最小（只留一列：歌名＋下一首＋展開），位置與狀態記在這台平板 */
const SONG_DOCK_KEY = 'tth_song_dock';
function songDockPref(){ try { return JSON.parse(localStorage.getItem(SONG_DOCK_KEY) || '{}') || {}; } catch (e) { return {}; } }
function songDockSave(p){ try { localStorage.setItem(SONG_DOCK_KEY, JSON.stringify({ ...songDockPref(), ...p })); } catch (e) {} }
function songDockPlace(dock, x, y){
  const r = dock.getBoundingClientRect(), mx = Math.max(0, innerWidth - r.width), my = Math.max(0, innerHeight - r.height);
  x = Math.min(mx, Math.max(0, x)); y = Math.min(my, Math.max(0, y));
  dock.style.left = x + 'px'; dock.style.top = y + 'px'; dock.style.right = 'auto'; dock.style.bottom = 'auto';
  return { x, y };
}
// 點歌分頁（平板橫放）會用 CSS 自動縮成一條；.is-expand＝在該頁手動展開
const songDockAuto = () => typeof TAB !== 'undefined' && TAB === 'songs' && matchMedia('(min-width:1000px) and (min-height:600px)').matches;
const songDockShrunk = dock => dock.classList.contains('is-min') || (songDockAuto() && !dock.classList.contains('is-expand'));
function songDockLabel(dock){
  const min = songDockShrunk(dock), b = dock.querySelector('[data-song-dock-min]');
  if (b) { b.textContent = min ? '＋' : '－'; b.setAttribute('aria-label', min ? '展開播放器' : '縮到最小'); b.setAttribute('aria-expanded', String(!min)); }
}
// 尺寸變了（展開／縮小／切分頁）就把位置夾回畫面內，否則靠底部縮小後再展開會跑出螢幕外
function songDockFit(dock){
  requestAnimationFrame(() => { const p = songDockPref(); if (p.x != null) songDockPlace(dock, p.x, p.y); });
}
function songDockMin(dock, min){
  // 點歌頁按「－」只是收回暫時展開，不寫入縮小偏好（否則切到其他分頁也一直是縮小的）
  if (min && songDockAuto() && dock.classList.contains('is-expand')) { dock.classList.remove('is-expand'); songDockLabel(dock); songDockFit(dock); return; }
  dock.classList.toggle('is-min', !!min);
  if (!min && songDockAuto()) dock.classList.add('is-expand'); else dock.classList.remove('is-expand');
  songDockSave({ min: !!min });
  songDockLabel(dock); songDockFit(dock);
}
// pos.html activate() 切分頁時呼叫：收回點歌頁的暫時展開、更新按鈕、重新夾位置
function songDockTab(){ const d = document.getElementById('song-dock'); if (!d) return; d.classList.remove('is-expand'); songDockLabel(d); songDockFit(d); }
function songDock(){
  let dock = document.getElementById('song-dock');
  if (dock) return dock;
  dock = document.createElement('div'); dock.id = 'song-dock'; dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', '點歌播放器');
  dock.innerHTML = '<div class="song-dock-grip" data-song-dock-grip><span class="song-dock-handle" aria-hidden="true"></span><span class="song-dock-label">點歌播放器・按住拖移</span><button type="button" data-song-dock-min aria-label="縮到最小" aria-expanded="true">－</button></div><div class="song-dock-video"><div id="song-yt"></div></div><div class="song-dock-bar"><span id="song-dock-title">點歌播放器</span><button type="button" data-song-dock-next aria-label="下一首">下一首</button></div>';
  document.body.appendChild(dock);
  dock.querySelector('[data-song-dock-next]').onclick = () => songNext('skip');
  dock.querySelector('[data-song-dock-min]').onclick = e => { e.stopPropagation(); songDockMin(dock, !songDockShrunk(dock)); };
  // 拖移：pointer events（iPad 觸控、滑鼠都可）；按在按鈕上不拖
  // 展開時拖頂部把手；縮小時整條都能拖（影片區與按鈕不拖）
  let drag = null;
  dock.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.target.closest('.song-dock-video')) return;
    if (!e.target.closest('[data-song-dock-grip]') && !songDockShrunk(dock)) return;
    const r = dock.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    try { dock.setPointerCapture(e.pointerId); } catch (x) {} dock.classList.add('is-drag'); e.preventDefault();
  });
  dock.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; songDockPlace(dock, e.clientX - drag.dx, e.clientY - drag.dy); });
  const end = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; dock.classList.remove('is-drag'); const r = dock.getBoundingClientRect(); songDockSave({ x: Math.round(r.left), y: Math.round(r.top) }); };
  dock.addEventListener('pointerup', end); dock.addEventListener('pointercancel', end);
  addEventListener('resize', () => { songDockLabel(dock); const p = songDockPref(); if (p.x != null) songDockPlace(dock, p.x, p.y); });
  const p = songDockPref(); dock.classList.toggle('is-min', !!p.min); songDockLabel(dock);
  if (p.x != null) requestAnimationFrame(() => songDockPlace(dock, p.x, p.y));
  return dock;
}
function songPlayerStop(){ clearTimeout(SONG_TIMER); SONG_TIMER = null; try { SONG_YT && SONG_YT.destroy(); } catch (e) {} SONG_YT = null; SONG_LOADED = ''; const d = document.getElementById('song-dock'); if (d) d.remove(); }
async function songNext(result){
  if (SONG_BUSY) return; SONG_BUSY = true;
  try { SONGS.data = await api('/admin/orders/songs/next', { method: 'POST', body: { result, current: SONGS.data && SONGS.data.now ? SONGS.data.now.id : null, device: DEVICE_ID } }); if (SONGS.data.refunded) toast('客人點的歌無法播放，已跳過並從帳上拿掉'); } catch (e) { toast(e.message); }
  SONG_BUSY = false; if (TAB === 'songs') paintSongs(); songPlayerSync();
}
function songPlayerSync(){
  if (!isSongPlayer()) { if (SONG_YT || document.getElementById('song-dock')) songPlayerStop(); return; }
  clearTimeout(SONG_TIMER); SONG_TIMER = setTimeout(songPoll, SONG_POLL_MS);
  songEnsureApi(); if (!SONG_YT_READY) return;
  const d = SONGS.data, now = d.now; songDock();
  document.getElementById('song-dock-title').textContent = now ? (now.kind === 'request' ? `♪ ${now.title}${now.table ? '（桌 ' + now.table + '）' : ''}` : now.title) : '沒有可播放的歌';
  // 沒在播但有歌可播 → 換下一首；正在播常態歌單、有人點歌 → 立刻切過去
  if (!now && (d.queue.length || d.settings.playlist.length)) return songNext('ended');
  if (now && now.kind === 'playlist' && d.queue.length) return songNext('preempt');
  if (!now) { try { SONG_YT && SONG_YT.stopVideo(); } catch (e) {} SONG_LOADED = ''; return; }
  if (SONG_LOADED === now.id) return;
  SONG_LOADED = now.id;
  if (!SONG_YT) {
    SONG_YT = new YT.Player('song-yt', { width: '320', height: '180', videoId: now.video_id, playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: { onReady: ev => { try { ev.target.playVideo(); } catch (e) {} }, onStateChange: ev => { if (ev.data === YT.PlayerState.ENDED) songNext('ended'); }, onError: () => songNext('error') } });
  } else { try { SONG_YT.loadVideoById(now.video_id); } catch (e) { songNext('error'); } }
}
async function songPoll(){
  SONG_TIMER = null;
  if (!SONGS.data || !isSongPlayer()) return;
  try { const before = JSON.stringify(SONGS.data); SONGS.data = await api('/admin/orders/songs'); if (TAB === 'songs' && JSON.stringify(SONGS.data) !== before && !document.querySelector('#songs-body input:focus')) paintSongs(); } catch (e) {}
  songPlayerSync();
}
// 開機：這台若被指定為播放裝置就自動接手播放（iPad 需使用者點一下畫面才會出聲，播放器上會顯示 YouTube 的播放鍵）
async function songBoot(){ try { SONGS.data = await api('/admin/orders/songs'); songPlayerSync(); } catch (e) {} }
(function(){ const p = new URLSearchParams(location.search).get('youtube'); if (p) { if (p === 'connected') SONG_SET_FOCUS = true; setTimeout(() => toast({ connected: 'YouTube 帳號已綁定', cancelled: '已取消綁定 YouTube', failed: 'YouTube 綁定失敗，請再試一次' }[p] || ''), 600); history.replaceState(null, '', location.pathname); } })();
