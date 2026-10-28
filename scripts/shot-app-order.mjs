// 點餐收進 App 截圖（不碰 DB）：app 網域 /order 的「加到主畫面」卡＋iOS 步驟、會員 App 首頁「掃碼點餐」鍵。
// 用法：node scripts/shot-app-order.mjs <輸出目錄>
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
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { act = null, full = false, file = null } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent(IOS_UA);
  await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_token', 'tok'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefabcdef1234'); localStorage.setItem('order_lang', 'zh'); localStorage.setItem('m_lang', 'zh'); localStorage.removeItem('order_inst_x');
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'app.emoji.tw') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = u.pathname === '/' ? 'm.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 600));
  const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
    install: (() => { const c = document.querySelector('#install-card'); return c && !c.hidden ? c.innerText.replace(/\s+/g, ' ') : null; })(),
    sheet: document.querySelector('#inst.on')?.innerText.replace(/\s+/g, ' ') || null,
    member: document.querySelector('#member-card')?.innerText.replace(/\s+/g, ' ').slice(0, 80) || null,
    instRow: (() => { const b = [...document.querySelectorAll('#install-card .btn')].map(x => x.getBoundingClientRect()); return b.length === 2 ? Math.abs(b[0].top - b[1].top) : null; })(), okW: document.querySelector('#inst.on #inst-ok')?.getBoundingClientRect().width || null,
    orderScan: document.querySelector('#order-scan')?.innerText || null, manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') || null }));
  if (file) { const el = await page.$(file); if (el) { await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 200)); } }
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const order = 'https://app.emoji.tw/order?s=ts_0000000000000001&k=k';
for (const w of [390, 320]) {
  await shot(order, w, 800, `order-${w}-install`, { file: '#install-card' });
  await shot(order, w, 800, `order-${w}-ios-steps`, { act: p => p.evaluate(() => document.querySelector('#inst-go').click()) });
  await shot('https://app.emoji.tw/', w, 800, `app-${w}-home`);
}
await browser.close();
