// 點歌：純邏輯（lib/songs.js）＋接線靜態檢查（POS 分頁、客人菜單、出餐單排除、操作紀錄、品牌子帳號權限）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const songs = require('../lib/songs.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const T = (id, extra = {}) => ({ video_id: id, title: 'Song ' + id, channel: 'Ch', duration: 200, ...extra });
const ID = n => ('vid' + n).padEnd(11, 'x');

test('預設關閉、每首 10 元；設定範圍外 400', () => {
  const s = songs.normalizeSettings('');
  assert.equal(s.enabled, false); assert.equal(s.price, 10); assert.deepEqual(s.playlist, []);
  assert.equal(songs.patchSettings(s, { enabled: true }).enabled, true);
  assert.equal(songs.patchSettings(s, { price: 20 }).price, 20);
  assert.throws(() => songs.patchSettings(s, { price: -1 }), /單價/);
  assert.throws(() => songs.patchSettings(s, { max_per_table: 0 }), /每桌/);
  // 常態歌單去重、丟掉不合法 id
  const pl = songs.patchSettings(s, { playlist: [T(ID(1)), T(ID(1)), { video_id: 'bad' }, T(ID(2))] }).playlist;
  assert.deepEqual(pl.map(t => t.video_id), [ID(1), ID(2)]);
});

test('排進待播：同首不重複、每桌上限、櫃檯代點不受上限', () => {
  let st = songs.normalizeState('');
  st = songs.enqueue(st, T(ID(1)), { table: 'A1', price: 10, maxPerTable: 2 }).state;
  assert.throws(() => songs.enqueue(st, T(ID(1)), { table: 'A2' }), /已經在待播/);
  st = songs.enqueue(st, T(ID(2)), { table: 'A1', maxPerTable: 2 }).state;
  assert.throws(() => songs.enqueue(st, T(ID(3)), { table: 'A1', maxPerTable: 2 }), /最多同時排 2 首/);
  st = songs.enqueue(st, T(ID(3)), { table: 'A2', maxPerTable: 2 }).state;
  st = songs.enqueue(st, T(ID(4)), { source: 'pos' }).state;
  assert.equal(st.queue.length, 4);
  assert.equal(st.queue[0].price, 10);
});

test('沒人點歌播常態歌單（依序循環）；有人點歌優先；preempt 只切常態歌單', () => {
  const settings = songs.normalizeSettings({ playlist: [T(ID(7)), T(ID(8))] });
  let st = songs.normalizeState('');
  let r = songs.advance(st, settings); st = r.state;
  assert.equal(r.song.kind, 'playlist'); assert.equal(r.song.video_id, ID(7));
  r = songs.advance(st, settings, { current: st.now.id }); st = r.state;
  assert.equal(r.song.video_id, ID(8));
  r = songs.advance(st, settings, { current: st.now.id }); st = r.state;
  assert.equal(r.song.video_id, ID(7), '播完從頭');
  // 有人點歌：preempt 切掉常態歌單
  st = songs.enqueue(st, T(ID(1)), { table: 'A1', session_id: 'ts_1', line: 'L1', price: 10 }).state;
  r = songs.advance(st, settings, { result: 'preempt', current: st.now.id }); st = r.state;
  assert.equal(r.song.kind, 'request'); assert.equal(r.song.video_id, ID(1));
  assert.equal(st.history[0].result, 'preempt');
  // 客人的歌正在播：preempt 不可切
  st = songs.enqueue(st, T(ID(2)), { table: 'A2' }).state;
  r = songs.advance(st, settings, { result: 'preempt', current: st.now.id });
  assert.equal(r.stale, true);
  // 別台已換過歌：current 對不上不動作
  r = songs.advance(st, settings, { result: 'ended', current: 'pl_old' });
  assert.equal(r.stale, true);
});

test('影片無法播放：客人點的歌回 refund（server 從帳上拿掉）；常態歌單不退', () => {
  const settings = songs.normalizeSettings({ playlist: [T(ID(7))] });
  let st = songs.enqueue(songs.normalizeState(''), T(ID(1)), { table: 'A1', session_id: 'ts_1', line: 'L1', price: 10 }).state;
  st = songs.advance(st, settings).state;
  const r = songs.advance(st, settings, { result: 'error', current: st.now.id });
  assert.equal(r.refund.line, 'L1'); assert.equal(r.song.kind, 'playlist');
  const r2 = songs.advance(r.state, settings, { result: 'error', current: r.state.now.id });
  assert.equal(r2.refund, null);
  // 沒歌可播
  const empty = songs.advance(songs.normalizeState(''), songs.normalizeSettings(''));
  assert.equal(empty.song, null);
});

test('點歌品項：已送出＋已出餐（不進出餐看板）、不上出餐單、三語品名、價格取設定', () => {
  const e = songs.enqueue(songs.normalizeState(''), T(ID(1), { title: '晴天' }), { table: 'A1', by: '小明', price: 10 }).entry;
  const l = songs.songLine(e, { venue: 'BAR', guest: 'abcdefgh1' });
  assert.equal(l.price, 10); assert.equal(l.qty, 1); assert.equal(l.cat, 'SONG'); assert.equal(l.venue, 'BAR');
  assert.ok(l.placed_at && l.served_at); assert.equal(l.order_id, null);
  assert.equal(l.zh, '點歌｜晴天'); assert.match(l.en, /^Song \| /);
  const orders = require('../lib/table-orders.js');
  const st = orders.splitByStation({ items: [l] });
  assert.equal(st.bar.length + st.kitchen.length, 0, '點歌不上出餐單');
  assert.equal(orders.ticketsOf({ id: 's', table_no: 'A1', items: [l] }).length, 0, '不留在出餐看板');
  const kp = require('../lib/pos-kitchen-print.js');
  assert.equal(kp.jobsOf([{ id: 's', session_id: null, status: 'placed', table_no: 'A1', items: [{ ...l, ticket: 'tk_1' }] }]).length, 0);
  // 結帳金額照常計入
  assert.equal(orders.sum(orders.unpaid([l])), 10);
});

test('客人看到的待播只露歌名與是否本桌，不露 session／line', () => {
  let st = songs.enqueue(songs.normalizeState(''), T(ID(1)), { table: 'A1', session_id: 'ts_secret', line: 'L1', price: 10 }).state;
  st = songs.enqueue(st, T(ID(2)), { table: 'B1' }).state;
  const v = songs.publicView(st, songs.normalizeSettings({ enabled: true }), 'A1');
  assert.equal(v.enabled, true); assert.equal(v.queue[0].mine, true); assert.equal(v.queue[1].mine, false);
  assert.ok(!JSON.stringify(v).includes('ts_secret'));
});

test('移除與移到最前', () => {
  let st = songs.normalizeState('');
  st = songs.enqueue(st, T(ID(1)), { table: 'A1' }).state; st = songs.enqueue(st, T(ID(2)), { table: 'A2' }).state;
  const id2 = st.queue[1].id;
  st = songs.moveToFront(st, id2); assert.equal(st.queue[0].video_id, ID(2));
  const r = songs.removeFromQueue(st, id2); assert.equal(r.state.queue.length, 1); assert.equal(r.entry.video_id, ID(2));
  assert.throws(() => songs.removeFromQueue(r.state, id2), /不在待播/);
});

test('YouTube 網址解析與長度', () => {
  assert.equal(songs.parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1'), 'dQw4w9WgXcQ');
  assert.equal(songs.parseVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(songs.parseVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(songs.parseVideoId('周杰倫 晴天'), null);
  assert.equal(songs.parsePlaylistId('https://www.youtube.com/playlist?list=PLabcdefghij123'), 'PLabcdefghij123');
  assert.equal(songs.parseDuration('PT4M29S'), 269); assert.equal(songs.parseDuration('PT1H2M'), 3720);
});

test('YouTube 搜尋：有帳號 token 走 Bearer、否則帶 API key；過濾不可嵌入與直播；兩者皆無 503', async () => {
  const calls = [];
  const fetchImpl = async (url, opt) => {
    calls.push({ url, auth: opt.headers.authorization });
    if (url.includes('/search?')) return { ok: true, json: async () => ({ items: [{ id: { videoId: ID(1) } }, { id: { videoId: ID(2) } }, { id: { videoId: ID(3) } }] }) };
    return { ok: true, json: async () => ({ items: [
      { id: ID(1), snippet: { title: 'A &amp; B', channelTitle: 'X', liveBroadcastContent: 'none', thumbnails: { medium: { url: 'https://i.ytimg.com/a.jpg' } } }, contentDetails: { duration: 'PT3M' }, status: { embeddable: true } },
      { id: ID(2), snippet: { title: 'no embed' }, contentDetails: { duration: 'PT3M' }, status: { embeddable: false } },
      { id: ID(3), snippet: { title: 'live', liveBroadcastContent: 'live' }, contentDetails: { duration: 'P0D' }, status: { embeddable: true } },
    ] }) };
  };
  const yt = songs.createYouTube({ fetchImpl, apiKey: 'KEY', getToken: async () => null });
  const out = await yt.search('晴天');
  assert.deepEqual(out.map(v => v.video_id), [ID(1)]); assert.equal(out[0].title, 'A & B'); assert.equal(out[0].duration, 180);
  assert.match(calls[0].url, /key=KEY/); assert.match(calls[0].url, /videoEmbeddable=true/);
  calls.length = 0;
  await songs.createYouTube({ fetchImpl, apiKey: '', getToken: async () => 'TOK' }).search('x');
  assert.equal(calls[0].auth, 'Bearer TOK'); assert.doesNotMatch(calls[0].url, /key=/);
  await assert.rejects(songs.createYouTube({ fetchImpl, apiKey: '', getToken: async () => null }).search('x'), e => e.status === 503);
  const quota = songs.createYouTube({ fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) }), apiKey: 'K' });
  await assert.rejects(quota.search('x'), e => e.status === 429 && /額度/.test(e.message));
});

test('OAuth 綁定網址：youtube.readonly、離線存取', () => {
  const u = new URL(songs.authUrl({ clientId: 'cid', redirectUri: 'https://www.emoji.tw/auth/youtube/callback', state: 'st' }));
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.readonly');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://www.emoji.tw/auth/youtube/callback');
});

test('接線：POS 分頁、客人菜單卡片、操作紀錄、品牌子帳號可用、token 不進公開內容', () => {
  const pos = read('public/pos.html'), order = read('public/order.html'), server = read('server.js');
  assert.match(pos, /\{ id:'songs', icon:'music',\s+label:'點歌' \}/);
  assert.match(pos, /songs:tabSongs/); assert.match(pos, /<script src="\/pos-songs.js"><\/script>/); assert.match(pos, /songBoot\(\)/);
  assert.match(read('public/pos-icons.js'), /music:'/);
  assert.match(order, /id="song-open"/); assert.match(order, /\/songs\/request/);
  assert.match(order, /song-open'\)\.classList\.toggle\('hidden',!on\)/, '關閉時隱藏點歌卡片');
  const log = require('../lib/pos-log.js');
  assert.equal(log.describe('POST', '/orders/songs/settings'), '點歌設定（開關／價格／常態歌單）');
  assert.equal(log.describe('POST', '/orders/songs/next'), null, '自動換歌不洗版操作紀錄');
  // 點歌 API 掛在 /api/admin/orders 底下＝FOOD_API 已放行品牌子帳號
  assert.match(server, /app\.get\('\/api\/admin\/orders\/songs',auth,adminOnly/);
  assert.ok(!require('../lib/security.js').PUBLIC_CONTENT_KEYS.some(k => /^song/.test(k)), 'song_* 不可進公開內容');
  assert.match(server, /access_token:encSecret\(t\.access_token\),refresh_token:encSecret\(t\.refresh_token\)/, 'YouTube token 加密保存');
});

test('點播統計：熱門依次數、最近依時間、長度上限過濾、最多 500 首', () => {
  let st = songs.normalizeStats('');
  st = songs.bumpStats(st, T(ID(1)), Date.parse('2026-10-27T10:00:00Z'));
  st = songs.bumpStats(st, T(ID(2)), Date.parse('2026-10-27T11:00:00Z'));
  st = songs.bumpStats(st, T(ID(1)), Date.parse('2026-10-27T09:00:00Z'));
  st = songs.bumpStats(st, T(ID(3), { duration: 900 }), Date.parse('2026-10-27T12:00:00Z'));
  const d = songs.discoverLists(st, { maxSeconds: 600 });
  assert.deepEqual(d.popular.map(t => [t.video_id, t.count]), [[ID(1), 2], [ID(2), 1]]);
  assert.deepEqual(d.recent.map(t => t.video_id), [ID(2), ID(1)]);
  let big = songs.normalizeStats('');
  for (let i = 0; i < 510; i++) big = songs.bumpStats(big, T(('z' + i).padEnd(11, 'q')), 1e12 + i);
  assert.equal(Object.keys(big.songs).length, 500);
  assert.ok(!big.songs['z0'.padEnd(11, 'q')], '最舊的被淘汰');
});

test('排行榜：YouTube 台灣音樂熱門（chart=mostPopular、videoCategoryId=10），過濾不可嵌入', async () => {
  let url = '';
  const yt = songs.createYouTube({ apiKey: 'K', fetchImpl: async u => { url = u; return { ok: true, json: async () => ({ items: [
    { id: ID(1), snippet: { title: 'Hit', channelTitle: 'A', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT3M' }, status: { embeddable: true } },
    { id: ID(2), snippet: { title: 'No' }, contentDetails: { duration: 'PT3M' }, status: { embeddable: false } }] }) }; } });
  const out = await yt.chart(30);
  assert.deepEqual(out.map(v => v.video_id), [ID(1)]);
  assert.match(url, /chart=mostPopular/); assert.match(url, /regionCode=TW/); assert.match(url, /videoCategoryId=10/);
});

test('UI：設定移到設定頁、分頁有熱門／最近點過／排行榜／搜尋、標題完整顯示不截斷', () => {
  const ps = read('public/pos-songs.js'), set = read('public/pos-settings.js'), pos = read('public/pos.html'), order = read('public/order.html');
  assert.match(set, /songSettingsSection\(\)/); assert.match(set, /bindSongSettings\(\)/);
  assert.match(ps, /function paintSongSettings/);
  // 分頁本身不再有開關與價格表單
  const paint = ps.slice(ps.indexOf('function paintSongs'), ps.indexOf('async function songDo'));
  assert.doesNotMatch(paint, /data-song-enabled|data-song-set[ >]|data-song-yt-on|data-song-import/);
  assert.match(ps, /\['popular', '熱門'\], \['recent', '最近點過'\], \['chart', '排行榜'\], \['search', '搜尋'\]/);
  assert.match(order, /var SONG_VIEWS=\['popular','recent','chart','search','queue'\]/);
  assert.match(order, /\/songs\/discover\?/);
  for (const css of [pos, order]) {
    const row = css.match(/\.song-(?:meta|row \.n) b\{[^}]*\}/)[0];
    assert.match(row, /overflow-wrap:anywhere/, '長標題換行');
    assert.doesNotMatch(row, /white-space:nowrap|text-overflow|line-clamp/, '標題完整顯示，不可截斷');
  }
});

test('接下來：待播優先，再接常態歌單從下一首起的整份順序；隨機只列待播', () => {
  const pl = [T(ID(7)), T(ID(8)), T(ID(9))];
  let st = { ...songs.normalizeState(''), fallback_index: 1 };
  st = songs.enqueue(st, T(ID(1)), { table: 'A3', by: '小明' }).state;
  const up = songs.upcoming(st, songs.normalizeSettings({ playlist: pl }));
  assert.deepEqual(up.items.map(t => [t.pos, t.kind, t.video_id]), [[1, 'request', ID(1)], [2, 'playlist', ID(8)], [3, 'playlist', ID(9)], [4, 'playlist', ID(7)]]);
  assert.equal(up.items[0].table, 'A3'); assert.equal(up.items[0].by, '小明');
  // 隨機：列出洗好的一輪，實際播放順序與列出的一致，每首各一次
  const set = songs.normalizeSettings({ playlist: pl, shuffle: true });
  let s2 = { ...songs.normalizeState(''), shuffle_bag: songs.shuffleBag(pl, [], () => 0.3) };
  const listed = songs.upcoming(s2, set).items.map(t => t.video_id);
  assert.equal(listed.length, 3); assert.deepEqual([...listed].sort(), [ID(7), ID(8), ID(9)]);
  const played = [];
  for (let i = 0; i < 3; i++) { const r = songs.advance(s2, set, { current: s2.now && s2.now.id }); s2 = r.state; played.push(r.song.video_id); }
  assert.deepEqual(played, listed, '照列出的順序播');
  assert.equal(songs.upcoming(s2, set).items.length, 3, '一輪播完自動再洗一輪');
  // 歌單刪掉一首：袋子剔除
  assert.deepEqual(songs.shuffleBag([T(ID(7)), T(ID(9))], [ID(8), ID(9), ID(7)]), [ID(9), ID(7)]);
});

test('POS：顯示哪桌誰點的、接下來全部歌曲；播放器可拖移、縮到最小、記住位置；歌名不截斷', () => {
  const ps = read('public/pos-songs.js'), pos = read('public/pos.html');
  assert.match(ps, /function songWho/); assert.match(ps, /<b>桌 \$\{esc\(t\.table \|\| '—'\)\}<\/b>\$\{t\.by \? `・\$\{esc\(t\.by\)\}` : ''\}/);
  assert.match(ps, /d\.upcoming/); assert.match(ps, /接下來 <span class="song-count">/);
  assert.match(ps, /data-song-dock-min/); assert.match(ps, /pointermove/); assert.match(ps, /tth_song_dock/);
  assert.match(pos, /#song-dock\.is-min \.song-dock-video\{height:0;overflow:hidden\}/, '縮小時影片收起但不停止播放');
  const t = pos.match(/\.song-dock-bar span\{[^}]*\}/)[0];
  assert.doesNotMatch(t, /nowrap|ellipsis|line-clamp/, '播放器歌名不截斷');
});

test('待播排序：移到指定位置（夾頭尾）；插播 front 排到下一首', () => {
  let st = songs.normalizeState('');
  for (const n of [1, 2, 3, 4]) st = songs.enqueue(st, T(ID(n)), { source: 'pos' }).state;
  const ids = () => st.queue.map(e => e.video_id), id = n => st.queue.find(e => e.video_id === ID(n)).id;
  st = songs.moveTo(st, id(4), 1); assert.deepEqual(ids(), [ID(1), ID(4), ID(2), ID(3)]);
  st = songs.moveTo(st, id(1), 99); assert.deepEqual(ids(), [ID(4), ID(2), ID(3), ID(1)]);
  st = songs.moveTo(st, id(3), -5); assert.deepEqual(ids(), [ID(3), ID(4), ID(2), ID(1)]);
  assert.throws(() => songs.moveTo(st, 'nope', 0), /不在待播/);
  st = songs.enqueue(st, T(ID(5)), { source: 'pos', front: true }).state; assert.equal(st.queue[0].video_id, ID(5));
  // 插播的歌在 upcoming 排第一
  assert.equal(songs.upcoming(st, songs.normalizeSettings('')).items[0].video_id, ID(5));
});

test('POS：排序鍵、插播、KTV 音效（CC0 音檔都在 public/sfx）', () => {
  const ps = read('public/pos-songs.js'), srv = read('server.js'), doc = read('docs/API.md');
  assert.match(ps, /data-song-move/); assert.match(ps, /data-song-front/); assert.match(ps, /下一首播/);
  assert.match(srv, /\/api\/admin\/orders\/songs\/queue\/:id\/move/); assert.match(doc, /### POST \/api\/admin\/orders\/songs\/queue\/:id\/move/);
  const ids = [...ps.match(/const SONG_SFX = (.*);/)[1].matchAll(/\['([a-z-]+)', '[^']+'\]/g)].map(m => m[1]);
  for (const k of ['applause', 'cheer', 'laugh', 'drumroll']) assert.ok(ids.includes(k), k);
  for (const k of ids) assert.ok(fs.existsSync(new URL('../public/sfx/' + k + '.mp3', import.meta.url)), k + '.mp3');
});

test('POS 平板橫放：兩欄各自捲動不捲整頁、正在播放在左欄頂端、播放器在點歌頁縮成一條、停止音效排第一', () => {
  const ps = read('public/pos-songs.js'), pos = read('public/pos.html');
  assert.match(pos, /#songs-body section\{padding:0\}/, 'style.css 的 section padding 不可撐出空白');
  assert.match(ps, /<section class="song-col"[^`]*\$\{nowCard\}/, '正在播放放在左欄');
  assert.equal((ps.match(/class="song-scroll"/g) || []).length, 2);
  assert.match(ps, /function songFit/); assert.match(ps, /min-width:1000px\) and \(min-height:600px/);
  assert.match(pos, /body:has\(\[data-panel=songs\]\.on\) #song-dock:not\(\.is-expand\) \.song-dock-video\{height:0;overflow:hidden\}/, '縮小不可 display:none');
  assert.doesNotMatch(pos, /#song-dock[^{]*\.song-dock-grip\{display:none\}/, '點歌頁也要留著「＋」鈕，否則放不大');
  assert.match(ps, /function songDockTab/); assert.match(pos, /songDockTab\(\)/, '切分頁要收回暫時展開並重新夾位置');
  assert.match(ps, /songDockMin\(dock, !songDockShrunk\(dock\)\)/, '按鈕依實際外觀切換（含點歌頁自動縮小）');
  assert.match(ps, /<div class="song-sfx-grid"><button[^>]*data-song-sfx-stop>/);
  assert.match(ps, /JSON\.stringify\(SONGS\.data\) !== before/, '輪詢沒變不重繪');
});

test('即時搜尋：客人端與 POS 打字自動搜（0.5 秒防抖、組字中不送、丟棄舊回應），不需搜尋按鈕', () => {
  const ps = read('public/pos-songs.js'), order = read('public/order.html');
  assert.doesNotMatch(order, /id="song-go"/, '客人端不再有搜尋按鈕');
  assert.match(order, /\$\('#song-q'\)\.addEventListener\('input',function\(e\)\{if\(!e\.isComposing\)songSearchSoon\(\);\}\)/);
  assert.match(order, /addEventListener\('compositionend',songSearchSoon\)/);
  assert.match(order, /if\(seq!==SONG_SEQ\)return;/);
  const form = ps.slice(ps.indexOf("if (v === 'search')"), ps.indexOf("if (!SONGS.disc)"));
  assert.doesNotMatch(form, /type="submit"|>搜尋</, 'POS 不再有搜尋按鈕');
  assert.match(ps, /setTimeout\(\(\) => songRunSearch\(q\), 500\)/);
  assert.match(ps, /e\.isComposing/); assert.match(ps, /compositionend/);
  assert.match(ps, /if \(seq !== SONG_SEARCH_SEQ\) return;/);
  assert.match(ps, /function paintSongResults/, '只重畫結果區，輸入框不被換掉');
});

test('快速選：選歌手／選歌分組，點了帶入關鍵字搜尋；客人端與 POS 都載入 song-picks.js', async () => {
  const pos = read('public/pos.html'), order = read('public/order.html'), ps = read('public/pos-songs.js');
  for (const h of [pos, order]) assert.match(h, /<script src="\/song-picks\.js"><\/script>/);
  assert.match(order, /SongPicks\.html\(SONG_PICK,LANG,esc\)/); assert.match(ps, /SongPicks\.html\(SONG_PICK, 'zh', esc\)/);
  const ctx = {}; (await import('node:vm')).runInNewContext(read('public/song-picks.js'), ctx);
  const P = ctx.SongPicks, esc = s => String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
  const seen = new Set(); for (const [, a] of P.ARTISTS) for (const x of a) { assert.ok(!seen.has(x), '歌手重複 ' + x); seen.add(x); }
  for (const [, list] of P.SONGS) for (const x of list) assert.equal(x.length, 2);
  const a = P.html({ mode: 'artist' }, 'zh', esc); assert.match(a, /data-pick-q="周杰倫"/); assert.match(a, /選歌手/);
  const so = P.html({ mode: 'song', group: 'taigi' }, 'en', esc); assert.match(so, /data-pick-q="家後 江蕙"/); assert.match(so, /Taiwanese/);
  const st = { mode: 'artist', group: '' }, btn = q => ({ closest: () => ({ hasAttribute: () => false, dataset: q }) });
  assert.equal(P.click(btn({ pickMode: 'song' }), st), true); assert.equal(st.mode, 'song');
  assert.deepEqual({ ...P.click(btn({ pickQ: '晴天 周杰倫' }), st) }, { q: '晴天 周杰倫' });
});
