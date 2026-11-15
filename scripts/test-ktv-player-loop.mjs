// KTV 播放裝置換歌迴圈（11/5 02:53–02:57 同一台 Mac 4 分鐘打 2,814 次 POST /api/admin/orders/songs/next）：
// next() 收到錯誤或「換了也沒變」的回應後立刻 playerSync() → 條件仍成立 → 再 next()，只受網路來回時間限制（約 12 次／秒）。
// 這裡用假 DOM＋假 fetch（模擬 80ms 來回）實際跑 public/ktv.js，量測每種失敗情境下的請求數。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/ktv.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function el() {
  return { innerHTML: '', textContent: '', hidden: false, title: '', value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {}, setAttribute() {}, matches: () => false, closest: () => null, focus() {} };
}

/* route(method, path, body, calls) → { status, body, headers } 或 throw（模擬斷網） */
function mount({ D, route, rtt = 80 }) {
  const ids = { '#app': el(), '#toast': el(), '#k-top': el(), '#k-nav': el(), '#k-logout': el() };
  const timers = new Set(), intervals = new Set();
  const calls = [];
  let stopped = false;
  const store = new Map([['tth_ktv_token', 'tok'], ['tth_ktv_device', 'dev-mac']]);
  const document = {
    hidden: false, visibilityState: 'visible', activeElement: null, documentElement: {}, head: { appendChild() {} }, body: { appendChild() {}, classList: { toggle() {}, remove() {} } },
    querySelector: s => ids[s] || null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el(),
  };
  class Player {
    constructor(_id, opts) { this.opts = opts; }
    loadVideoById() {} mute() {} unMute() {} playVideo() {} pauseVideo() {} stopVideo() {} setVolume() {} seekTo() {} destroy() {}
    getPlayerState() { return -1; } getCurrentTime() { return 0; } getDuration() { return 0; } isMuted() { return true; }
  }
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, document, JSON, Date, Math, Number, String, Object, Array, Set, Map, Promise, Error, URLSearchParams, encodeURIComponent,
    location: { hash: '', pathname: '/ktv', search: '', hostname: 'pos.emoji.tw', origin: 'https://pos.emoji.tw', reload() {} },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    crypto: { randomUUID: () => 'uuid' }, navigator: {}, confirm: () => true,
    addEventListener() {},
    setTimeout: (f, ms) => { const t = setTimeout(() => { timers.delete(t); f(); }, ms); timers.add(t); return t; },
    clearTimeout: t => { clearTimeout(t); timers.delete(t); },
    setInterval: (f, ms) => { const t = setInterval(f, ms); intervals.add(t); return t; },
    clearInterval: t => { clearInterval(t); intervals.delete(t); },
    YT: { Player, PlayerState: { PLAYING: 1, ENDED: 0 } },
    SongPicks: { html: () => '', back: () => '', click: () => null }, QRCode: null,
    fetch: (url, opt = {}) => {
      const method = opt.method || 'GET', path = url.replace(/^\/api/, '').split('?')[0], body = opt.body ? JSON.parse(opt.body) : null;
      if (stopped) return new Promise(() => {});
      calls.push({ at: Date.now(), method, path, body });
      return new Promise((resolve, reject) => setTimeout(() => {
        if (stopped) return;
        let r;
        try {
          if (method === 'GET' && path === '/state') r = { status: 200, body: { role: 'admin', me: {} } };
          else r = route(method, path, body, calls) || (method === 'GET' && path === '/admin/orders/songs' ? { status: 200, body: structuredClone(D) } : { status: 200, body: {} });
        } catch (e) { return reject(e); }
        const h = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
        resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: k => h[k.toLowerCase()] ?? null }, json: async () => structuredClone(r.body) });
      }, rtt));
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const stop = () => { stopped = true; for (const t of timers) clearTimeout(t); for (const t of intervals) clearInterval(t); timers.clear(); intervals.clear(); };
  return { ctx, calls, stop, nexts: () => calls.filter(c => c.method === 'POST' && c.path === '/admin/orders/songs/next') };
}

const T = (id, extra = {}) => ({ id, video_id: (id + 'xxxxxxxxxxx').slice(0, 11), title: 'S ' + id, channel: 'C', duration: 200, ...extra });
function base(extra = {}) {
  return { settings: { player_device: 'dev-mac', enabled: false, price: 10, max_per_table: 3, max_minutes: 8, shuffle: false, playlist: [], schedules: [] },
    now: null, queue: [], upcoming: { items: [], playlist_index: -1 }, history: [], youtube: { connected: false }, song_tickets: { tables: [], tickets: [] }, ...extra };
}
const WINDOW_MS = 3000;
let n0 = 0;
async function run(opts) { const h = mount(opts); try { await sleep(WINDOW_MS); return h.nexts(); } finally { h.stop(); } }

test('斷網：跨時段要切歌（schedule）每次都失敗，不可每個來回就重送', async () => {
  const D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), upcoming: { items: [T('b', { kind: 'playlist', pos: 1 })], playlist_index: 1 } });
  const n = await run({ D, route: (m, p) => { if (p === '/admin/orders/songs/next') throw new TypeError('Failed to fetch'); } });
  console.log(`  斷網 ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.ok(n.length <= 3, `斷網時 next 應退避，實際 ${n.length} 次`);
});

test('429：遵守 Retry-After，期間不再送 next', async () => {
  const D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), queue: [T('r1')], upcoming: { items: [T('r1', { kind: 'request', pos: 1 })], playlist_index: 0 } });
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 429, headers: { 'Retry-After': '30' }, body: { error: 'Rate exceeded.' } } : null });
  console.log(`  429 ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.equal(n.length, 1, `Retry-After 30 秒內只該送 1 次，實際 ${n.length} 次`);
});

test('409：別台接手播放後，這台停止自動換歌', async () => {
  let D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), queue: [T('r1')], upcoming: { items: [T('r1', { kind: 'request', pos: 1 })], playlist_index: 0 } });
  const taken = { ...D, settings: { ...D.settings, player_device: 'dev-ipad' } };
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 409, body: { error: '這台不是播放裝置。' } } : (m === 'GET' && p === '/admin/orders/songs' && n0++ > 0 ? { status: 200, body: taken } : null) });
  console.log(`  409 ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.ok(n.length <= 2, `409 後應重新讀設定並停止，實際 ${n.length} 次`);
});

test('5xx：指數退避', async () => {
  const D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), upcoming: { items: [T('b', { kind: 'playlist', pos: 1 })], playlist_index: 1 } });
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 503, body: { error: 'unavailable' } } : null });
  console.log(`  503 ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.ok(n.length <= 3, `5xx 應指數退避，實際 ${n.length} 次`);
});

test('伺服器回應沒有進展（stale、條件仍成立）：不可原地狂打', async () => {
  const D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), upcoming: { items: [T('b', { kind: 'playlist', pos: 1 })], playlist_index: 1 } });
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 200, body: { ...structuredClone(D), stale: true } } : null });
  console.log(`  stale ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.ok(n.length <= 3, `沒進展應退避，實際 ${n.length} 次`);
});

test('登入過期（401）：回登入頁後不再自動換歌', async () => {
  const D = base({ now: T('pl_a', { kind: 'playlist', playlist_index: 0 }), upcoming: { items: [T('b', { kind: 'playlist', pos: 1 })], playlist_index: 1 } });
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 401, body: { error: '請先登入。' } } : null });
  console.log(`  401 ${WINDOW_MS / 1000}s 內 next 次數：${n.length}`);
  assert.ok(n.length <= 1, `401 後應停止，實際 ${n.length} 次`);
});

test('伺服器 per-client 限流：同一登入者＋裝置每分鐘 30 次，超過回 Retry-After；不同裝置分開算', async () => {
  const { createRequire } = await import('node:module');
  const K = createRequire(import.meta.url)('../lib/ktv.js');
  let t = 1_000_000; const lim = K.clientLimiter({ max: 30, windowMs: 60_000, now: () => t });
  for (let i = 0; i < 30; i++) assert.equal(lim('u1|dev-mac').ok, true, '第 ' + (i + 1) + ' 次');
  const r = lim('u1|dev-mac'); assert.equal(r.ok, false); assert.equal(r.retryAfter, 60);
  assert.equal(lim('u1|dev-ipad').ok, true, '另一台裝置不受影響');
  t += 60_000; assert.equal(lim('u1|dev-mac').ok, true, '視窗過了恢復');
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /app\.post\('\/api\/admin\/orders\/songs\/next',auth,adminOnly,\(req,res,next\)=>\{[^]*?songNextLimit\(who\)[^]*?Retry-After/, 'songs/next 掛上 per-client 限流');
});

test('正常：播完換歌照常（最小間隔不影響正常換歌）', async () => {
  const D = base({ now: null, upcoming: { items: [T('a', { kind: 'playlist', pos: 1 })], playlist_index: 0 } });
  const after = base({ now: T('pl_1', { kind: 'playlist', playlist_index: 0 }), upcoming: { items: [T('b', { kind: 'playlist', pos: 1 })], playlist_index: 0 } });
  const n = await run({ D, route: (m, p) => p === '/admin/orders/songs/next' ? { status: 200, body: after } : (m === 'GET' && p === '/admin/orders/songs' ? { status: 200, body: D.__done ? after : D } : null) });
  assert.ok(n.length >= 1, '沒在播、有接下來 → 要換歌');
  assert.equal(n[0].body.result, 'ended');
});
