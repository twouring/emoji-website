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
const admin = { settings: { enabled: true, price: 10, max_per_table: 3, max_minutes: 10, shuffle: false, playlist, player_device: 'dev-1' },
  now: { ...T(9, '晴天', '周杰倫 Jay Chou', 269), kind: 'request', table: 'A3', by: '小明', source: 'guest', price: 10 },
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
  if (p === '/api/admin/orders/songs') return admin;
  if (p === '/api/admin/orders/songs/search' || p === '/api/songs/search') return search;
  if (p === '/api/songs') return guest;
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
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefgh12'); localStorage.setItem('order_lang', 'zh');
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
    const clipped = [...document.querySelectorAll('.song-row')].filter(vis).filter(r => r.scrollWidth > r.clientWidth + 1).length;
    return { nav: navSongs ? navSongs.textContent.trim() + (navSongs.querySelector('svg') ? '+icon' : '') : null, songCard: card ? (vis(card) ? card.innerText.replace(/\n/g, ' / ') : 'hidden') : null,
      panelText: panel && vis(panel) ? panel.innerText.replace(/\s+/g, ' ').slice(0, 420) : null, rowsClipped: clipped, smallControls: small.slice(0, 8) };
  });
  console.log(name, JSON.stringify(probe));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  console.log(name, 'overflow=' + overflow, errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
await shot('https://pos.test/pos/songs', 1280, 900, 'pos-songs-1280');
await shot('https://pos.test/pos/songs', 390, 844, 'pos-songs-390', { mobile: true });
const order = 'https://pos.test/order?s=ts_0000000000000001&k=0123456789abcdef';
await shot(order, 390, 844, 'order-menu-390', { mobile: true });
const openSongs = async page => { await page.click('#song-open'); await page.type('#song-q', '晴天'); await page.click('#song-go'); await new Promise(r => setTimeout(r, 400)); };
await shot(order, 390, 844, 'order-songs-390', { mobile: true, act: openSongs });
await shot(order, 320, 640, 'order-songs-320', { mobile: true, act: openSongs });
await browser.close();
