// POS 桌號結帳頁右欄（會員 → 發票 → 支付方式 → 結帳內容）截圖＋量測。不碰 DB。
// 用法：node scripts/shot-pos-checkout-panel.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-checkout-panel'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-05T04:30:00Z');
const at = m => new Date(NOW - m * 60e3).toISOString();
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鬆餅', price: 220, published: true }, { id: 'm2', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true }] });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [], invoice: { configured: true } };
const lines = [
  { line: 'l1', item_id: 'm1', zh: '鬆餅', cat: 'FOOD', venue: 'CAFE', qty: 1, price: 220, ticket: 'tk_a', placed_at: at(10), added_at: at(11) },
  { line: 'l2', item_id: 'm2', zh: '拿鐵', cat: 'COFFEE', venue: 'CAFE', qty: 2, price: 150, ticket: 'tk_a', placed_at: at(10), served_at: at(5), added_at: at(11) },
];
const sess = { id: 'ts_0000000000000001', table: 'A3', takeout: false, state: 'eating', lines, unpaid: 3, unpaid_amount: 520, created_at: at(40), updated_at: at(5), party_size: 2, pay_requests: [], members: [] };
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/orders') return { sessions: [sess], orders: [], tables: ['A1', 'A2', 'A3'], tickets: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const errs = [];
async function shot(name, w, h, prep) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = /^\/(atcafe|3am)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto('https://pos.test/atcafe/table/A3', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 700));
  if (prep) { await prep(page); await new Promise(r => setTimeout(r, 400)); }
  const m = await page.evaluate(() => {
    const pay = document.querySelector('.pos-pay'); if (!pay) return { missing: true };
    const kids = [...pay.children].filter(e => e.offsetParent !== null).map(e => (e.className || e.id || e.tagName).toString().split(' ')[0] + ':' + Math.round(e.getBoundingClientRect().height));
    const small = [...pay.querySelectorAll('button,label,input,select')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.height < 44).length;
    return { order: kids, overflowX: document.documentElement.scrollWidth - innerWidth, payOverflowX: pay.scrollWidth - pay.clientWidth, payScroll: pay.scrollHeight + '/' + pay.clientHeight, under44: small, textOverflow: [...pay.querySelectorAll('b,span,small,label')].filter(e => e.offsetParent !== null && e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').map(e => e.textContent.trim().slice(0, 12)), methodOverflow: [...document.querySelectorAll('.pos-method')].filter(l => { const b = l.querySelector('b'), r = b.getBoundingClientRect(), q = l.getBoundingClientRect(); return r.left < q.left - 0.5 || r.right > q.right + 0.5; }).map(l => l.title) };
  });
  console.log(name.padEnd(14), JSON.stringify(m));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  const pay = await page.$('.pos-pay');
  if (pay && w >= 1000) await page.evaluate(() => { const p = document.querySelector('.pos-pay'); p.style.overflow = 'visible'; p.style.maxHeight = 'none'; }), await pay.screenshot({ path: path.join(OUT, name + '-pay.png') });
  await page.close();
}
await shot('ipad-1180', 1180, 820);
await shot('ipad-1366', 1366, 1024);
await shot('ipad-1180-cash', 1180, 820, p => p.evaluate(() => { const r = document.querySelector('input[name=pos-method][value=cash]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }));
await shot('ipad-1180-company', 1180, 820, p => p.evaluate(() => { const r = document.querySelector('input[name=pos-invoice][value=company]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }));
await shot('phone-390', 390, 844);
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
