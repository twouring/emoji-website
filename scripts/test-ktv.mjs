// KTV 獨立系統（KK 11/6）：ktv.emoji.tw，屬言文字、不分品牌；點歌從 POS 移除；CIS 用言文字（www.emoji.tw/cis）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const SECRET = 'local-test-secret-not-used-in-production';

async function server(t, env = {}) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: SECRET, DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub', GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); }, console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (url, headers = {}) => new Promise((resolve, reject) => { const req = httpRequest(base + url, { headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); }); req.on('error', reject); req.end(); });
}


const K = require(path.join(root, 'lib/ktv.js'));

test('ktv.emoji.tw：控台／電視／遙控／歌單／統計／設定回 KTV 頁；API、靜態檔放行；其他導回首頁', async t => {
  const get = await server(t);
  for (const p of ['/', '/tv', '/remote', '/playlists', '/stats', '/settings']) {
    const r = await get(p, { host: 'ktv.emoji.tw' });
    assert.equal(r.status, 200, p); assert.match(r.body, /言文字 KTV/, p); assert.match(r.body, /src="\/ktv\.js"/, p);
    assert.doesNotMatch(r.body, /<!--KTV_VERSION-->/, '版本號由伺服器替換');
  }
  for (const f of ['/ktv.js', '/song-picks.js', '/sso-client.js', '/sfx/applause.mp3', '/cis/assets/emoji-mark.svg', '/cis/assets/emoji-h-reverse.svg']) assert.equal((await get(f, { host: 'ktv.emoji.tw' })).status, 200, f);
  for (const p of ['/events', '/atcafe', '/order']) { const r = await get(p, { host: 'ktv.emoji.tw' }); assert.equal(r.status, 302, p); assert.equal(r.headers.get('location'), '/', p); }
  assert.equal((await get('/api/admin/orders/songs', { host: 'ktv.emoji.tw' })).status, 401, 'API 要登入');
  const login = await get('/auth/google?redirect=' + encodeURIComponent('https://ktv.emoji.tw/settings'), { host: 'ktv.emoji.tw' });
  assert.equal(login.status, 302); assert.match(login.headers.get('location'), /www\.emoji\.tw\/auth\/google/, 'Google 登入回 www 發起（callback 在 www）');
  const w = await get('/auth/google?redirect=' + encodeURIComponent('https://ktv.emoji.tw/'), { host: 'www.emoji.tw' });
  assert.match(w.headers.get('location'), /accounts\.google\.com/, 'ktv.emoji.tw 在登入導回白名單');
  assert.notEqual((await get('/', { host: 'pos.emoji.tw' })).body.includes('言文字 KTV'), true, 'POS 首頁不是 KTV');
  for (const p of ['/ktv', '/ktv/', '/ktv/tv', '/ktv/remote']) { const r = await get(p, { host: 'pos.emoji.tw' }); assert.equal(r.status, 200, 'pos 備用入口 ' + p); assert.match(r.body, /言文字 KTV/); }
});

test('遙控指令：驗證、序號、30 秒過期、心跳帶 ack 只回沒做過的', () => {
  const t0 = Date.parse('2026-11-06T12:00:00Z');
  let live = K.normalizeLive('');
  live = K.pushCmd(live, { cmd: 'pause' }, { now: t0, by: 'kk' });
  live = K.pushCmd(live, { cmd: 'volume', arg: 72.4 }, { now: t0 + 1000 });
  live = K.pushCmd(live, { cmd: 'sfx', arg: 'cheer' }, { now: t0 + 2000 });
  assert.deepEqual(live.cmds.map(c => [c.seq, c.cmd, c.arg]), [[1, 'pause', null], [2, 'volume', 72], [3, 'sfx', 'cheer']]);
  assert.throws(() => K.pushCmd(live, { cmd: 'rm -rf' }), /不支援/);
  assert.throws(() => K.pushCmd(live, { cmd: 'volume', arg: 'x' }), /音量/);
  assert.throws(() => K.pushCmd(live, { cmd: 'sfx', arg: 'boom' }), /沒有這個音效/);
  assert.equal(K.pushCmd(live, { cmd: 'volume', arg: 500 }).cmds.at(-1).arg, 100, '音量夾在 0–100');
  assert.deepEqual(K.pendingCmds(live, 1, t0 + 3000).map(c => c.seq), [2, 3]);
  assert.deepEqual(K.pendingCmds(live, 0, t0 + 31000).map(c => c.seq), [3], '30 秒前的指令不再執行');
  for (let i = 0; i < 30; i++) live = K.pushCmd(live, { cmd: 'play' }, { now: t0 + 3000 });
  assert.equal(live.cmds.length, 20, '只留最近 20 筆');
});

test('播放裝置心跳：在線判斷、進度推算、離線', () => {
  const t0 = Date.parse('2026-11-06T12:00:00Z');
  let live = K.beat(K.normalizeLive(''), { device: 'ktv-a', name: '電視畫面', mode: 'tv', state: 'playing', pos: 30, dur: 200, vol: 80, muted: false, video_id: 'abcdefghijk', ack: 99 }, t0);
  assert.equal(live.beat.ack, 0, 'ack 不能超過目前序號');
  const v = K.liveView(live, t0 + 4000);
  assert.equal(v.online, true); assert.equal(v.state, 'playing'); assert.equal(v.pos, 34); assert.equal(v.vol, 80); assert.equal(v.mode, 'tv');
  const off = K.liveView(live, t0 + 16000); assert.equal(off.online, false); assert.equal(off.state, 'offline');
  assert.equal(K.liveView(K.normalizeLive(''), t0).online, false);
  assert.equal(K.beat(live, { state: 'hack', video_id: '<x>' }, t0).beat.state, 'idle');
});

test('統計：只算已結帳未作廢的點歌行、依台北營業日彙整', () => {
  const song = (vid, title, price = 10, extra = {}) => ({ item_id: 'song', cat: 'SONG', zh: '點歌｜' + title, price, qty: 1, venue: 'BAR', song: { request_id: 'sr', video_id: vid }, ...extra });
  const orders = [
    { status: 'paid', table_no: 'A3', paid_at: '2026-11-05T15:30:00Z', items: [song('aaaaaaaaaaa', '晴天'), song('bbbbbbbbbbb', '稻香'), { zh: '拿鐵', price: 150, qty: 1 }] },
    { status: 'done', table_no: 'B1', paid_at: '2026-11-06T02:00:00Z', items: JSON.stringify([song('aaaaaaaaaaa', '晴天', 20)]) },
    { status: 'void', table_no: 'C1', paid_at: '2026-11-06T02:00:00Z', items: [song('ccccccccccc', '作廢')] },
    { status: 'paid', table_no: 'C2', paid_at: '2026-11-06T02:00:00Z', items: [song('ddddddddddd', '取消', 10, { cancelled: true })] },
  ];
  const s = K.songSales(orders);
  assert.equal(s.count, 3); assert.equal(s.amount, 40);
  assert.deepEqual(s.days.map(d => [d.day, d.count, d.amount]), [['2026-11-05', 2, 20], ['2026-11-06', 1, 20]]);
  assert.deepEqual(s.songs[0], { video_id: 'aaaaaaaaaaa', title: '晴天', count: 2 });
  assert.deepEqual(s.tables.map(t => t.table), ['A3', 'B1']);
});

test('不分品牌：舊的分品牌設定合併成一份', () => {
  const songs = require(path.join(root, 'lib/songs.js'));
  const tr = id => ({ video_id: id, title: id });
  const cafe = songs.normalizeSettings({ enabled: false, playlist: [tr('aaaaaaaaaaa')], schedules: [{ name: '咖啡', days: [1], start: '08:00', end: '17:00', playlist: [tr('bbbbbbbbbbb')] }] });
  const bar = songs.normalizeSettings({ enabled: true, price: 20, player_device: 'dev1', playlist: [tr('ccccccccccc'), tr('ddddddddddd')], schedules: [{ name: '咖啡', days: [1], start: '08:00', end: '17:00', playlist: [tr('bbbbbbbbbbb')] }, { name: '深夜', days: [5], start: '21:00', end: '02:00', playlist: [tr('eeeeeeeeeee')] }] });
  const m = K.mergeSettings([cafe, bar]);
  assert.equal(m.enabled, true); assert.equal(m.price, 20); assert.equal(m.player_device, 'dev1');
  assert.equal(m.playlist.length, 2, '常態歌單取最長');
  assert.deepEqual(m.schedules.map(x => x.name), ['咖啡', '深夜'], '時段歌單聯集去重');
  assert.equal(K.mergeSettings([]).enabled, false);
});

test('server：KTV 一份不分品牌（ktv_* key、不用 venue）、遙控／心跳／統計路由、打賞音效走 KTV', () => {
  const srv = read('server.js'), blk = srv.slice(srv.indexOf('/* ---- 點歌（lib/songs.js）'), srv.indexOf('/* ---- 點歌 end ---- */'));
  assert.match(blk, /settings:'ktv_settings',state:'ktv_state',live:'ktv_live'/);
  assert.doesNotMatch(blk, /songVenue\(|song_state:'\+v|withSongs\(v,/, 'KTV 不分品牌');
  for (const r of ["app.get('/api/admin/orders/songs/live'", "app.post('/api/admin/orders/songs/remote'", "app.post('/api/admin/orders/songs/beat'", "app.get('/api/admin/orders/songs/stats'"]) assert.ok(blk.includes(r), r);
  assert.match(blk, /device!==settings\.player_device\)return res\.status\(409\)/, '只有播放裝置能回報心跳');
  assert.match(srv, /ktvPushCmd\('sfx',out\.sfx,'打賞'\)/, '打賞確認後由 KTV 播放裝置播音效');
  const doc = read('docs/API.md');
  for (const h of ['### GET /api/admin/orders/songs/live', '### POST /api/admin/orders/songs/remote', '### POST /api/admin/orders/songs/beat', '### GET /api/admin/orders/songs/stats']) assert.ok(doc.includes(h), h);
});

test('POS 不再有點歌（KK 11/6 抽出成 ktv.emoji.tw），設定頁只留入口', () => {
  const pos = read('public/pos.html'), set = read('public/pos-settings.js'), tips = read('public/pos-tips.js');
  assert.doesNotMatch(pos, /id:'songs'|tabSongs|pos-songs\.js|songBoot|song-dock|loadSongs/);
  assert.ok(!require('node:fs').existsSync(path.join(root, 'public/pos-songs.js')));
  assert.match(set, /href="https:\/\/ktv\.emoji\.tw\/"/);
  assert.doesNotMatch(set, /songSettingsSection|bindSongSettings/);
  assert.doesNotMatch(tips, /songSfx|isSongPlayer/);
});

test('KTV 頁：言文字 CIS（墨紙、唯一黃、明體／Cormorant／Noto Sans、CIS 標誌）、字級 ≥1rem、六個頁面', () => {
  const html = read('public/ktv.html'), js = read('public/ktv.js');
  for (const c of ['--ink:#1B1A17', '--paper:#FBFAF6', '--accent:#FFDE34', '"Noto Serif TC"', '"Cormorant Garamond"', '"Noto Sans TC"']) assert.ok(html.includes(c), c);
  assert.match(html, /\/cis\/assets\/emoji-mark\.svg/); assert.match(js, /\/cis\/assets\/emoji-h-reverse\.svg/, '電視深色底用反白標誌');
  for (const m of html.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) assert.ok(m[2] === 'rem' ? +m[1] >= 1 : +m[1] >= 16, m[0]);
  for (const p of ["'console', '/'", "'remote', '/remote'", "'playlists', '/playlists'", "'stats', '/stats'", "'settings', '/settings'", "'tv', '/tv'"]) assert.ok(js.includes(p), p);
  assert.match(js, /\/admin\/orders\/songs\/beat/); assert.match(js, /\/admin\/orders\/songs\/remote/);
  assert.match(js, /setTimeout\(\(\) => runSearch\(q\), 500\)/, '搜尋防抖 0.5 秒'); assert.match(js, /isComposing/);
  assert.match(js, /overflow|esc\(t\.title\)/);
  assert.match(html, /\.row \.meta b\{[^}]*overflow-wrap:anywhere/, '歌名完整顯示');
  assert.doesNotMatch(html.match(/\.row \.meta b\{[^}]*\}/)[0], /nowrap|ellipsis|line-clamp/);
  assert.doesNotMatch(js, /venue=/, '不分品牌：不帶 venue');
  assert.match(html, /#ktv-dock\{position:fixed;left:-10000px/, '播放器常駐（不可 display:none）');
});
