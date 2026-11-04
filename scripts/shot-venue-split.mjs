// 分店主色截圖（KK 11/4）：atcafe／3am.emoji.tw/order 點餐頁、pos.emoji.tw/atcafe、/3am。用法：node scripts/shot-venue-split.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/app-order-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-01T04:30:00Z'); // 台北 12:30，在咖啡供應中
const menuDoc = JSON.stringify({ version: 1, items: [
  { id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鮭魚貝果', en: 'Salmon bagel', price: 220, emo: 190, points: 0, published: true },
  { id: 'm2', venue: 'CAFE', cat: 'DRINK', zh: '美式咖啡', en: 'Americano', price: 120, points: 12, published: true },
  { id: 'm3', venue: 'CAFE', cat: 'DESSERT', zh: '巴斯克乳酪蛋糕', en: 'Basque cheesecake', price: 160, points: 60, published: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [], orders: [], total_unpaid: 0, pay_request: null };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const posSession = { id: 'ts_0000000000000001', table: 'A3', unpaid: 1, unpaid_amount: 120, state: 'ordering', lines: [{ line: 'l1', item_id: 'm2', venue: 'CAFE', zh: '美式咖啡', price: 120, qty: 1, by: '小明' }], pay_requests: [],
  members: [{ id: 'u_a', name: '小明', at: '' }, { id: 'u_b', name: 'Amy Chen', at: '' }] };
let LOGGED = false;
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return u.searchParams.get('view') === 'member' ? memberState : state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/orders/table/member') return { ok: true, table: 'A3', member: { id: 'u_a', name: '小明' }, balance: 30, active: true };
  if (p === '/api/auth/methods') return { line: true };
  if (p === '/api/orders/table' || p.startsWith('/api/orders/ts_')) return session;
  if (p === '/api/orders/config') return { tappay: null };
  if (p === '/api/orders/pause') return { venue: 'CAFE', paused: null };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p === '/api/songs') return { enabled: false };
  if (p === '/api/service-calls') return { kinds: [], open: [], recent_done: [], cooldown: 0 };
  if (p === '/api/admin/yan/lookup') return { ok: true, member: { id: 'u_a', name: '小明', phone: '' }, balance: 30, active: true, verified: true };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/orders/service-calls')) return { pending: [] };
  if (p === '/api/admin/orders') return { sessions: [posSession], orders: [], tickets: [], tables: [] };
  if (p.startsWith('/api/admin/orders')) return { sessions: [], orders: [], tables: [] };
  return {};
}
const memberState = { me: { id: 'u_a', name: '小明', email: 'a@x' }, yan: { balance: 30, phone: '' }, rewards: { items: [], space: [] }, events: [], updates: [], access: {}, commitments: [], reservations: [], pickups: [], pickupMeta: { dates: [], slots: {} }, registrations: [] };

const NOW_BAR = Date.parse('2026-11-01T12:30:00Z'); // 台北 20:30
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, now) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_token', 'tok'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefabcdef1234'); localStorage.setItem('order_lang', 'zh'); localStorage.setItem('order_inst_x', String(n));
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, now);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (!/emoji\.tw$/.test(u.hostname)) return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = u.pathname === '/order' ? 'order.html' : /^\/(pos|atcafe|3am)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  const m = await page.evaluate(() => ({ venue: document.documentElement.dataset.venue || '', title: document.title, overflow: document.documentElement.scrollWidth - innerWidth,
    top: getComputedStyle(document.querySelector('.top, .p-top')).backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent') || getComputedStyle(document.documentElement).getPropertyValue('--yellow'),
    brand: (document.querySelector('#brand, .p-brand b') || {}).textContent, path: location.pathname, scope: document.querySelector('#p-scope')?.innerText || '',
    navOn: (e => e ? getComputedStyle(e).color + ' on ' + getComputedStyle(e).backgroundColor : null)(document.querySelector('.p-nav button[aria-pressed=true]')),
    solid: [...document.querySelectorAll('.btn--solid')].slice(0, 2).map(e => e.textContent.trim().slice(0, 6) + ':' + getComputedStyle(e).color + ' on ' + getComputedStyle(e).backgroundColor) }));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const Q = '/order?s=ts_0000000000000001&k=kkkkkkkkkkkkkkkk';
await shot('https://atcafe.emoji.tw' + Q, 390, 844, 'order-atcafe-390', NOW);
await shot('https://3am.emoji.tw' + Q, 390, 844, 'order-3am-390', NOW_BAR);
await shot('https://atcafe.emoji.tw' + Q, 320, 640, 'order-atcafe-320', NOW);
await shot('https://pos.emoji.tw/atcafe', 1180, 820, 'pos-atcafe-1180', NOW);
await shot('https://pos.emoji.tw/3am', 1180, 820, 'pos-3am-1180', NOW_BAR);
await shot('https://pos.emoji.tw/3am', 390, 844, 'pos-3am-390', NOW_BAR);
await shot('https://pos.emoji.tw/pos', 1180, 820, 'pos-all-1180', NOW);
await browser.close();
