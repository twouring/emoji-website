// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：點歌全流程，跑真的 server.js 路由（vm 切出）＋PGlite，YouTube 以假 fetch 代替
// KTV 不分品牌（KK 11/6）：舊分品牌設定合併成一份 → 預設關閉 → KTV 開啟 → 客人點歌（桌上多一行 NT$10）→ 沒人點歌播常態歌單 → 有人點歌 preempt → 影片無法播放自動退 → 店員移除也退
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import express from 'express';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); return source.slice(i, source.indexOf(b, i)); };
const REAL_FETCH = globalThis.fetch;
const ID = n => ('vid' + n).padEnd(11, 'x');

test('點歌：預設關閉、開啟後掃碼點歌進帳單、常態歌單、無法播放自動退', async () => {
  const db = new PGlite(); let listener;
  try {
    await db.exec(`CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE table_sessions(id TEXT PRIMARY KEY,table_no TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',items JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ DEFAULT now());
      INSERT INTO table_sessions(id,table_no) VALUES('ts_00000000000000a1','A1');
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,session_id TEXT,table_no TEXT,items JSONB NOT NULL,amount INT,status TEXT NOT NULL DEFAULT 'paid',paid_at TIMESTAMPTZ NOT NULL DEFAULT now());
      INSERT INTO site_content(key,value) VALUES('song_settings:CAFE','{"enabled":false,"schedules":[{"name":"咖啡","days":[1],"start":"08:00","end":"17:00","playlist":[{"video_id":"vid6xxxxxxx","title":"舊咖啡"}]}]}');`);
    const q = (sql, args) => db.query(sql, args);
    // 營業時段才開放購買：固定在台北 20:00（三點水時段），不受跑測試的時間影響
    const RealDate = Date, FIXED = RealDate.parse('2026-11-06T20:00:00+08:00');
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
    const tableOrders = require('./lib/table-orders'), songs = require('./lib/songs'), ktv = require('./lib/ktv'), songTickets = require('./lib/song-tickets');
    // 假 YouTube：videos 回可嵌入；ID(9) 不可嵌入
    const realFetch = globalThis.fetch;
    const fakeFetch = async (url, opt) => {
      const u = String(url);
      if (!u.startsWith('https://www.googleapis.com/youtube/v3/')) return realFetch(url, opt);
      const p = new URL(u);
      const ids = (p.searchParams.get('id') || '').split(',').filter(Boolean);
      return { ok: true, status: 200, json: async () => ({ items: ids.map(id => ({ id, snippet: { title: 'T-' + id, channelTitle: 'C', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT3M' }, status: { embeddable: id !== ID(9) } })) }) };
    };
    const app = express(); app.use(express.json());
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders, songs, ktv, songTickets: require('./lib/song-tickets'), KTV_BASE: 'https://ktv.emoji.tw', SECRET: 'test-secret', OWN_BASE: 'https://www.emoji.tw', SITE_BASE: 'https://www.emoji.tw',
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', dbReady: true, process: { env: { YOUTUBE_API_KEY: 'k' } }, fetch: fakeFetch, crypto: require('node:crypto'),
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: null }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      assertNotPaused: async () => {}, pinVenue: (req, v) => String(v || '').toUpperCase(), decPII: v => v, encSecret: v => v, signToken: () => 'st', verifyToken: () => null, safeEqual: () => false, safeRedirect: () => null, actorOf: a => a.email,
      console, Buffer, URL, URLSearchParams, Date: globalThis.Date, JSON, Math, Object, Array, Number, String, Error, Map, Set, Promise, AbortSignal });
    globalThis.fetch = fakeFetch;   // lib/songs.js 的 createYouTube 預設用全域 fetch
    vm.runInContext(slice('/* ---- 點歌（lib/songs.js）', '/* ---- 點歌 end ---- */'), ctx);
    listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
    const base = `http://127.0.0.1:${listener.address().port}`;
        const call = async (method, path, body) => { const r = await realFetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const S = 'ts_00000000000000a1', K = tableOrders.sessionKey(S, 'test-secret'), QS = `s=${S}&k=${K}`;
    const items = async () => (await q('SELECT items FROM table_sessions WHERE id=$1', [S])).rows[0].items;

    // 第一次讀：沿用舊的分品牌設定（時段歌單），合併成一份
    let r = await call('GET', '/api/admin/orders/songs');
    assert.equal(r.status, 200); assert.deepEqual(r.body.settings.schedules.map(x => x.name), ['咖啡']);
    // 預設關閉
    r = await call('GET', '/api/songs?' + QS);
    assert.equal(r.status, 200); assert.equal(r.body.enabled, false);
    r = await call('POST', '/api/songs/buy', { s: S, k: K, n: 1, guest: 'abcdefgh12', by: '小明' });
    assert.equal(r.status, 423);
    // QR 無效
    assert.equal((await call('GET', `/api/songs?s=${S}&k=0000000000000000`)).status, 403);
    // POS 開啟、設常態歌單、這台當播放裝置
    r = await call('POST', '/api/admin/orders/songs/settings', { enabled: true, playlist: [{ video_id: ID(7), title: 'BGM7' }, { video_id: ID(8), title: 'BGM8' }] });
    assert.equal(r.status, 200); assert.equal(r.body.settings.enabled, true); assert.equal(r.body.settings.price, 10);
    await call('POST', '/api/admin/orders/songs/player', { device: 'dev-1' });
    // 不分品牌：帶任何 venue 都是同一份；寫進 ktv_settings
    r = await call('GET', '/api/admin/orders/songs?venue=CAFE');
    assert.equal(r.body.settings.enabled, true); assert.equal(r.body.settings.playlist.length, 2); assert.equal(r.body.settings.player_device, 'dev-1');
    assert.ok((await q("SELECT 1 FROM site_content WHERE key='ktv_settings'")).rows.length);
    assert.equal((await q("SELECT 1 FROM site_content WHERE key LIKE 'song_state:%'")).rows.length, 0);
    // 遙控：控台送指令 → 播放裝置心跳領取 → 控台看到狀態
    assert.equal((await call('GET', '/api/admin/orders/songs/live')).body.online, false);
    r = await call('POST', '/api/admin/orders/songs/remote', { cmd: 'volume', arg: 60 }); assert.equal(r.status, 200);
    assert.equal((await call('POST', '/api/admin/orders/songs/remote', { cmd: 'format-c' })).status, 400);
    assert.equal((await call('POST', '/api/admin/orders/songs/beat', { device: 'dev-2', state: 'playing' })).status, 409, '非播放裝置不能回報');
    r = await call('POST', '/api/admin/orders/songs/beat', { device: 'dev-1', name: '電視畫面', mode: 'tv', state: 'playing', pos: 10, dur: 180, vol: 100, ack: 0 });
    assert.equal(r.status, 200); assert.deepEqual(r.body.cmds.map(c => [c.cmd, c.arg]), [['volume', 60]]);
    r = await call('POST', '/api/admin/orders/songs/beat', { device: 'dev-1', state: 'playing', pos: 12, dur: 180, vol: 60, ack: r.body.seq });
    assert.equal(r.body.cmds.length, 0, '做過的指令不再回');
    r = await call('GET', '/api/admin/orders/songs/live'); assert.equal(r.body.online, true); assert.equal(r.body.vol, 60); assert.equal(r.body.state, 'playing');
    // 沒人點歌：播常態歌單
    r = await call('POST', '/api/admin/orders/songs/next', { result: 'ended', device: 'dev-1' });
    assert.equal(r.body.now.kind, 'playlist'); assert.equal(r.body.now.video_id, ID(7));
    // 非播放裝置不能 ended
    assert.equal((await call('POST', '/api/admin/orders/songs/next', { result: 'ended', device: 'dev-2', current: r.body.now.id })).status, 409);
    // KK 11/6：桌邊 QR 只能購買首數；店員發一次性點歌 QR；客人掃點歌 QR 選歌
    assert.equal((await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(1), guest: 'abcdefgh12' })).status, 404, '桌邊不能直接選歌');
    r = await call('POST', '/api/songs/buy', { s: S, k: K, n: 2, guest: 'abcdefgh12', by: '小明' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.bought, 2); assert.equal(r.body.pending, 2);
    let its = await items(); assert.equal(its.length, 2); assert.ok(its.every(l => l.cat === 'SONG' && l.price === 10 && l.song.pending && l.placed_at && l.served_at));
    assert.equal((await call('GET', '/api/songs?' + QS)).body.pending, 2);
    assert.equal((await call('POST', '/api/songs/buy', { s: S, k: K, n: 99, guest: 'abcdefgh12' })).status, 400, '超過每次上限');
    let st;
    // 控台：這桌待發兌換碼 → 發碼；客人掃播放裝置 QR（d＝裝置代號）輸入兌換碼
    r = await call('GET', '/api/admin/orders/songs/tickets'); assert.deepEqual(r.body.tables.map(x => [x.table, x.unissued]), [['A1', 2]]);
    r = await call('POST', '/api/admin/orders/songs/tickets', { session_id: S });
    assert.equal(r.status, 201, JSON.stringify(r.body)); const tk = r.body.ticket; assert.equal(tk.total, 2); assert.match(tk.code, /^\d{6}$/);
    assert.equal(r.body.tables.length, 0, '發過就不再列待發');
    assert.equal((await call('POST', '/api/admin/orders/songs/tickets', { session_id: S })).status, 409, '沒有新買的不能重發');
    st = (await call('GET', '/api/admin/orders/songs')).body;
    assert.equal(st.song_tickets.tickets[0].left, 2, '控台看得到可用的兌換碼'); assert.equal(st.song_tickets.tickets[0].code, tk.code);
    assert.match(st.device_url, /^https:\/\/ktv\.emoji\.tw\/s\?d=[A-Za-z0-9]{10}$/, '電視顯示播放裝置 QR');
    const D = new URL(st.device_url).searchParams.get('d'), TQ = { d: D, code: tk.code };
    assert.equal((await call('GET', '/api/ktv/device?d=AAAAAAAAAA')).status, 403, '不是目前播放裝置的 QR');
    r = await call('GET', '/api/ktv/device?d=' + D); assert.equal(r.status, 200); assert.equal(r.body.enabled, true); assert.equal(r.body.table, undefined);
    const wrong = tk.code === '000000' ? '000001' : '000000';
    assert.equal((await call('GET', `/api/ktv/ticket?d=${D}&code=${wrong}`)).status, 404, '兌換碼錯');
    assert.equal((await call('GET', `/api/ktv/ticket?d=AAAAAAAAAA&code=${tk.code}`)).status, 403, '裝置代號錯');
    r = await call('GET', `/api/ktv/ticket?d=${D}&code=${tk.code.slice(0, 3)} ${tk.code.slice(3)}`); assert.equal(r.status, 200, '可含空白'); assert.equal(r.body.left, 2); assert.equal(r.body.table, 'A1');
    r = await call('GET', `/api/ktv/discover?d=${D}&code=${tk.code}`); assert.equal(r.status, 200); assert.ok(Array.isArray(r.body.chart));
    // 選第一首
    r = await call('POST', '/api/ktv/pick', { ...TQ, video_id: ID(1) });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.left, 1); assert.equal(r.body.queue[0].video_id, ID(1)); assert.equal(r.body.queue[0].mine, true);
    its = await items(); assert.equal(its.filter(l => l.song.pending).length, 1); assert.ok(its.some(l => l.song.video_id === ID(1) && /晴天|T-/.test(l.zh)));
    assert.equal((await call('POST', '/api/ktv/pick', { ...TQ, video_id: ID(9) })).status, 400, '不可嵌入');
    // 播放裝置看到有人點歌 → preempt；播放失敗 → 那首從帳上拿掉
    st = (await call('GET', '/api/admin/orders/songs')).body;
    r = await call('POST', '/api/admin/orders/songs/next', { result: 'preempt', device: 'dev-1', current: st.now.id });
    assert.equal(r.body.now.kind, 'request'); assert.equal(r.body.now.video_id, ID(1));
    r = await call('POST', '/api/admin/orders/songs/next', { result: 'error', device: 'dev-1', current: r.body.now.id });
    assert.equal(r.body.refunded, true); assert.equal((await items()).length, 1, '無法播放的那首退掉，剩一首待選歌');
    // 第二首；用完再點 409
    r = await call('POST', '/api/ktv/pick', { ...TQ, video_id: ID(2) }); assert.equal(r.status, 201); assert.equal(r.body.left, 0);
    assert.equal((await call('POST', '/api/ktv/pick', { ...TQ, video_id: ID(3) })).status, 409, '用完了');
    // 店員從待播移除 → 也從帳上拿掉
    r = await call('DELETE', '/api/admin/orders/songs/queue/' + r.body.queue[0].id); assert.equal(r.body.refunded, true); assert.equal((await items()).length, 0);
    // 已結帳的不退
    await call('POST', '/api/songs/buy', { s: S, k: K, n: 1, guest: 'abcdefgh12' });
    const tk2 = (await call('POST', '/api/admin/orders/songs/tickets', { session_id: S })).body.ticket;
    assert.notEqual(tk2.code, tk.code);
    r = await call('POST', '/api/ktv/pick', { d: D, code: tk2.code, video_id: ID(4) }); assert.equal(r.status, 201, JSON.stringify(r.body));
    its = await items(); its[0].order_id = 'to_paid'; await q('UPDATE table_sessions SET items=$2 WHERE id=$1', [S, JSON.stringify(its)]);
    r = await call('DELETE', '/api/admin/orders/songs/queue/' + r.body.queue[0].id);
    assert.equal(r.body.refunded, false); assert.equal((await items()).length, 1);
    // 點播統計：熱門／最近點過（從兌換碼選的歌累計）
    r = await call('GET', `/api/ktv/discover?d=${D}&code=${tk2.code}`); assert.equal(r.body.popular.length >= 1, true);
    // 統計：結帳後的點歌行（作廢不算）
    const sl = songs.songLine({ id: 'sr1', title: '晴天', price: 10, video_id: ID(1), by: '小明' }, { venue: 'BAR', guest: 'g' });
    await q("INSERT INTO table_orders(id,table_no,items,amount,status) VALUES('o1','A1',$1,160,'paid'),('o2','A2',$1,10,'void')", [JSON.stringify([sl, { zh: '拿鐵', price: 150, qty: 1 }])]);
    r = await call('GET', '/api/admin/orders/songs/stats');
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.count, 1); assert.equal(r.body.amount, 10); assert.equal(r.body.songs[0].title, '晴天');
    // 關閉後客人不能買；清桌後桌邊 409、點歌 QR 410
    await call('POST', '/api/admin/orders/songs/settings', { enabled: false });
    assert.equal((await call('GET', '/api/songs?' + QS)).body.enabled, false);
    assert.equal((await call('POST', '/api/songs/buy', { s: S, k: K, n: 1, guest: 'abcdefgh12' })).status, 423);
    await q("UPDATE table_sessions SET status='closed'");
    assert.equal((await call('GET', '/api/songs?' + QS)).status, 409);
    assert.equal((await call('GET', `/api/ktv/device?d=${D}`)).status, 423, '關閉後裝置 QR 回 423');
    await call('POST', '/api/admin/orders/songs/settings', { enabled: true });
    assert.equal((await call('GET', `/api/ktv/ticket?d=${D}&code=${tk2.code}`)).status, 410, '結帳後兌換碼失效');
    // 換播放裝置：舊 QR 失效
    await call('POST', '/api/admin/orders/songs/player', { device: 'dev-2' });
    assert.equal((await call('GET', `/api/ktv/device?d=${D}`)).status, 403);
  } finally { if (typeof RealDate !== 'undefined') globalThis.Date = RealDate; globalThis.fetch = REAL_FETCH; if (listener) listener.close(); await db.close(); }
});
