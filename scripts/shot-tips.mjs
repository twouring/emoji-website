// 打賞截圖（不碰 DB）：桌邊 /order 打賞卡片、打賞面板（金額＋音效）、送出後帳單；POS「設定 → 打賞」統計與支付、打賞通知。
// 用法：node scripts/shot-tips.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/tips-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-01T12:30:00Z');
const kinds = require('../lib/service-calls.js').KINDS;
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'BAR', cat: 'FOOD', zh: '炸雞', en: 'Fried chicken', price: 220, published: true }, { id: 'm2', venue: 'BAR', cat: 'FOOD', zh: '薯條', en: 'Fries', price: 150, published: true }] });
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [], orders: [], total_unpaid: 0, pay_request: null };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const tipsLib = require('../lib/tips.js');
const tipSettings = { enabled: true, performer: '今晚駐唱 小安', presets: [100, 200, 500], max: 10000 };
const tipLine = { ...tipsLib.tipLine({ amount: 300, sfx: 'cheer', performer: '今晚駐唱 小安', venue: 'BAR', guest: 'abcdefgh12', by: '小明' }) };
const tipStats = { settings: tipSettings, sounds: tipsLib.SOUNDS, pay_methods: tipsLib.PAY_METHODS, pending_unpaid_bills: 300, from: '2026-10-26', to: '2026-11-01', total: 4280, count: 17, paid: 2000, unpaid: 3480,
  by_performer: [{ performer: '今晚駐唱 小安', amount: 3280, count: 13, paid: 2000, unpaid: 2480 }, { performer: '萬聖節 DJ Moji', amount: 1000, count: 4, paid: 0, unpaid: 1000 }],
  tips: [{ order_id: 'o1', table: 'A3', paid_at: new Date(NOW - 3600e3).toISOString(), amount: 500, performer: '今晚駐唱 小安', by: 'Amy', sfx: 'applause-big' }, { order_id: 'o2', table: 'B1', paid_at: new Date(NOW - 7200e3).toISOString(), amount: 168, performer: '今晚駐唱 小安', by: '小明', sfx: 'kiss' }],
  payouts: [{ id: 'p1', performer: '今晚駐唱 小安', amount: 2000, method: 'cash', note: '10/31 萬聖節場', by: 'KK', at: new Date(NOW - 86400e3).toISOString() }] };
let tipEvents = [];
let tipPending = [{ id: 'tp_p1', table: 'A3', by: '小明', amount: 300, sfx: 'cheer', performer: '今晚駐唱 小安', at: new Date(NOW - 20e3).toISOString() }, { id: 'tp_p2', table: 'B1', by: 'Amy', amount: 1000, sfx: 'applause-big', performer: '今晚駐唱 小安', at: new Date(NOW - 5e3).toISOString() }];
let guestTipped = false;
const pending = [];
let guestCalls = { kinds: Object.entries(kinds).map(([id, v]) => ({ id, ...v })), open: [], recent_done: [], cooldown: 0 };
function api(u, method) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/admin/orders/service-calls') return { pending, kinds };
  if (p === '/api/service-calls') return { kinds: [], open: [], recent_done: [], cooldown: 0 };
  if (p === '/api/tips') { if (method === 'POST') { guestTipped = true; return { ok: true, status: 'pending', amount: 300, sfx: 'cheer' }; } return { ...tipsLib.publicView(tipSettings), requests: guestTipped ? [{ id: 'tp_p1', status: 'pending', amount: 300, sfx: 'cheer', at: new Date(NOW).toISOString() }] : [] }; }
  if (p === '/api/admin/orders/tips/events') return { pending: tipPending, events: tipEvents };
  if (p === '/api/admin/orders/tips') return tipStats;
  if (p === '/api/admin/orders/songs') return { settings: require('../lib/songs.js').normalizeSettings(''), now: null, queue: [], upcoming: { items: [] }, history: [], youtube: { connected: false } };
  if (p === '/api/orders/table' || p.startsWith('/api/orders/ts_')) return session;
  if (p === '/api/orders/config') return { tappay: null, vapid_public_key: null };
  if (p === '/api/orders/pause') return { venue: 'BAR', paused: null };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p === '/api/songs') return { enabled: true, price: 10, max_per_table: 3, max_minutes: 10, now: null, queue: [] };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { BAR: { opened_at: 'x' } }, wait: {}, active_venue: 'BAR' };
  if (p.startsWith('/api/admin/orders')) return { sessions: [], orders: [], tables: [] };
  return {};
}
const FONT = ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/workspace/local/.fonts/NotoSansTC-Regular.otf'].find(f => fs.existsSync(f));
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { mobile = false, act = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdefgh12'); localStorage.setItem('order_lang', 'zh');
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
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
  await new Promise(r => setTimeout(r, 500));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 500));
  const m = await page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const rect = s => { const el = document.querySelector(s); if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: el.innerText.replace(/\s+/g, ' ').slice(0, 160) }; };
    const small = [...document.querySelectorAll('#tip button, #tip input, #tip-open, #tips-body button, #tips-body input, #tips-body select, #tip-req button')].filter(vis).filter(b => { const r = b.getBoundingClientRect(); return r.height < 38 || r.width < 38; }).length;
    return { overflow: document.documentElement.scrollWidth - innerWidth, tipOpen: rect('#tip-open'), sheet: rect('#tip.on .in'), sfxBtns: document.querySelectorAll('#tip-sfx button').length, send: rect('#tip-send'), pop: rect('#tip-pop .tip-pop-card'), req: rect('#tip-req'), cardSt: rect('#tip-card-st'), kpis: rect('.tip-kpis'), payform: rect('#tip-payform'), smallButtons: small };
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const order = 'https://pos.test/order?s=ts_0000000000000001&k=k';
for (const w of [390, 320]) {
  await shot(order, w, 760, `order-${w}-card`, { mobile: true, act: async p => { await p.evaluate(() => document.getElementById('tip-open').scrollIntoView({ block: 'center' })); } });
  await shot(order, w, 760, `order-${w}-sheet`, { mobile: true, act: async p => { await p.evaluate(() => document.getElementById('tip-open').click()); await new Promise(r => setTimeout(r, 400)); await p.evaluate(() => document.querySelector('[data-tip-amt="200"]').click()); await p.evaluate(() => document.querySelector('[data-tip-sfx=cheer]').click()); } });
  await shot(order, w, 760, `order-${w}-custom`, { mobile: true, act: async p => { await p.evaluate(() => document.getElementById('tip-open').click()); await new Promise(r => setTimeout(r, 400)); await p.type('#tip-amt', '168'); await p.evaluate(() => document.querySelector('[data-tip-sfx=kiss]').click()); await p.evaluate(() => { const s = document.querySelector('#tip .sheet-body'); s.scrollTop = s.scrollHeight; }); } });
  await shot(order, w, 760, `order-${w}-bad`, { mobile: true, act: async p => { await p.evaluate(() => document.getElementById('tip-open').click()); await new Promise(r => setTimeout(r, 400)); await p.type('#tip-amt', '0'); await p.evaluate(() => document.getElementById('tip-send').click()); } });
  await shot(order, w, 760, `order-${w}-sent`, { mobile: true, act: async p => { p.on('dialog', d => d.accept()); await p.evaluate(() => document.getElementById('tip-open').click()); await new Promise(r => setTimeout(r, 400)); await p.type('#tip-amt', '300'); await p.evaluate(() => document.getElementById('tip-send').click()); await new Promise(r => setTimeout(r, 800)); await p.evaluate(() => document.getElementById('tip-open').scrollIntoView({ block: 'center' })); } });
}
await shot('https://pos.test/pos/tips', 1180, 1100, 'pos-tips-1180');
await shot('https://pos.test/pos/tips', 390, 1400, 'pos-tips-390', { mobile: true });
await shot('https://pos.test/pos/settings', 1180, 820, 'pos-settings-1180');
await shot('https://pos.test/pos', 1180, 820, 'pos-tip-pop', { act: async p => { tipEvents = [{ id: 'tp_x', table: 'A3', by: '小明', amount: 300, sfx: 'cheer', performer: '今晚駐唱 小安', at: new Date(NOW).toISOString() }]; await new Promise(r => setTimeout(r, 5800)); } });
await browser.close();
