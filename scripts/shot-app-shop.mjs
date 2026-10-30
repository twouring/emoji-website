// 會員 App 商店截圖（不碰 DB）：首頁商店入口、商店頁（選商品）、預約分頁的商店訂單。
// 用法：node scripts/shot-app-shop.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/app-shop-shots'; fs.mkdirSync(OUT, { recursive: true });
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
  if (p === '/api/me/shop') return { ok: true, orders: shopOrders, stripe: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  return {};
}
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(w, name, { lang = 'zh', act = null, full = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((n, l) => { localStorage.setItem('tth_token', 'tok'); localStorage.setItem('m_lang', l);
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, lang);
  await page.setBypassServiceWorker(true);   // SW 的請求不走攔截，會抓到正式站舊版
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
  if (act) { try { await act(page); } catch (e) { console.log(name, 'ACT-FAIL', e.message, await page.evaluate(() => document.body.innerText.slice(0, 300))); } }
  await new Promise(r => setTimeout(r, 600));
  const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
    quick: [...document.querySelectorAll('.quick button')].map(b => b.innerText.trim()),
    items: [...document.querySelectorAll('#shm .mi .nm')].map(x => x.innerText.replace(/\s+/g, ' ')),
    go: document.querySelector('#shgo')?.innerText || null, ctr: document.querySelector('#shctr:not([hidden])')?.innerText || null, payBtn: document.querySelector('[data-pay-shop]')?.innerText || null, goDisabled: document.querySelector('#shgo')?.disabled ?? null,
    shopSec: [...document.querySelectorAll('.sec h2')].map(h => h.innerText) }));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  await page.close();
}
const openShop = async p => { await p.waitForSelector('[data-go="shop"]', { timeout: 8000 }); await p.evaluate(() => document.querySelector('[data-go="shop"]').click()); await new Promise(r => setTimeout(r, 800)); };
const pick = async p => { await openShop(p); await p.evaluate(() => { const c = id => document.querySelector(`[data-inc="${id}"]`).click(); c('s1'); c('s1'); c('s3'); }); };
for (const w of [390, 320]) {
  await shot(w, `home-${w}`);
  await shot(w, `shop-${w}`, { act: pick, full: true });
  await shot(w, `book-${w}`, { act: async p => { await p.waitForSelector('[data-go="shop"]'); await p.evaluate(() => document.querySelector('[data-tab="book"]').click()); }, full: true });
}
await shot(390, 'shop-390-en', { lang: 'en', act: pick, full: true });
await shot(390, 'shop-390-ja', { lang: 'ja', act: pick, full: true });
await shot(390, 'home-390-ja', { lang: 'ja' });
await browser.close();
