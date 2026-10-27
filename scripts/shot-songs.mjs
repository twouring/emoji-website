// 點歌畫面截圖（不碰 DB）：POS /pos/songs 與桌邊 /order 點歌卡片＋點歌面板，假 API。用法：node scripts/shot-songs.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/songs-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
const th = 'https://i.ytimg.com/vi/x/mqdefault.jpg';
const T = (i, title, ch, d, extra = {}) => ({ id: 'sr_' + i, video_id: ('v' + i).padEnd(11, 'x'), title, channel: ch, duration: d, thumb: '', ...extra });
const playlist = [T(1, 'Lo-fi Café Morning', 'Chill Beats', 214), T(2, 'Bossa Nova Afternoon', 'Jazz Lounge', 245), T(3, '夜晚的城市散步', 'City Pop TW', 198)];
const longT = '告白氣球 Love Confession（官方完整版 MV）- 周杰倫 Jay Chou【高音質 HD】';
const admin = { settings: { enabled: true, price: 10, max_per_table: 3, max_minutes: 10, shuffle: false, playlist, player_device: 'dev-1' },
  now: { ...T(9, longT, '周杰倫 Jay Chou', 269), kind: 'request', table: 'A3', by: '小明', source: 'guest', price: 10 },
  queue: [T(10, '小幸運', '田馥甄 Hebe', 265, { table: 'B1', by: 'Amy', source: 'guest', price: 10 }), T(11, 'Shape of You', 'Ed Sheeran', 263, { table: 'A3', by: '小明', source: 'guest', price: 10 }), T(12, '告白氣球', '周杰倫 Jay Chou', 215, { by: '櫃檯', source: 'pos' })],
  history: [{ ...playlist[0], kind: 'playlist', result: 'preempt' }], youtube: { connected: true, channel: { title: '言文字 emoji' }, connected_by: 'kk@emoji.tw', oauth_ready: true, api_key: false } };
const guest = { enabled: true, price: 10, max_per_table: 3, max_minutes: 10, now: { ...admin.now, mine: false }, queue: [{ ...admin.queue[0], mine: false }, { ...admin.queue[1], mine: true }, { ...admin.queue[2], table: '' }] };
const search = { items: [T(20, '晴天', '周杰倫 Jay Chou', 269), T(21, '晴天 Live', '周杰倫', 301), T(22, '晴天 鋼琴版', 'Piano Cover', 245)] };
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'BAR', cat: 'FOOD', zh: '炸雞', en: 'Fried chicken', price: 220, published: true }, { id: 'm2', venue: 'CAFE', cat: 'FOOD', zh: '三明治', en: 'Sandwich', price: 180, published: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [{ line: 'l1', item_id: 'song', cat: 'SONG', zh: '點歌｜晴天', en: 'Song | 晴天', price: 10, qty: 1, by: '小明', mine: true, placed_at: '2026-10-27T12:00:00Z', served_at: '2026-10-27T12:00:00Z' }], orders: [], total_unpaid: 10, pay_request: null };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/admin/orders/songs') return { ...admin, upcoming: { shuffle: false, playlist_count: playlist.length, items: [...admin.queue.map((t, i) => ({ ...t, kind: 'request', pos: i + 1 })), ...playlist.map((t, i) => ({ ...t, kind: 'playlist', pos: admin.queue.length + i + 1 }))] } };
  if (p === '/api/admin/orders/songs/next') return admin;
  if (p === '/api/admin/orders/songs/search' || p === '/api/songs/search') return search;
  if (p === '/api/songs') return guest;
  if (p === '/api/songs/discover' || p === '/api/admin/orders/songs/discover') return { popular: [{ ...T(30, '告白氣球 Love Confession（官方完整版 MV）- 周杰倫 Jay Chou', '周杰倫 Jay Chou', 215), count: 12 }, { ...T(31, '小幸運 A Little Happiness（電影《我的少女時代》主題曲）', '田馥甄 Hebe', 265), count: 8 }, { ...T(32, '晴天', '周杰倫', 269), count: 5 }], recent: [T(33, 'APT.', 'ROSÉ & Bruno Mars', 170)], chart: [T(34, '排行榜第一名歌曲 Official Music Video', 'Artist', 230), T(35, 'Chart #2', 'Artist 2', 200)] };
  if (p === '/api/payment-methods' || p === '/api/admin/payment-methods') return { payment_methods: [] };
  if (p === '/api/orders/table' || p.startsWith('/api/orders/ts_')) return session;
  if (p === '/api/orders/config') return { tappay: null, vapid_public_key: null };
  if (p === '/api/orders/pause') return { venue: 'BAR', paused: null };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: {}, wait: {}, active_venue: 'BAR' };
  return {};
}
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { mobile = false, prep = null, act = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefgh12'); localStorage.setItem('order_lang', 'zh'); window.YT = { PlayerState: { ENDED: 0 }, Player: function (id) { const el = document.getElementById(id); if (el) el.outerHTML = '<iframe id="' + id + '" src="about:blank"></iframe>'; this.playVideo = () => {}; this.loadVideoById = () => {}; this.stopVideo = () => {}; this.destroy = () => {}; } };
    const R = Date; const fixed = new R('2026-11-01T12:30:00Z').getTime(); globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });   // 擋外部（YouTube、Google Fonts）
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    let f = u.pathname === '/pos' || u.pathname.startsWith('/pos/') ? 'pos.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 600));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const probe = await page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const small = [...document.querySelectorAll('button,input,select')].filter(vis).map(el => { const r = el.getBoundingClientRect(); return { t: (el.textContent || el.name || el.type).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 40);
    const navSongs = document.querySelector('#p-nav [data-tab=songs]');
    const panel = document.querySelector('#songs-body') || document.querySelector('#songs.on');
    const card = document.querySelector('#song-open');
    const titles = [...document.querySelectorAll('.song-meta b,.song-row .n b,.song-now-main b,.song-now .n b')].filter(vis).map(b => { const cs = getComputedStyle(b); return { lines: Math.round(b.getBoundingClientRect().height / parseFloat(cs.lineHeight)), nowrap: cs.whiteSpace === 'nowrap' }; });
    const clipped = [...document.querySelectorAll('.song-row')].filter(vis).filter(r => r.scrollWidth > r.clientWidth + 1).length;
    return { nav: navSongs ? navSongs.textContent.trim() + (navSongs.querySelector('svg') ? '+icon' : '') : null, songCard: card ? (vis(card) ? card.innerText.replace(/\n/g, ' / ') : 'hidden') : null,
      panelText: panel && vis(panel) ? panel.innerText.replace(/\s+/g, ' ').slice(0, 420) : null, rowsClipped: clipped, titleLines: titles.map(t => t.lines).join(','), nowrap: titles.filter(t => t.nowrap).length, tabs: [...document.querySelectorAll('.song-tabs [role=tab]')].map(b => b.textContent.trim()).join('|'), smallControls: small.slice(0, 8) };
  });
  console.log(name, JSON.stringify(probe));
  const extra = await page.evaluate(() => { const set = document.getElementById('set-songs-body'); const L = [...document.querySelectorAll('.song-meta b,.song-meta small,.song-row .n b,.song-now-main b,.song-now .n b,#song-dock-title,.song-who')].filter(b => b.offsetHeight).map(b => b.textContent.slice(0, 18) + '=' + Math.round(b.offsetHeight / parseFloat(getComputedStyle(b).lineHeight)) + 'L/' + (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1 ? 'CUT' : 'full') + '/' + getComputedStyle(b).whiteSpace + '/' + getComputedStyle(b).textOverflow); const q = document.getElementById('song-q-h'); const who = [...document.querySelectorAll('#songs-body .song-queue .song-who')].map(w => w.textContent); return { upcomingHead: q ? q.textContent : null, upcomingRows: document.querySelectorAll('#songs-body .song-queue > li').length, who: who.slice(0, 6), setSongs: set ? set.innerText.replace(/\s+/g, ' ').slice(0, 260) : 'NO-SECTION', lines: L.filter(x => /CUT|nowrap|ellipsis/.test(x)).slice(0, 12) }; });
  console.log(name, 'EXTRA', JSON.stringify(extra));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  console.log(name, 'overflow=' + overflow, errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
await shot('https://pos.test/pos/songs', 1280, 900, 'pos-songs-1280');
await shot('https://pos.test/pos/songs', 1180, 820, 'pos-songs-1180');
await shot('https://pos.test/pos/songs', 390, 844, 'pos-songs-390', { mobile: true });
// 播放器：拖移、縮到最小、重新整理後記得位置
// 點歌頁寬螢幕播放器自動縮成一條（把手隱藏），拖移在其他分頁測
await shot('https://pos.test/pos/orders', 1280, 900, 'pos-dock-drag-min', { act: async p => {
  await p.waitForSelector('#song-dock', { timeout: 4000 });
  const before = await p.evaluate(() => { const r = document.getElementById('song-dock').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.height)]; });
  const g = await p.$('[data-song-dock-grip]'); const b = await g.boundingBox();
  await p.mouse.move(b.x + 40, b.y + 20); await p.mouse.down(); await p.mouse.move(b.x - 600, b.y - 500, { steps: 8 }); await p.mouse.up();
  const moved = await p.evaluate(() => { const r = document.getElementById('song-dock').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  await p.click('[data-song-dock-min]');
  const min = await p.evaluate(() => { const d = document.getElementById('song-dock'), r = d.getBoundingClientRect(); return { cls: d.className, h: Math.round(r.height), title: document.getElementById('song-dock-title').textContent, titleCut: (t => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)(document.getElementById('song-dock-title')) }; });
  const bar = await (await p.$('.song-dock-bar')).boundingBox();
  await p.mouse.move(bar.x + 30, bar.y + bar.height / 2); await p.mouse.down(); await p.mouse.move(bar.x + 230, bar.y + 120, { steps: 6 }); await p.mouse.up();
  const moved2 = await p.evaluate(() => { const r = document.getElementById('song-dock').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#song-dock', { timeout: 4000 }); await new Promise(r => setTimeout(r, 300));
  const after = await p.evaluate(() => { const d = document.getElementById('song-dock'), r = d.getBoundingClientRect(); return { min: d.classList.contains('is-min'), pos: [Math.round(r.left), Math.round(r.top)] }; });
  console.log('DOCK', JSON.stringify({ before, moved, min, moved2, after }));
} });
await shot('https://pos.test/pos/settings', 1280, 900, 'pos-settings-songs-1280', { act: async p => { await new Promise(r => setTimeout(r, 500)); await p.evaluate(() => document.getElementById('set-songs')?.scrollIntoView()); } });
const order = 'https://pos.test/order?s=ts_0000000000000001&k=0123456789abcdef';
await shot(order, 390, 844, 'order-menu-390', { mobile: true });
const openSongs = async page => { await page.click('#song-open'); await new Promise(r => setTimeout(r, 400)); };
const searchSongs = async page => { await openSongs(page); await page.click('[data-song-view=search]'); await page.type('#song-q', '晴天'); await page.click('#song-go'); await new Promise(r => setTimeout(r, 400)); };
await shot(order, 390, 844, 'order-songs-390', { mobile: true, act: openSongs });
await shot(order, 320, 640, 'order-songs-320', { mobile: true, act: openSongs });
await shot(order, 390, 844, 'order-songs-search-390', { mobile: true, act: searchSongs });
await browser.close();
