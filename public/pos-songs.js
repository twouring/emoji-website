/* POS 點歌分頁（/pos/songs）＋播放器。依賴 pos.html 的 esc/api/toast/TAB/DEVICE_ID 與 pos-ops.js 的 posConfirm。
 * - 點歌開關（預設關閉）、每首單價、每桌待播上限、單首長度上限
 * - 常態歌單：沒人點歌時依序（或隨機）播放；可貼 YouTube 播放清單網址匯入、從綁定帳號的清單匯入、或搜尋加單首
 * - 綁定 YouTube 帳號（搜尋與匯入走帳號授權；未綁定時用伺服器 YOUTUBE_API_KEY）
 * - 播放裝置：接音響的那台平板按「在這台播放」，播放器常駐在畫面右下角（切換其他分頁也繼續播），播完自動換下一首；
 *   客人點歌時若正在播常態歌單，會立刻切到點的歌。 */
let SONGS = { data: null, results: null, q: '', searching: false, plResults: null, mine: null };
const SONG_POLL_MS = 5000;
const songDur = s => s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '';
function tabSongs(){ return '<div class="a-sec" id="songs-body"></div>'; }
function resetSongs(){ SONGS = { data: null, results: null, q: '', searching: false, plResults: null, mine: null }; }
function isSongPlayer(){ return !!(SONGS.data && SONGS.data.settings.player_device && SONGS.data.settings.player_device === DEVICE_ID); }

async function loadSongs(){
  const host = document.getElementById('songs-body'); if (!host) return;
  if (!SONGS.data) host.innerHTML = '<div class="ops-head"><h2>點歌</h2></div><p class="hint">載入中…</p>';
  try { SONGS.data = await api('/admin/orders/songs'); } catch (e) { host.innerHTML = `<div class="ops-head"><h2>點歌</h2></div><p class="a-empty">載入失敗：${esc(e.message)}</p>`; return; }
  paintSongs(); songPlayerSync();
}
function songRow(t, actions){
  return `<li class="song-row">${t.thumb ? `<img src="${esc(t.thumb)}" alt="" loading="lazy">` : '<span class="song-ph" aria-hidden="true"></span>'}<div class="song-meta"><b>${esc(t.title)}</b><small>${esc([t.channel, songDur(t.duration)].filter(Boolean).join('・'))}${t.table ? `・桌 ${esc(t.table)}` : ''}${t.by && t.source !== 'pos' ? `・${esc(t.by)}` : ''}${t.source === 'guest' && t.price ? `・NT$${esc(t.price)}` : ''}${t.source === 'pos' ? '・櫃檯代點' : ''}</small></div><div class="song-act">${actions || ''}</div></li>`;
}
function paintSongs(){
  const host = document.getElementById('songs-body'); if (!host || !SONGS.data) return;
  const d = SONGS.data, s = d.settings, yt = d.youtube, me = isSongPlayer();
  const now = d.now ? songRow(d.now, '') : '<p class="a-empty">目前沒有在播放。</p>';
  const nowTag = d.now ? (d.now.kind === 'playlist' ? '<span class="pill pill-draft">常態歌單</span>' : '<span class="pill pill-ok">客人點歌</span>') : '';
  const playerLine = s.player_device ? (me ? '<span class="pill pill-ok">這台是播放裝置</span>' : '<span class="pill pill-wait">由另一台平板播放</span>') : '<span class="pill pill-draft">尚未指定播放裝置</span>';
  const results = SONGS.results == null ? '' : SONGS.results.length ? `<ul class="song-list">${SONGS.results.map(t => songRow(t, `<button type="button" class="btn btn--solid btn-sm" data-song-queue="${esc(t.video_id)}">排進待播</button><button type="button" class="btn btn--ghost btn-sm" data-song-pl-add="${esc(t.video_id)}">加入常態歌單</button>`)).join('')}</ul>` : '<p class="a-empty">找不到可在店內播放的歌曲。</p>';
  host.innerHTML = `
  <div class="ops-head"><h2>點歌</h2><div class="song-head-act">${playerLine}${me ? '<button type="button" class="btn btn--ghost btn-sm" data-song-release>停止在這台播放</button>' : '<button type="button" class="btn btn--solid btn-sm" data-song-claim>在這台播放</button>'}</div></div>
  <label class="song-switch"><input type="checkbox" data-song-enabled ${s.enabled ? 'checked' : ''}><span><b>開放客人點歌</b><small>${s.enabled ? `已開放：客人掃桌邊 QR 可搜尋 YouTube 點歌，每首 NT$${esc(s.price)}，記在這桌帳上。` : '目前關閉：客人菜單不會出現「點歌」。'}</small></span></label>
  <div class="song-grid">
    <section><h3>正在播放 ${nowTag}</h3><ul class="song-list">${d.now ? now : ''}</ul>${d.now ? '' : now}<div class="song-btns"><button type="button" class="btn btn--solid btn-sm" data-song-skip ${d.now || d.queue.length || s.playlist.length ? '' : 'disabled'}>下一首</button></div>
      <h3>待播清單（${d.queue.length}）</h3>${d.queue.length ? `<ul class="song-list">${d.queue.map((t, i) => songRow(t, `${i ? `<button type="button" class="btn btn--ghost btn-sm" data-song-top="${esc(t.id)}">移到最前</button>` : ''}<button type="button" class="btn btn--ghost btn-sm song-danger" data-song-del="${esc(t.id)}">移除</button>`)).join('')}</ul>` : '<p class="a-empty">沒有人點歌，會播常態歌單。</p>'}
      <h3>搜尋 YouTube</h3><form class="song-search" data-song-search><input type="search" name="q" value="${esc(SONGS.q)}" placeholder="歌名、歌手，或貼 YouTube 網址" maxlength="80" autocomplete="off" enterkeyhint="search"><button type="submit" class="btn btn--solid btn-sm" ${SONGS.searching ? 'disabled' : ''}>${SONGS.searching ? '搜尋中…' : '搜尋'}</button></form>${results}
    </section>
    <section><h3>常態歌單（${s.playlist.length} 首）</h3><p class="hint">沒有人點歌時播放。${s.shuffle ? '隨機播放。' : '依序播放，播完從頭。'}</p>
      <label class="song-switch sm"><input type="checkbox" data-song-shuffle ${s.shuffle ? 'checked' : ''}><span><b>隨機播放</b></span></label>
      <form class="song-search" data-song-import><input type="url" name="pl" placeholder="貼 YouTube 播放清單網址（含 list=）" autocomplete="off"><button type="submit" class="btn btn--solid btn-sm">匯入</button></form>
      ${yt.connected ? '<button type="button" class="btn btn--ghost btn-sm" data-song-mine>從我的 YouTube 播放清單匯入</button>' : ''}
      ${SONGS.mine ? (SONGS.mine.length ? `<ul class="song-list">${SONGS.mine.map(p => `<li class="song-row"><div class="song-meta"><b>${esc(p.title)}</b><small>${esc(p.count)} 首</small></div><div class="song-act"><button type="button" class="btn btn--solid btn-sm" data-song-mine-import="${esc(p.id)}">取代</button><button type="button" class="btn btn--ghost btn-sm" data-song-mine-append="${esc(p.id)}">接在後面</button></div></li>`).join('')}</ul>` : '<p class="a-empty">這個帳號沒有播放清單。</p>') : ''}
      ${s.playlist.length ? `<ul class="song-list song-pl">${s.playlist.map((t, i) => songRow(t, `<button type="button" class="btn btn--ghost btn-sm song-danger" data-song-pl-del="${i}" aria-label="從常態歌單移除 ${esc(t.title)}">移除</button>`)).join('')}</ul><div class="song-btns"><button type="button" class="btn btn--ghost btn-sm song-danger" data-song-pl-clear>清空常態歌單</button></div>` : '<p class="a-empty">還沒有常態歌單。貼播放清單網址匯入，或在左邊搜尋後按「加入常態歌單」。</p>'}
      <h3>點歌設定</h3>
      <form class="song-set" data-song-set><label>每首價格（NT$）<input type="number" name="price" min="0" max="1000" step="1" inputmode="numeric" value="${esc(s.price)}"></label><label>每桌同時最多排（首）<input type="number" name="max_per_table" min="1" max="20" step="1" inputmode="numeric" value="${esc(s.max_per_table)}"></label><label>單首長度上限（分鐘）<input type="number" name="max_minutes" min="1" max="60" step="1" inputmode="numeric" value="${esc(s.max_minutes)}"></label><button type="submit" class="btn btn--solid btn-sm">儲存設定</button></form>
      <h3>YouTube 帳號</h3>${yt.connected ? `<p class="hint">已綁定${yt.channel ? `：<b>${esc(yt.channel.title)}</b>` : ''}${yt.connected_by ? `（${esc(yt.connected_by)} 綁定）` : ''}。搜尋與匯入使用這個帳號。</p><button type="button" class="btn btn--ghost btn-sm song-danger" data-song-yt-off>解除綁定</button>` : `<p class="hint">${yt.api_key ? '目前用系統金鑰搜尋。' : '尚未綁定，客人與店員都無法搜尋。'}綁定後可匯入帳號裡的播放清單。</p><button type="button" class="btn btn--solid btn-sm" data-song-yt-on ${yt.oauth_ready ? '' : 'disabled'}>綁定 YouTube 帳號</button>`}
      ${d.history.length ? `<h3>最近播過</h3><ul class="song-list">${d.history.slice(0, 8).map(t => songRow(t, t.result === 'error' ? '<span class="pill pill-wait">無法播放已跳過</span>' : t.result === 'skip' ? '<span class="pill pill-draft">跳過</span>' : '')).join('')}</ul>` : ''}
    </section>
  </div>`;
}
async function songDo(fn, msg){ try { const d = await fn(); if (d && d.settings) SONGS.data = d; if (msg) toast(typeof msg === 'function' ? msg(d) : msg); } catch (e) { toast(e.message); } paintSongs(); songPlayerSync(); }
function songSavePlaylist(list){ return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { playlist: list } }), '常態歌單已更新'); }
document.addEventListener('click', async e => {
  if (!e.target.closest('#songs-body')) return;
  const b = e.target.closest('button'); if (!b) return; const D = SONGS.data; if (!D) return;
  if (b.matches('[data-song-claim]')) { songUnlock(); return songDo(() => api('/admin/orders/songs/player', { method: 'POST', body: { device: DEVICE_ID } }), '這台平板開始播放'); }
  if (b.matches('[data-song-release]')) { songPlayerStop(); return songDo(() => api('/admin/orders/songs/player', { method: 'POST', body: { release: true } }), '已停止在這台播放'); }
  if (b.matches('[data-song-skip]')) return songDo(() => api('/admin/orders/songs/next', { method: 'POST', body: { result: 'skip', current: D.now && D.now.id } }));
  if (b.dataset.songTop) return songDo(() => api('/admin/orders/songs/queue/' + encodeURIComponent(b.dataset.songTop) + '/top', { method: 'POST' }));
  if (b.dataset.songDel) { const t = D.queue.find(x => x.id === b.dataset.songDel); if (!t) return; if (!await posConfirm(`移除「${t.title}」？${t.source === 'guest' && t.price ? `\n客人點的歌會一併從桌 ${t.table} 的帳上拿掉（NT$${t.price}）。` : ''}`, { ok: '移除', danger: true })) return; return songDo(() => api('/admin/orders/songs/queue/' + encodeURIComponent(t.id), { method: 'DELETE' }), d => d.refunded ? '已移除，並從桌上帳單拿掉' : '已移除'); }
  if (b.dataset.songQueue) return songDo(() => api('/admin/orders/songs/queue', { method: 'POST', body: { video_id: b.dataset.songQueue } }), '已排進待播');
  if (b.dataset.songPlAdd) { const t = (SONGS.results || []).find(x => x.video_id === b.dataset.songPlAdd); if (!t) return; if (D.settings.playlist.some(x => x.video_id === t.video_id)) return toast('已經在常態歌單裡'); return songSavePlaylist(D.settings.playlist.concat([t])); }
  if (b.dataset.songPlDel != null && b.dataset.songPlDel !== '') { const i = Number(b.dataset.songPlDel); return songSavePlaylist(D.settings.playlist.filter((_, j) => j !== i)); }
  if (b.matches('[data-song-pl-clear]')) { if (!await posConfirm('清空常態歌單？沒有人點歌時會變成安靜無聲。', { ok: '清空', danger: true })) return; return songSavePlaylist([]); }
  if (b.matches('[data-song-mine]')) { try { SONGS.mine = (await api('/admin/orders/songs/youtube/playlists')).playlists; } catch (err) { toast(err.message); } return paintSongs(); }
  if (b.dataset.songMineImport || b.dataset.songMineAppend) { const id = b.dataset.songMineImport || b.dataset.songMineAppend; b.disabled = true; return songDo(() => api('/admin/orders/songs/playlist/import', { method: 'POST', body: { playlist: id, mode: b.dataset.songMineAppend ? 'append' : 'replace' } }), d => `已匯入 ${d.imported} 首`); }
  if (b.matches('[data-song-yt-on]')) { try { const r = await api('/admin/orders/songs/youtube/connect', { method: 'POST', body: { redirect: location.origin + '/pos/songs' } }); location.href = r.url; } catch (err) { toast(err.message); } return; }
  if (b.matches('[data-song-yt-off]')) { if (!await posConfirm('解除綁定 YouTube 帳號？', { ok: '解除', danger: true })) return; try { await api('/admin/orders/songs/youtube', { method: 'DELETE' }); } catch (err) { toast(err.message); } return loadSongs(); }
});
document.addEventListener('change', e => {
  if (!e.target.closest('#songs-body')) return;
  if (e.target.matches('[data-song-enabled]')) return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { enabled: e.target.checked } }), e.target.checked ? '已開放客人點歌' : '已關閉點歌');
  if (e.target.matches('[data-song-shuffle]')) return songDo(() => api('/admin/orders/songs/settings', { method: 'POST', body: { shuffle: e.target.checked } }));
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.closest('#songs-body')) return; e.preventDefault();
  if (f.matches('[data-song-search]')) { SONGS.q = f.q.value.trim(); if (!SONGS.q) return; SONGS.searching = true; paintSongs(); try { SONGS.results = (await api('/admin/orders/songs/search?q=' + encodeURIComponent(SONGS.q))).items; } catch (err) { toast(err.message); } SONGS.searching = false; return paintSongs(); }
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
function songDock(){
  let dock = document.getElementById('song-dock');
  if (!dock) { dock = document.createElement('div'); dock.id = 'song-dock'; dock.innerHTML = '<div id="song-yt"></div><div class="song-dock-bar"><span id="song-dock-title">點歌播放器</span><button type="button" data-song-dock-next aria-label="下一首">下一首</button></div>'; document.body.appendChild(dock); dock.querySelector('[data-song-dock-next]').onclick = () => songNext('skip'); }
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
  try { SONGS.data = await api('/admin/orders/songs'); if (TAB === 'songs' && !document.querySelector('#songs-body input:focus')) paintSongs(); } catch (e) {}
  songPlayerSync();
}
// 開機：這台若被指定為播放裝置就自動接手播放（iPad 需使用者點一下畫面才會出聲，播放器上會顯示 YouTube 的播放鍵）
async function songBoot(){ try { SONGS.data = await api('/admin/orders/songs'); songPlayerSync(); } catch (e) {} }
(function(){ const p = new URLSearchParams(location.search).get('youtube'); if (p) { setTimeout(() => toast({ connected: 'YouTube 帳號已綁定', cancelled: '已取消綁定 YouTube', failed: 'YouTube 綁定失敗，請再試一次' }[p] || ''), 600); history.replaceState(null, '', location.pathname); } })();
