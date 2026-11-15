// 共用座位（KK 11/16）：在咖啡 POS 桌況標出三點水佔用的 A2／A8／C6；混桌 A3 的三點水品項灰色唯讀。不碰 DB。
// 用法：node scripts/shot-pos-other-brand.mjs <輸出目錄>（印量測 JSON：佔用格、可點性、小計、溢出、實際送出的請求）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-other-brand'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-15T12:30:00Z');
const at = m => new Date(NOW - m * 60e3).toISOString();
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鬆餅', price: 220, published: true }, { id: 'm2', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true }] });
const state = { role: 'admin', super: false, brands: ['CAFE'], me: { email: 'cafe@emoji.tw', name: '在咖啡' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const lines = [
  { line: 'l1', item_id: 'm1', zh: '鬆餅', cat: 'FOOD', venue: 'CAFE', qty: 1, price: 220, ticket: 'tk_a', placed_at: at(10), added_at: at(11) },
  { line: 'l2', item_id: 'm2', zh: '拿鐵', cat: 'COFFEE', venue: 'CAFE', qty: 2, price: 150, ticket: 'tk_a', placed_at: at(10), served_at: at(5), added_at: at(11) },
];
const other_lines = [{ line: 'x1', zh: '琴通寧', qty: 2, venue: 'BAR', placed_at: at(8) }, { line: 'x2', zh: '炸雞', qty: 1, venue: 'BAR', placed_at: at(8) }];
const sess = { id: 'ts_0000000000000001', table: 'A3', takeout: false, state: 'open', lines, other_lines, mixed: true, unpaid: 2, unpaid_amount: 520, created_at: at(20), party_size: 2, pay_requests: [], members: [] };
const occupied = ['A2', 'A8', 'C6'].map(t => ({ table: t, venue: 'BAR', since: at(30) }));
const TABLES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const calls = [];
function api(u, method) {
  const p = u.pathname; if (method === 'POST') calls.push(p);
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/orders') return { sessions: [sess], occupied, orders: [], tickets: [], reservations: {}, table_layout: { tables: TABLES } };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
await page.setRequestInterception(true);
page.on('request', r => {
  const u = new URL(r.url());
  if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
  if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method())) });
  const f = u.pathname === '/atcafe' || u.pathname.startsWith('/atcafe/') ? 'pos.html' : u.pathname.slice(1);
  const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
  r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
});
const errs = []; page.on('pageerror', e => errs.push(e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = {};
for (const [w, h] of [[1180, 820], [390, 844]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto('https://pos.test/atcafe', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
  const floor = await page.evaluate(() => ({
    busy: [...document.querySelectorAll('[data-other-busy]')].map(e => ({ t: e.dataset.otherBusy, text: e.innerText.replace(/\s+/g, ' '), tag: e.tagName, pe: getComputedStyle(e).pointerEvents, bg: getComputedStyle(e).backgroundColor })),
    openable: [...document.querySelectorAll('[data-open-table]')].map(e => e.dataset.openTable),
    overflowX: document.documentElement.scrollWidth - innerWidth,
  }));
  await page.screenshot({ path: path.join(OUT, `floor-${w}.png`) });
  // 點佔用格：不應送出任何開桌請求
  const before = calls.length;
  await page.evaluate(() => document.querySelector('[data-other-busy="A2"]')?.click()); await wait(400);
  floor.clickBusyPosts = calls.length - before;
  // 進混桌 A3
  await page.evaluate(() => document.querySelector('[data-pos-table="A3"]')?.click()); await wait(800);
  const bill = await page.evaluate(() => {
    const o = document.querySelector('.pos-other-lines');
    return { other: o ? o.innerText.replace(/\s+/g, ' ') : null, otherColor: o && getComputedStyle(o).color, otherBg: o && getComputedStyle(o).backgroundColor,
      otherControls: o ? o.querySelectorAll('input,button,select,a').length : null,
      ownRows: [...document.querySelectorAll('.pos-lines tbody tr[data-edit-line]')].map(r => r.dataset.editLine),
      total: (document.querySelector('.pos-sum-total, .pos-total, [data-total]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
      overflowX: document.documentElement.scrollWidth - innerWidth };
  });
  const el = await page.$('.pos-other-lines'); if (el) await el.scrollIntoView();
  await page.screenshot({ path: path.join(OUT, `bill-${w}.png`) });
  out[w] = { floor, bill };
}
console.log(JSON.stringify({ out, posts: calls, errs }, null, 1));
await browser.close();
