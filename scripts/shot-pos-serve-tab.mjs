// POS「出餐」分頁（KK 11/9）截圖＋量測，不碰 DB。用法：node scripts/shot-pos-serve-tab.mjs <輸出目錄>
// 量：頂欄分頁、亮起的桌、橫向溢出、<44px 觸控目標、點桌後清單、實際送出的 serve／status 請求、pageerror
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-serve-tab-shots'; fs.mkdirSync(OUT, { recursive: true });
// 第二個參數＝正式站 table_layout JSON（GET /api/admin/orders 的 table_layout），有平面圖才看得到現場擺位
const LAYOUT = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-09T04:30:00Z');
const at = m => new Date(NOW - m * 60e3).toISOString();
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '鬆餅', price: 220, published: true }, { id: 'm2', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true }] });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const L = (line, zh, cat, qty, tk, min, extra = {}) => ({ line, item_id: 'm1', zh, cat, venue: 'CAFE', qty, price: 150, ticket: tk, placed_at: at(min), added_at: at(min + 1), ...extra });
const sessions = [
  { id: 'ts_a3', table: 'A3', state: 'ordered', party_size: 2, created_at: at(30), lines: [] },
  { id: 'ts_a5', table: 'A5', state: 'ordered', party_size: 4, created_at: at(40), lines: [] },
  { id: 'ts_b1', table: 'B1', state: 'ordered', party_size: 3, created_at: at(25), lines: [] },
  { id: 'ts_c2', table: 'C2', state: 'open', party_size: 2, created_at: at(10), lines: [] },
  { id: 'ts_w1', table: 'W01', takeout: true, state: 'preparing', created_at: at(6), lines: [] },
];
const tickets = [
  { ticket: 'tk_a3', session_id: 'ts_a3', table_no: 'A3', placed_at: at(5), items: [L('l1', '鬆餅', 'FOOD', 1, 'tk_a3', 5, { note: '加冰淇淋' }), L('l2', '拿鐵', 'COFFEE', 2, 'tk_a3', 5, { served_at: at(2) })] },
  { ticket: 'tk_a5', session_id: 'ts_a5', table_no: 'A5', placed_at: at(11), items: [L('l3', '經典美式', 'COFFEE', 1, 'tk_a5', 11), L('l4', '季節水果塔', 'DESSERT', 2, 'tk_a5', 11)] },
  { ticket: 'tk_b1a', session_id: 'ts_b1', table_no: 'B1', placed_at: at(18), items: [L('l5', '炙燒牛肉飯', 'FOOD', 1, 'tk_b1a', 18)] },
  { ticket: 'tk_b1b', session_id: 'ts_b1', table_no: 'B1', placed_at: at(3), items: [L('l6', '檸檬塔', 'DESSERT', 1, 'tk_b1b', 3)] },
];
const orders = [{ id: 'to_w1', session_id: 'ts_w1', table_no: 'W01', status: 'paid', amount: 300, paid_at: at(6), items: [{ line: 'w1', zh: '可頌', qty: 2, cat: 'DESSERT' }], payer: { method: 'cash' } }];
const calls = [];
function api(u, method, body) {
  const p = u.pathname; if (method === 'POST') calls.push(p + ' ' + (body || ''));
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.includes('/serve')) return { ok: true, items: [] };
  if (p.endsWith('/status')) return { ok: true, status: 'ready', notified: 1 };
  if (p === '/api/admin/orders') return { sessions, orders, tickets, table_layout: LAYOUT };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
for (const [w, h, mobile] of [[1180, 820, false], [390, 844, true]]) {
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
  await page.goto('https://pos.test/atcafe/orders', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  const board = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      path: location.pathname,
      tabs: [...document.querySelectorAll('#p-nav [data-tab]')].map(b => b.dataset.tab).join(','),
      navActive: document.querySelector('#p-nav [aria-pressed="true"]')?.dataset.tab,
      lit: [...document.querySelectorAll('[data-serve-table]')].filter(vis).map(b => b.dataset.serveTable + ':' + b.innerText.replace(/\s+/g, ' ') + (b.className.match(/serve-(warn|late)/)?.[0] ? '[' + b.className.match(/serve-(warn|late)/)[0] + ']' : '')),
      idle: document.querySelectorAll('.serve-idle').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      navOverflow: (n => n.scrollWidth - n.clientWidth)(document.getElementById('p-nav')),
      small: [...document.querySelectorAll('[data-serve-table]')].filter(vis).filter(b => b.getBoundingClientRect().height < 44).length,
    };
  });
  await page.screenshot({ path: path.join(OUT, `serve-${w}-board.png`) });
  const target = await page.$$('[data-serve-table="A5"]'); let el = null; for (const t of target) if (await t.evaluate(e => e.getBoundingClientRect().width > 0)) { el = t; break; }
  await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 200));
  const hit = await el.evaluate(e => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e.contains(t) ? 'ok' : (t && t.className); });
  if (hit !== 'ok') console.log(w, 'A5 被蓋住：', hit);
  await el.click();
  await new Promise(r => setTimeout(r, 400));
  const sheet = await page.evaluate(() => { const s = document.querySelector('.serve-sheet'); const r = s?.getBoundingClientRect(); return { open: !!s, rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], lines: [...document.querySelectorAll('.serve-line')].map(l => l.querySelector('.ops-name').innerText + l.querySelector('.ops-qty').innerText), btnH: [...document.querySelectorAll('.serve-btn')].map(b => Math.round(b.getBoundingClientRect().height)), all: document.querySelector('[data-serve-all]')?.innerText, overflow: document.documentElement.scrollWidth - innerWidth }; });
  await page.screenshot({ path: path.join(OUT, `serve-${w}-sheet.png`) });
  await page.click('[data-serve-line="l3"]'); await new Promise(r => setTimeout(r, 400));
  // 整桌出餐（B1 有兩張送單 → 兩次 serve）
  await page.evaluate(() => { SERVE_TABLE = 'B1'; paintServe(); }); await new Promise(r => setTimeout(r, 200));
  await page.click('[data-serve-all]'); await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { SERVE_TABLE = 'W01'; paintServe(); }); await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, `serve-${w}-takeout.png`) });
  await page.click('[data-serve-order="to_w1"]'); await new Promise(r => setTimeout(r, 400));
  console.log(w, JSON.stringify({ board, sheet, posted: calls }), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  calls.length = 0; await page.close();
}
await browser.close();
