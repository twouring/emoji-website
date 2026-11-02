// 結帳頁：自動出單狀態列＋品項「⋯」內的出餐鍵（KK 11/2 出餐分頁移除）截圖，不碰 DB。
// 用法：node scripts/shot-pos-serve.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-serve-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-02T04:30:00Z');
const at = m => new Date(NOW - m * 60e3).toISOString();
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鬆餅', price: 220, published: true }, { id: 'm2', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true }] });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const lines = [
  { line: 'l1', item_id: 'm1', zh: '鬆餅', cat: 'FOOD', venue: 'CAFE', qty: 1, price: 220, ticket: 'tk_a', placed_at: at(10), added_at: at(11) },
  { line: 'l2', item_id: 'm2', zh: '拿鐵', cat: 'COFFEE', venue: 'CAFE', qty: 2, price: 150, ticket: 'tk_a', placed_at: at(10), served_at: at(5), added_at: at(11) },
];
const sess = { id: 'ts_0000000000000001', table: 'A3', takeout: false, state: 'eating', lines, unpaid: 3, unpaid_amount: 520, opened_at: at(20), party: 2, pay_requests: [], members: [] };
const orders = [{ id: 'od_1', session_id: sess.id, table_no: 'A3', status: 'paid', amount: 150, paid_at: at(3), items: [{ zh: '可頌', qty: 1 }], payer: { method: 'cash' } }];
const calls = [];
function api(u, method) {
  const p = u.pathname; if (method === 'POST') calls.push(p);
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.includes('/serve')) return { ok: true, items: lines };
  if (p === '/api/admin/orders') return { sessions: [sess], orders, tables: ['A1', 'A2', 'A3'], tickets: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
for (const [w, h, mobile] of [[1180, 820, false], [390, 844, true]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method())) });
    const f = u.pathname === '/pos' || u.pathname.startsWith('/pos/') ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://pos.test/pos/orders', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  const nav = await page.evaluate(() => ({ path: location.pathname, tabs: [...document.querySelectorAll('#p-nav [data-tab]')].map(b => b.dataset.tab), status: document.querySelector('.pos-print-status')?.innerText.replace(/\s+/g, ' ') }));
  await page.screenshot({ path: path.join(OUT, `pos-${w}-board.png`) });
  await page.click('[data-pos-table="A3"]').catch(e => errs.push('click table ' + e.message));
  await new Promise(r => setTimeout(r, 500));
  const more = await page.$$('tr[data-edit-line="l1"] .ops-more summary'); if (more[0]) { await more[0].evaluate(e => e.scrollIntoView({ block: 'center' })); await more[0].click(); }
  await new Promise(r => setTimeout(r, 300));
  const m = await page.evaluate(() => ({ serveL1: !!document.querySelector('[data-serve-pos="l1"]'), serveL2: !!document.querySelector('[data-serve-pos="l2"]'), readyBtn: !!document.querySelector('[data-order-status="od_1"]'), overflow: document.documentElement.scrollWidth - innerWidth }));
  await page.screenshot({ path: path.join(OUT, `pos-${w}-menu.png`) });
  await page.click('[data-serve-pos="l1"]').catch(e => errs.push('click serve ' + e.message));
  await new Promise(r => setTimeout(r, 400));
  console.log(w, JSON.stringify({ nav, ...m, posted: calls.filter(c => c.includes('serve')) }), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  calls.length = 0; await page.close();
}
await browser.close();
