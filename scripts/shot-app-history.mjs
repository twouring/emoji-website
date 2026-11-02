// 會員 App 商店截圖（不碰 DB）：首頁商店入口、商店頁（選商品）、預約分頁的商店訂單。
// 用法：node scripts/shot-app-shop.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/app-history-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-02T04:30:00Z'); // 台北 12:30
const menuDoc = JSON.stringify({ version: 1, items: [
  { id: 's1', venue: 'CAFE', cat: 'SHOP', zh: '牙刷牙膏組', en: 'Toothbrush & toothpaste', ja: '歯ブラシセット', price: 60, published: true, note: '單支包裝' },
  { id: 's2', venue: 'CAFE', cat: 'SHOP', zh: '毛巾', en: 'Face towel', ja: 'フェイスタオル', price: 150, published: true },
  { id: 's3', venue: 'CAFE', cat: 'SHOP', zh: '浴巾', en: 'Bath towel', ja: 'バスタオル', price: 350, published: true, stock_day: '2026-11-02', stock_left: 3 },
  { id: 's4', venue: 'CAFE', cat: 'SHOP', zh: '有線耳機', en: 'Wired earphones', ja: 'イヤホン', price: 290, published: true },
  { id: 's5', venue: 'CAFE', cat: 'SHOP', zh: '耳塞', en: 'Earplugs', ja: '耳栓', price: 30, published: true },
  { id: 'm2', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', price: 120, published: true }] });
const shopOrders = [{ id: 'ts_aaaaaaaaaaaaaaa1', table: 'W03', status: 'open', created_at: '2026-11-02T04:20:00Z', note: '', paid: false, amount: 410,
  items: [{ zh: '牙刷牙膏組', en: 'Toothbrush & toothpaste', qty: 1 }, { zh: '浴巾', en: 'Bath towel', qty: 1 }] }];
const memberState = { me: { id: 'u_a', name: '小明', email: 'a@x' }, events: [], updates: [], access: {}, commitments: [] };
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return memberState;
  if (p === '/api/me/yan') return { balance: 30, phone: '' };
  if (p === '/api/me/rewards') return { items: [], space: [] };
  if (p === '/api/me/reservations') return { reservations: [] };
  if (p === '/api/me/pickups') return { pickups: [], dates: [], slots: {} };
  if (p === '/api/me/registrations') return { registrations: [] };
  if (p === '/api/me/history') return HIST;
  if (p === '/api/me/shop') return { ok: true, orders: shopOrders, stripe: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  return {};
}

const HIST = { ok: true, balance: 128,
  orders: [
    { id: 'o1', at: '2026-11-02T11:20:00Z', venue: 'BAR', venue_zh: '三點水', amount: 660, void: false, online: false, earned: 66, redeemed: 70,
      items: [{ zh: '琴通寧', en: 'Gin Tonic', ja: 'ジントニック', qty: 2, price: 330 }, { zh: '淋浴（點數兌換）', en: 'Shower (points)', qty: 1, price: 0 }] },
    { id: 'o2', at: '2026-11-01T02:05:00Z', venue: 'CAFE', venue_zh: '在咖啡', amount: 410, void: false, online: true, earned: 41, redeemed: 0,
      items: [{ zh: '牙刷牙膏組', en: 'Toothbrush & toothpaste', qty: 1 }, { zh: '浴巾', en: 'Bath towel', qty: 1 }] },
    { id: 'o3', at: '2026-10-29T02:05:00Z', venue: 'CAFE', venue_zh: '在咖啡', amount: 150, void: true, online: false, earned: 0, redeemed: 0,
      items: [{ zh: '燕麥拿鐵（大杯、少冰、加一份濃縮）', en: 'Oat latte', qty: 1 }] } ],
  points: [
    { id: 'y1', at: '2026-11-02T11:20:00Z', type: 'earn', delta: 66, brand: 'BAR', reason: '', expires_at: '2027-11-02T11:20:00Z' },
    { id: 'y2', at: '2026-11-02T11:20:00Z', type: 'redeem', delta: -70, reason: '', expires_at: null },
    { id: 'y3', at: '2026-11-01T02:00:00Z', type: 'grant', delta: 50, reason: '開幕補點', expires_at: '2027-11-01T02:00:00Z' },
    { id: 'y4', at: '2026-10-30T02:00:00Z', type: 'review', delta: 5, reason: '', expires_at: '2027-10-30T02:00:00Z' },
    { id: 'y5', at: '2026-10-29T03:00:00Z', type: 'void', delta: -15, reason: '', expires_at: null } ] };
const EMPTY = process.env.EMPTY === '1';
if (EMPTY) { HIST.orders = []; HIST.points = []; HIST.balance = 0; }

const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(w, name, { lang = 'zh', act = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((n, l) => { localStorage.setItem('tth_token', 'tok'); localStorage.setItem('m_lang', l);
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, lang);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'app.emoji.tw') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = u.pathname === '/' ? 'm.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://app.emoji.tw/' + (lang === 'zh' ? '' : '?lang=' + lang), { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (act) { try { await act(page); } catch (e) { console.log(name, 'ACT-FAIL', e.message); } }
  await new Promise(r => setTimeout(r, 600));
  const m = await page.evaluate(() => { const pg = document.querySelector('.pg .body');
    const over = [...document.querySelectorAll('.pg *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).length;
    return { overflow: document.documentElement.scrollWidth - innerWidth, pgOverflow: pg ? pg.scrollWidth - pg.clientWidth : null, offscreen: over,
      cards: document.querySelectorAll('.hist-card').length, pts: document.querySelectorAll('.hist-pt').length, entry: !!document.querySelector('#hist-open'), text: pg ? pg.innerText.slice(0, 160).replace(/\n/g, ' | ') : '' }; });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(';') : '');
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  await page.close();
}
const open = async p => { await p.click('#hist-open'); await new Promise(r => setTimeout(r, 500)); };
const pts = async p => { await open(p); await p.click('[data-ht=points]'); };
for (const w of [390, 320]) {
  await shot(w, `home-${w}`);
  await shot(w, `orders-${w}`, { act: open });
  await shot(w, `points-${w}`, { act: pts });
}
await shot(390, 'orders-en-390', { lang: 'en', act: open });
await shot(390, 'points-ja-390', { lang: 'ja', act: pts });
await shot(390, 'me-390', { act: async p => { await p.click('[data-tab=me]'); } });
await browser.close();
