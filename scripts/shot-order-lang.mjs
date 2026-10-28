// 桌邊點餐單一語系截圖（由 shot-order-member 改）（不碰 DB）：/order 未登入（Google／LINE 鈕）、已登入有效會籍（會員價＋可兌換清單）；POS 會員面板列出這桌已登入會員。
// 用法：node scripts/shot-order-member.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/order-member-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-01T04:30:00Z'); // 台北 12:30，在咖啡供應中
const menuDoc = JSON.stringify({ version: 1, items: [
  { id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鮭魚貝果', en: 'Salmon bagel', price: 220, emo: 190, points: 0, published: true, note: '酸種貝果夾燻鮭魚', note_ja: 'サーモンのベーグル', note_en: 'Sourdough bagel with smoked salmon', ja: 'サーモンベーグル' },
  { id: 'm2', venue: 'CAFE', cat: 'DRINK', zh: '美式咖啡', en: 'Americano', price: 120, points: 12, published: true },
  { id: 'm3', venue: 'CAFE', cat: 'DESSERT', zh: '巴斯克乳酪蛋糕', en: 'Basque cheesecake', price: 160, points: 60, published: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [], orders: [], total_unpaid: 0, pay_request: null };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const posSession = { id: 'ts_0000000000000001', table: 'A3', unpaid: 1, unpaid_amount: 120, state: 'ordering', lines: [{ line: 'l1', item_id: 'm2', venue: 'CAFE', zh: '美式咖啡', price: 120, qty: 1, by: '小明' }], pay_requests: [],
  members: [{ id: 'u_a', name: '小明', at: '' }, { id: 'u_b', name: 'Amy Chen', at: '' }] };
let LOGGED = false;
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return state;
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
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { lang = 'zh', mobile = false, login = false, act = null, full = false, noName = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(l => { globalThis.__L = l; }, lang);
  await page.evaluateOnNewDocument((n, login, noName) => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefabcdef1234'); localStorage.setItem('order_lang', globalThis.__L||'zh');
    if (login) localStorage.setItem('order_member_token', 'tok'); else localStorage.removeItem('order_member_token');
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } };     if (noName) localStorage.removeItem('order_name'); }, NOW, login, noName);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = u.pathname === '/pos' || u.pathname.startsWith('/pos/') ? 'pos.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 600));
  const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
    card: document.querySelector('#member-card')?.innerText.replace(/\s+/g, ' ').slice(0, 200) || null,
    memberPrice: [...document.querySelectorAll('.item .mp')].map(e => e.innerText),
    posMembers: [...document.querySelectorAll('[data-table-member]')].map(b => b.innerText),
    gate: (() => { const g = document.querySelector('#name-gate'); return g && !g.classList.contains('hidden') ? g.innerText.replace(/\s+/g, ' ').slice(0, 200) : null; })(), nameShown: document.querySelector('#name-display')?.innerText || '',
    menuText: [...document.querySelectorAll('.venue, .item .n')].map(e => e.innerText.replace(/\s+/g, ' ')).join(' / ').slice(0, 300), detail: document.querySelector('#detail-body')?.innerText.replace(/\s+/g, ' ').slice(0, 160) || null,
    posWho: document.querySelector('.pos-member-who')?.innerText.replace(/\s+/g, ' ') || null }));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const order = 'https://pos.test/order?s=ts_0000000000000001&k=k';
for (const lang of ['zh', 'en', 'ja']) {
  await shot(order, 390, 900, `lang-${lang}-menu`, { lang, mobile: true });
  await shot(order, 390, 900, `lang-${lang}-detail`, { lang, mobile: true, act: p => p.evaluate(() => document.querySelector('[data-open-item="m1"]')?.click()) });
}
await browser.close();
