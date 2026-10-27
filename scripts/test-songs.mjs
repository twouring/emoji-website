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
