// KTV（ktv.emoji.tw）頁面截圖＋量測：假 API、不碰 DB。node scripts/shot-ktv.mjs <輸出目錄>
// 印出每頁 scrollWidth 溢出、<44px 觸控目標、黃色（#FFDE34）元素數、pageerror。
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2] || '/tmp/ktv-shots'; fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), PUB = path.join(ROOT, 'public');
const FONTS = { 'Noto Sans TC': '/workspace/local/fonts/NotoSansTC.ttf', 'Noto Serif TC': '/workspace/local/fonts_dl/NotoSerifTC%5Bwght%5D.ttf', 'Cormorant Garamond': '/workspace/local/fonts_dl/CormorantGaramond%5Bwght%5D.ttf' };
const fontCss = Object.entries(FONTS).map(([f, p]) => `@font-face{font-family:"${f}";src:url(/__font/${encodeURIComponent(f)}) format("truetype");font-weight:100 900}`).join('');
const id = n => ('vid' + n).padEnd(11, 'x');
const tr = (n, title, ex = {}) => ({ video_id: id(n), title, channel: '歌手 ' + n, thumb: '', duration: 240, ...ex });
const queue = [tr(1, '晴天', { id: 'sr1', source: 'guest', table: 'A3', by: '小明', price: 10 }), tr(2, '告白氣球（Live 版）', { id: 'sr2', source: 'pos' }), tr(3, '家後', { id: 'sr3', source: 'guest', table: 'B1', by: 'Mia', price: 10 })];
const D = { settings: { enabled: true, price: 10, max_per_table: 3, max_minutes: 10, shuffle: true, player_device: process.env.ME ? 'ktv-me' : 'ktv-tv', playlist: [tr(7, '店內歌單一'), tr(8, '店內歌單二')], schedules: [{ name: '平日午後', days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', playlist: [tr(9, 'x')] }, { name: '週末深夜', days: [5, 6], start: '21:00', end: '02:30', playlist: [tr(10, 'y'), tr(11, 'z')] }] },
  now: { ...tr(5, '小幸運（電影《我的少女時代》主題曲）超長的歌名測試會不會換行而不是被截斷'), id: 'sr0', kind: 'request', source: 'guest', table: 'A1', by: '阿德' }, queue,
  upcoming: { items: queue.map((t, i) => ({ ...t, kind: 'request', pos: i + 1 })).concat([{ ...tr(7, '店內歌單一'), kind: 'playlist', pos: 4 }, { ...tr(8, '店內歌單二'), kind: 'playlist', pos: 5 }]), shuffle: true, playlist_count: 2, playlist_name: '平日午後' },
  history: [{ ...tr(6, '稻香'), kind: 'request', result: 'ended' }],
  song_tickets: { tables: [{ session_id: 'ts_b2', table: 'B2', unissued: 2 }], tickets: [{ id: 'kt_aaaaaaaaaaaa', code: '482913', table: 'A3', left: 2, total: 3, at: '2026-11-06T12:00:00Z', expires_at: '2026-11-06T18:00:00Z' }] },
  device_url: 'https://ktv.emoji.tw/s?d=Ab3dEf7hJk', youtube: { connected: true, channel: { title: '言文字 emoji' }, connected_by: 'kk@emoji.tw', oauth_ready: true, api_key: true } };
const LIVE = { online: true, seq: 3, device: 'ktv-tv', name: '電視畫面', mode: 'tv', state: 'playing', pos: 83, dur: 262, vol: 70, muted: false, video_id: id(5) };
const DISC = { popular: [tr(1, '晴天', { count: 12 }), tr(4, '倔強', { count: 7 })], recent: [tr(1, '晴天')], chart: [] };
const STATS = { from: '2026-10-30', to: '2026-11-05', count: 46, amount: 460, days: [{ day: '2026-11-01', count: 12, amount: 120 }, { day: '2026-11-02', count: 20, amount: 200 }, { day: '2026-11-05', count: 14, amount: 140 }], tables: [{ table: 'A3', count: 9, amount: 90 }, { table: 'B1', count: 5, amount: 50 }], songs: [{ video_id: id(1), title: '晴天', count: 8 }, { video_id: id(4), title: '倔強', count: 4 }], popular: DISC.popular };
const TICKET = { table: 'A3', left: 2, total: 3, expires_at: '2026-11-06T18:00:00Z', enabled: true, price: 10, max_minutes: 10, now: D.now, queue: queue.map(q => ({ ...q, mine: q.table === 'A3' })) };
const DEVICE = { enabled: true, price: 10, max_minutes: 10, now: D.now, queue: queue.map(q => ({ ...q })) };
const API = { '/api/ktv/device': DEVICE, '/api/ktv/ticket': TICKET, '/api/ktv/discover': DISC, '/api/state': { role: 'admin', me: { email: 'kk@emoji.tw' } }, '/api/admin/orders/songs': D, '/api/admin/orders/songs/live': LIVE, '/api/admin/orders/songs/discover': DISC, '/api/admin/orders/songs/stats': STATS };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'] });
const shots = [['console', '/', 1280, 800], ['console-ipad', '/', 1180, 820], ['console-390', '/', 390, 844], ['remote-390', '/remote', 390, 844], ['remote-320', '/remote', 320, 640], ['playlists', '/playlists', 1180, 820], ['playlists-390', '/playlists', 390, 844], ['stats', '/stats', 1180, 820], ['stats-390', '/stats', 390, 844], ['settings', '/settings', 1180, 820], ['tv', '/tv', 1920, 1080], ['tv-portrait', '/tv', 820, 1180], ['login-390', '/', 390, 844, true], ['redeem-390', '/s?d=Ab3dEf7hJk', 390, 844, true], ['guest-390', '/s?d=Ab3dEf7hJk#code', 390, 844, true], ['guest-320', '/s?d=Ab3dEf7hJk#code', 320, 640, true], ['console-code', '/#bigcode', 1280, 800]];
for (const [name, url, w, h, anon] of shots) {
  const page = await browser.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname === 'fonts.googleapis.com') return req.respond({ status: 200, contentType: 'text/css', body: fontCss });
    if (u.pathname.startsWith('/__font/')) return req.respond({ status: 200, contentType: 'font/ttf', body: fs.readFileSync(FONTS[decodeURIComponent(u.pathname.slice(8))]) });
    if (u.hostname !== 'ktv.test') return req.respond({ status: 204, body: '' });   // YouTube、i.ytimg 等外部請求不連
    const key = u.pathname.replace(/\/$/, '') || '/';
    if (API[key]) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(API[key]) });
    if (key.startsWith('/api/')) return req.respond({ status: 200, contentType: 'application/json', body: '{}' });
    if (key === '/s') return req.respond({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(PUB, 'ktv-song.html'), 'utf8') });
    if (/^\/($|tv|remote|playlists|stats|settings)$/.test(key)) return req.respond({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(PUB, 'ktv.html'), 'utf8').replace(/<!--KTV_VERSION-->/g, '20261106-01') });
    const f = path.join(PUB, decodeURIComponent(key)); if (fs.existsSync(f)) return req.respond({ status: 200, contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream', body: fs.readFileSync(f) });
    req.respond({ status: 404, body: '' });
  });
  if (anon) await page.evaluateOnNewDocument(() => localStorage.clear());
  else await page.evaluateOnNewDocument(me => { localStorage.setItem('tth_ktv_token', 'x.y'); if (me) localStorage.setItem('tth_ktv_device', 'ktv-me'); }, !!process.env.ME);
  if (url.endsWith('#code')) await page.evaluateOnNewDocument(() => sessionStorage.setItem('ktv_code_Ab3dEf7hJk', '482913'));
  if (url.startsWith('/tv')) await page.evaluateOnNewDocument(dev => localStorage.setItem('tth_ktv_device', dev), D.settings.player_device);
  await page.goto('https://ktv.test' + url, { waitUntil: 'load' });
  if (url.endsWith('#bigcode')) { await new Promise(r => setTimeout(r, 1200)); await page.evaluate(() => document.querySelector('[data-k-showqr]')?.click()); }
  await new Promise(r => setTimeout(r, 1500));
  const m = await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [...document.querySelectorAll('button,a,input,select,summary')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 && !e.closest('.k-ver') && e.type !== 'range' && e.type !== 'checkbox'; }).map(e => (e.textContent || e.name || e.type).trim().slice(0, 16) + ':' + Math.round(e.getBoundingClientRect().height));
    const yellow = [...document.querySelectorAll('*')].filter(vis).filter(e => getComputedStyle(e).backgroundColor === 'rgb(255, 222, 52)').map(e => e.className || e.tagName);
    const tiny = [...document.querySelectorAll('body *')].filter(vis).filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.tagName + ':' + getComputedStyle(e).fontSize);
    return { over: document.documentElement.scrollWidth - innerWidth, small, yellow, tiny: tiny.slice(0, 5) };
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(name, JSON.stringify({ ...m, errs }));
  await page.close();
}
await browser.close();
