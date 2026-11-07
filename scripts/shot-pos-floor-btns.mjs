// 桌況版面（KK 11/7）：加開桌號在外帶欄下、底列置底、列印狀態在編輯桌位旁。不碰 DB。
// 用法：node scripts/shot-pos-floor-btns.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-floor-btns'; fs.mkdirSync(OUT, { recursive: true });
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
  if (p === '/api/admin/orders') return { sessions: [sess, { ...sess, id: 'ts_0000000000000002', table: 'B1' }, ...(process.env.NO_TO ? [] : Array.from({ length: 9 }, (_, i) => ({ ...sess, id: 'ts_to' + i, table: 'W0' + (i + 1), takeout: true })))], orders, tables: ['A1', 'A2', 'A3', 'B1'], tickets: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 820 });
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
const look = () => page.evaluate(() => ({ path: location.pathname, inTable: !!document.querySelector('#pos-back'), title: document.querySelector('.pos-bill h2, .pos-bill-head h2, #pos-body h2')?.innerText?.slice(0, 30) }));


const out = {};
for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [390, 844], [320, 640]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto('https://pos.test/atcafe', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
  const m = await page.evaluate(() => {
    const R = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const ex = document.querySelector('#pos-open-extra');
    return { vh: innerHeight, docScroll: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth - innerWidth,
      extraInTakeouts: !!ex?.closest('.pos-takeouts'), strip: R('.pos-foot>.pos-takeouts'), stripScroll: (e => e && [e.scrollWidth, e.clientWidth])(document.querySelector('.pos-foot>.pos-takeouts')), cards: document.querySelectorAll('.pos-takeout-list .pos-table').length, extra: R('#pos-open-extra'), takeoutList: R('.pos-takeout-list'), open: R('.pos-open'), openBtns: [...document.querySelectorAll('.pos-open .btn')].map(b => b.innerText.trim()),
      edit: R('#pos-edit-tables'), print: R('.ops-head .pos-print-status'), printText: document.querySelector('.ops-head .pos-print-status')?.innerText, tables: R('.pos-tables'), extraOver: ex ? ex.scrollWidth > ex.clientWidth : null };
  });
  await page.screenshot({ path: path.join(OUT, `floor-${w}.png`) });
  out[w] = m;
}
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
