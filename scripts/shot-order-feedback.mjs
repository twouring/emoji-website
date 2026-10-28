// 意見回饋截圖（不碰 DB）：桌邊 /order 菜單底部回饋卡、填寫面板（中／英）、送出後；POS「設定 → 回饋」。
// 用法：node scripts/shot-order-feedback.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/feedback-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-01T12:30:00Z');
const kinds = require('../lib/service-calls.js').KINDS;
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'BAR', cat: 'FOOD', zh: '炸雞', en: 'Fried chicken', price: 220, published: true }, { id: 'm2', venue: 'BAR', cat: 'FOOD', zh: '薯條', en: 'Fries', price: 150, published: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [], orders: [], total_unpaid: 0, pay_request: null };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const pending = [
  { id: 'sc_1', table: 'B2', kind: 'water', note: '', by: 'Amy', at: new Date(NOW - 4 * 60e3).toISOString() },
  { id: 'sc_2', table: 'A3', kind: 'other', note: '想要兒童椅', by: '小明', at: new Date(NOW - 30e3).toISOString() },
  { id: 'sc_3', table: 'C1', kind: 'pack', note: '', by: '', at: new Date(NOW - 90e3).toISOString() },
];
let guestCalls = { kinds: Object.entries(kinds).map(([id, v]) => ({ id, ...v })), open: [], recent_done: [], cooldown: 0 };
function api(u, method) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/admin/orders/service-calls') return { pending: [], kinds };
  if (p === '/api/order-feedback') return { ok: true, id: 'fb_1' };
  if (p === '/api/admin/orders/feedback') return { count: 3, avg_rating: 4, kinds: require('../lib/order-feedback.js').KINDS, feedback: [
    { id: 'fb_1', table_no: 'A3', kind: 'app', rating: 3, text: '點餐頁的按鈕有點小，加點時找不到已點清單在哪。\n希望字可以大一點。', name: '小明', lang: 'zh', created_at: new Date(NOW - 600e3).toISOString() },
    { id: 'fb_2', table_no: 'B2', kind: 'food', rating: 5, text: 'The fried chicken was amazing!', name: 'Amy', lang: 'en', created_at: new Date(NOW - 3600e3).toISOString() },
    { id: 'fb_3', table_no: 'C1', kind: 'service', rating: null, text: '店員很親切', name: '', lang: 'zh', created_at: new Date(NOW - 86400e3).toISOString() }] };
  if (p === '/api/service-calls') { if (method === 'POST') { guestCalls = { ...guestCalls, open: [{ id: 'sc_9', kind: 'water', note: '', at: new Date(NOW).toISOString() }], cooldown: 60 }; return { ok: true }; } return guestCalls; }
  if (p === '/api/orders/table' || p.startsWith('/api/orders/ts_')) return session;
  if (p === '/api/orders/config') return { tappay: null, vapid_public_key: null };
  if (p === '/api/orders/pause') return { venue: 'BAR', paused: null };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p === '/api/songs') return { enabled: false };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { BAR: { opened_at: 'x' } }, wait: {}, active_venue: 'BAR' };
  if (p.startsWith('/api/admin/orders')) return { sessions: [], orders: [], tables: [] };
  return {};
}
const FONT = ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/workspace/local/.fonts/NotoSansTC-Regular.otf'].find(f => fs.existsSync(f));
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { mobile = false, act = null, lang = 'zh' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((n, lang) => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefgh12'); localStorage.setItem('order_lang', lang);
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, lang);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method())) });
    const f = u.pathname === '/pos' || u.pathname.startsWith('/pos/') ? 'pos.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 500));
  const m = await page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const rect = s => { const el = document.querySelector(s); if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: el.innerText.replace(/\s+/g, ' ').slice(0, 120) }; };
    const small = [...document.querySelectorAll('#fb button, #fb-open')].filter(vis).filter(b => { const r = b.getBoundingClientRect(); return r.height < 38 || r.width < 38; }).length;
    return { overflow: document.documentElement.scrollWidth - innerWidth, card: rect('#fb-open'), sheet: rect('#fb.on .in'), toast: rect('#toast'), fbBody: rect('#fb-body'), smallButtons: small };
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const order = 'https://pos.test/order?s=ts_0000000000000001&k=k';
const toCard = async p => { await p.evaluate(() => document.querySelector('#fb-open').scrollIntoView({ block: 'center' })); };
const fill = async p => { await toCard(p); await p.click('#fb-open'); await new Promise(r => setTimeout(r, 300)); await p.click('[data-fb-kind=app]'); await p.click('[data-fb-rate="4"]'); await p.type('#fb-text', '加點時找不到已點清單，按鈕可以再大一點'); };
for (const w of [390, 320]) {
  await shot(order, w, 760, `order-${w}-card`, { mobile: true, act: toCard });
  await shot(order, w, 760, `order-${w}-sheet`, { mobile: true, act: fill });
  await shot(order, w, 760, `order-${w}-sent`, { mobile: true, act: async p => { await fill(p); await p.click('#fb-send'); await new Promise(r => setTimeout(r, 400)); } });
}
await shot(order, 390, 760, 'order-390-sheet-en', { mobile: true, lang: 'en', act: fill });
await shot('https://pos.test/pos/feedback', 1180, 820, 'pos-1180');
await shot('https://pos.test/pos/feedback', 390, 844, 'pos-390', { mobile: true });
await browser.close();
