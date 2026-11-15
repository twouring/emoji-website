// 桌邊點餐入口低消（KK 11/15）：入場說明大字＋菜單頂端黃色低消列。不碰 DB。
// 用法：node scripts/shot-order-minspend.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/order-minspend-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
let NOW = Date.parse('2026-11-15T04:30:00Z');
const menuDoc = JSON.stringify({ version: 1, items: [
  { id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鮭魚貝果', en: 'Salmon bagel', price: 220, emo: 190, points: 0, published: true },
  { id: 'm2', venue: 'CAFE', cat: 'DRINK', zh: '美式咖啡', en: 'Americano', price: 120, points: 12, published: true },
  { id: 'm3', venue: 'CAFE', cat: 'DESSERT', zh: '巴斯克乳酪蛋糕', en: 'Basque cheesecake', price: 160, points: 60, published: true },
  { id: 'b1', venue: 'BAR', cat: 'DRINK', zh: '琴通寧', en: 'Gin tonic', price: 320, points: 0, published: true, alcohol: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [], orders: [], total_unpaid: 0, pay_request: null, need_party: false, k: 'kkkkkkkkkkkkkkkk', fixed: true };
let POSTED = null;
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const posSession = { id: 'ts_0000000000000001', table: 'A3', unpaid: 1, unpaid_amount: 120, state: 'ordering', lines: [{ line: 'l1', item_id: 'm2', venue: 'CAFE', zh: '美式咖啡', price: 120, qty: 1, by: '小明' }], pay_requests: [],
  members: [{ id: 'u_a', name: '小明', at: '' }, { id: 'u_b', name: 'Amy Chen', at: '' }] };
let LOGGED = false;
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return u.searchParams.get('view') === 'member' ? memberState : state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/orders/party') { POSTED = true; session.need_party = false; return { ok: true }; }
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
  await page.evaluateOnNewDocument(([n, LG]) => { globalThis.__LG = LG; Object.keys(localStorage).filter(k => k.startsWith('tth_policy_')).forEach(k => localStorage.removeItem(k)); localStorage.setItem('tth_token', 'tok'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefabcdef1234'); localStorage.setItem('order_lang', globalThis.__LG || 'zh'); localStorage.setItem('m_lang', 'zh'); localStorage.removeItem('order_inst_x');
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, [NOW, globalThis.LG || 'zh']);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'app.emoji.tw') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = u.pathname === '/' ? 'm.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  if (globalThis.LG) await page.evaluateOnNewDocument(l => { globalThis.__LG = l; }, globalThis.LG);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 600));
  const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
    policy: document.querySelector('#policy').classList.contains('hidden') ? null : document.querySelector('#policy').innerText.replace(/\s+/g, ' '),
    minBar: document.querySelector('#min-bar').hidden ? null : document.querySelector('#min-bar').innerText.replace(/\s+/g, ' '),
    policyOver: (() => { const el = document.querySelector('#policy'); if (el.classList.contains('hidden')) return null; return [...el.querySelectorAll('*')].reduce((m, e) => Math.max(m, Math.round(e.getBoundingClientRect().right - document.documentElement.clientWidth)), -999); })(), vw: [innerWidth, document.documentElement.clientWidth, document.querySelector('#policy .in').getBoundingClientRect().width, document.querySelector('#policy').scrollWidth],
    widest: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 321 && e.getBoundingClientRect().width>0).slice(-4).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right) + ':' + (e.innerText||'').slice(0,30)),
    minBarTop: Math.round(document.querySelector('#min-bar').getBoundingClientRect().top) }));
  if (file) { const el = await page.$(file); if (el) { await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 200)); } }
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const fixed = 'https://app.emoji.tw/order?t=A3&k=xxxxxxxxxxxxxxxx';
const cases = [['cafe-sun', '2026-11-15T04:30:00Z'], ['cafe-mon', '2026-11-16T04:30:00Z'], ['bar-fri', '2026-11-13T13:30:00Z'], ['bar-sun', '2026-11-15T13:30:00Z']];
for (const [tag, t] of cases) {
  NOW = Date.parse(t);
  for (const [w, lg] of [[390, 'zh'], [320, 'en'], [320, 'ja'], [390, 'ko']]) {
    globalThis.LG = lg;
    await shot(fixed, w, 800, `${tag}-${w}-${lg}-entry`);
    if (lg === 'zh' || lg === 'en') await shot(fixed, w, 800, `${tag}-${w}-${lg}-menu`, { act: async p => { await p.evaluate(() => document.querySelector('#policy-ok').click()); } });
  }
}
await browser.close();
