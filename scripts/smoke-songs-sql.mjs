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
    const tableOrders = require('./lib/table-orders'), songs = require('./lib/songs'), ktv = require('./lib/ktv');
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
    const ctx = vm.createContext({ app, require, q, pool: { connect: async () => ({ query: q, release() {} }) }, tableOrders, songs, ktv, SECRET: 'test-secret', OWN_BASE: 'https://www.emoji.tw', SITE_BASE: 'https://www.emoji.tw',
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', dbReady: true, process: { env: { YOUTUBE_API_KEY: 'k' } }, fetch: fakeFetch, crypto: require('node:crypto'),
      auth: (req, res, next) => { req.auth = { role: 'admin', email: 'pos@test', brands: null }; next(); }, adminOnly: (r, s, nx) => nx(), requireDb: (r, s, nx) => nx(), rateLimit: () => (r, s, nx) => nx(),
      wrap: fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message })),
      contentValue: async k => (await q('SELECT value FROM site_content WHERE key=$1', [k])).rows[0]?.value || '',
      assertNotPaused: async () => {}, pinVenue: (req, v) => String(v || '').toUpperCase(), decPII: v => v, encSecret: v => v, signToken: () => 'st', verifyToken: () => null, safeEqual: () => false, safeRedirect: () => null, actorOf: a => a.email,
      console, Buffer, URL, URLSearchParams, Date, JSON, Math, Object, Array, Number, String, Error, Map, Set, Promise, AbortSignal });
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
    r = await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(1), guest: 'abcdefgh12', by: '小明' });
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
    // 客人點歌：桌上多一行 NT$10、已送出已出餐
    r = await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(1), guest: 'abcdefgh12', by: '小明' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.price, 10); assert.equal(r.body.queue[0].mine, true);
    let its = await items(); assert.equal(its.length, 1); assert.equal(its[0].price, 10); assert.equal(its[0].cat, 'SONG'); assert.ok(its[0].placed_at && its[0].served_at);
    // 重複點同一首 409
    assert.equal((await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(1), guest: 'abcdefgh12' })).status, 409);
    // 點播統計：熱門／最近點過
    r = await call('GET', '/api/songs/discover?' + QS);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.popular[0].video_id, ID(1)); assert.equal(r.body.popular[0].count, 1); assert.equal(r.body.recent[0].video_id, ID(1)); assert.ok(Array.isArray(r.body.chart));
    // 不可嵌入的影片 400
    assert.equal((await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(9), guest: 'abcdefgh12' })).status, 400);
    // 播放裝置看到有人點歌 → preempt 切掉常態歌單
    let st = (await call('GET', '/api/admin/orders/songs')).body;
    r = await call('POST', '/api/admin/orders/songs/next', { result: 'preempt', device: 'dev-1', current: st.now.id });
    assert.equal(r.body.now.kind, 'request'); assert.equal(r.body.now.video_id, ID(1));
    // 這首播放失敗 → 自動從帳上拿掉，回到常態歌單
    r = await call('POST', '/api/admin/orders/songs/next', { result: 'error', device: 'dev-1', current: r.body.now.id });
    assert.equal(r.body.refunded, true); assert.equal(r.body.now.kind, 'playlist'); assert.equal(r.body.now.video_id, ID(8), '常態歌單接著播下一首');
    assert.equal((await items()).length, 0);
    // 再點一首、店員從待播移除 → 也從帳上拿掉
    r = await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(2), guest: 'abcdefgh12' });
    assert.equal((await items()).length, 1);
    r = await call('DELETE', '/api/admin/orders/songs/queue/' + r.body.queue[0].id);
    assert.equal(r.body.refunded, true); assert.equal((await items()).length, 0);
    // 已結帳的點歌不退
    r = await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(3), guest: 'abcdefgh12' });
    its = await items(); its[0].order_id = 'to_paid'; await q('UPDATE table_sessions SET items=$2 WHERE id=$1', [S, JSON.stringify(its)]);
    r = await call('DELETE', '/api/admin/orders/songs/queue/' + r.body.queue[0].id);
    assert.equal(r.body.refunded, false); assert.equal((await items()).length, 1);
    // 每桌上限
    await call('POST', '/api/admin/orders/songs/settings', { max_per_table: 1 });
    assert.equal((await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(4), guest: 'abcdefgh12' })).status, 201);
    assert.equal((await call('POST', '/api/songs/request', { s: S, k: K, video_id: ID(5), guest: 'abcdefgh12' })).status, 409);
    // 統計：結帳後的點歌行（作廢不算）
    const sl = songs.songLine({ id: 'sr1', title: '晴天', price: 10, video_id: ID(1), by: '小明' }, { venue: 'BAR', guest: 'g' });
    await q("INSERT INTO table_orders(id,table_no,items,amount,status) VALUES('o1','A1',$1,160,'paid'),('o2','A2',$1,10,'void')", [JSON.stringify([sl, { zh: '拿鐵', price: 150, qty: 1 }])]);
    r = await call('GET', '/api/admin/orders/songs/stats');
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.count, 1); assert.equal(r.body.amount, 10); assert.equal(r.body.songs[0].title, '晴天');
    // 關閉後客人不能點；清桌後 409
    await call('POST', '/api/admin/orders/songs/settings', { enabled: false });
    assert.equal((await call('GET', '/api/songs?' + QS)).body.enabled, false);
    await q("UPDATE table_sessions SET status='closed'");
    assert.equal((await call('GET', '/api/songs?' + QS)).status, 409);
  } finally { globalThis.fetch = REAL_FETCH; if (listener) listener.close(); await db.close(); }
});
