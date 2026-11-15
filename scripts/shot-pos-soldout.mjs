// POS「估清」分頁：原物料區＋套餐選項連動（KK 11/15）截圖＋量測，不碰 DB。用法：node scripts/shot-pos-soldout.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-soldout-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-15T06:00:00Z'), DAY = '2026-11-15';
let menu = { version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '黑糖拿鐵', price: 180, published: true },
  { id: 'm_milk', venue: 'CAFE', cat: 'BEVERAGE', zh: '黑糖牛奶', price: 160, published: true },
  { id: 'm_oolong', venue: 'CAFE', cat: 'TEA', zh: '紅烏龍', price: 150, published: true },
  { id: 'm_bagel', venue: 'CAFE', cat: 'FOOD', zh: '原味貝果', price: 120, published: true },
  { id: 'm_combo', venue: 'CAFE', cat: 'COMBO', zh: '早午餐套餐', price: 250, published: true, combo: [
    { key: 'main', label: '主餐', choices: [{ id: 'm_bagel', zh: '原味貝果', add: 0 }] },
    { key: 'drink', label: '飲品', choices: [{ id: 'm_latte', zh: '黑糖拿鐵', add: 0 }, { id: 'm_oolong', zh: '紅烏龍', add: 0 }] }] },
] };
const mats = [
  { id: 'inv_sugar', name: '黑糖', kind: 'raw', venue: 'CAFE', sold_out: false, menu: [{ id: 'm_latte', zh: '黑糖拿鐵' }, { id: 'm_milk', zh: '黑糖牛奶' }] },
  { id: 'inv_tea', name: '鍋煮紅烏龍茶', kind: 'raw', venue: 'CAFE', sold_out: false, menu: [{ id: 'm_oolong', zh: '紅烏龍' }] },
];
const calls = [];
function api(u, method, body) {
  const p = u.pathname;
  if (method === 'POST') calls.push(p + ' ' + (body || ''));
  if (p === '/api/state') return { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: JSON.stringify(menu) }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: JSON.stringify(menu) } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/menu/materials') return { business_day: DAY, materials: mats };
  if (p === '/api/admin/menu/material-sold-out') {
    const b = JSON.parse(body); const m = mats.find(x => x.id === b.inv_id); m.sold_out = b.sold_out;
    const ids = m.menu.map(x => x.id);
    menu.items = menu.items.map(it => ids.includes(it.id) ? (b.sold_out ? { ...it, sold_out: DAY, sold_out_by: [m.id] } : { ...it, sold_out: '', sold_out_by: [] }) : it);
    return { ok: true, inv_id: m.id, name: m.name, sold_out: b.sold_out, changed: ids };
  }
  if (p === '/api/admin/orders/pause') return { pause: {} };
  if (p === '/api/admin/orders') return { sessions: [], orders: [], tickets: [], stock: menu.items.filter(it => it.sold_out).map(it => ({ id: it.id, sold_out: it.sold_out, sold_out_by: it.sold_out_by, stock_day: '', stock_left: null })) };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const report = {};
for (const [w, h, mobile] of [[1180, 820, false], [390, 844, true]]) {
  menu.items = menu.items.map(it => ({ ...it, sold_out: '', sold_out_by: [] })); mats.forEach(m => { m.sold_out = false; });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method(), r.postData())) });
    const f = /^\/(atcafe|3am)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://pos.test/atcafe/soldout', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  const read = () => page.evaluate(() => ({
    mats: [...document.querySelectorAll('[data-so-mat]')].map(b => b.innerText.replace(/\s+/g, ' ')),
    items: [...document.querySelectorAll('[data-so]')].map(b => b.innerText.replace(/\s+/g, ' ')),
    overflow: document.documentElement.scrollWidth - innerWidth,
    small: [...document.querySelectorAll('[data-so-mat],[data-so]')].filter(b => b.getBoundingClientRect().height < 44).length,
  }));
  const before = await read();
  await page.screenshot({ path: path.join(OUT, `soldout-${w}-before.png`), fullPage: true });
  await page.evaluate(() => document.querySelector('[data-so-mat="inv_sugar"]').click());
  await new Promise(r => setTimeout(r, 300));
  const dlg = await page.evaluate(() => document.querySelector('.op-overlay')?.innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(OUT, `soldout-${w}-confirm.png`) });
  await page.evaluate(() => { const b = [...document.querySelectorAll('.op-overlay button')].find(x => /估清/.test(x.textContent)); b.click(); });
  await new Promise(r => setTimeout(r, 1200));
  const after = await read();
  await page.screenshot({ path: path.join(OUT, `soldout-${w}-after.png`), fullPage: true });
  report[w] = { before, dlg, after, errs };
  await page.close();
}
report.calls = calls;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
