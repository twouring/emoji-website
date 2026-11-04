// POS 桌號獨立網址 /pos/table/<桌號>：直接開、點桌、回桌況、上一頁／下一頁、桌已關退回 /pos。不碰 DB。
// 用法：node scripts/shot-pos-table-url.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/resv-internal-shots'; fs.mkdirSync(OUT, { recursive: true });
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
  if (p === '/api/admin/reservation-hours') return { ok: true, all: [], weekly: {}, dates: {} };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, from: '2026-11-02', days: 7, labels: {}, reservations: [
    { id: 'dr_1', request_id: '1102-001', reserve_date: '2026-11-02', reserve_time: '13:00', period: 'CAFE', venue: 'CAFE', party_size: 4, name: '王小明', phone: '0912345678', email: '', note: '靠窗', internal_note: '招待飲品（股東朋友）', status: 'confirmed', table_no: 'A1', staff_note: '' },
    { id: 'dr_2', request_id: '1102-002', reserve_date: '2026-11-02', reserve_time: '19:00', period: 'BAR', venue: 'BAR', party_size: 2, name: 'Amy', phone: '0922333444', email: 'a@x.tw', note: '', internal_note: '招待', status: 'confirmed', table_no: '', staff_note: '' },
    { id: 'dr_3', request_id: '1102-003', reserve_date: '2026-11-02', reserve_time: '20:00', period: 'BAR', venue: 'BAR', party_size: 3, name: '陳先生', phone: '0933', email: '', note: '慶生', internal_note: '', status: 'confirmed', table_no: '', staff_note: '' }] };
  if (p.includes('/serve')) return { ok: true, items: lines };
  if (p === '/api/admin/orders') return { sessions: [sess], orders, tables: ['A1', 'A2', 'A3'], tickets: [], reservations: { A1: [{ id: 'dr_1', time: '13:00', name: '王小明', party_size: 4, status: 'confirmed', internal_note: '招待飲品（股東朋友）' }] } };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const errs = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const [w, h] of [[1180, 820], [390, 844]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
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
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://pos.test/pos', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(700);
  await page.screenshot({ path: path.join(OUT, `tables-${w}.png`) });
  console.log(w, 'card', await page.evaluate(() => [...document.querySelectorAll('.pos-table .resv-internal')].map(e => e.innerText)));
  await page.goto('https://pos.test/pos/reservations', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(700);
  console.log(w, 'list', await page.evaluate(() => [...document.querySelectorAll('.resv-tbl .resv-internal')].map(e => e.innerText)), 'overflow', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await page.screenshot({ path: path.join(OUT, `list-${w}.png`), fullPage: true });
  await page.click('#resv-add-toggle'); await wait(300);
  await page.evaluate(() => document.querySelector('#resv-new-internal')?.scrollIntoView({ block: 'center' }));
  await page.click('[data-note-for="resv-new-internal"] [data-note="招待"]').catch(e => console.log('chip', e.message)); await wait(200);
  console.log(w, 'add-internal', await page.$eval('#resv-new-internal', e => e.value));
  await page.screenshot({ path: path.join(OUT, `add-${w}.png`) });
  await page.click('#resv-add-toggle'); await wait(200);
  await page.click('[data-resv-edit="dr_1"]'); await wait(700);
  await page.evaluate(() => document.querySelector('#re-internal')?.scrollIntoView({ block: 'center' }));
  console.log(w, 'edit-internal', await page.$eval('#re-internal', e => e.value), 'overflow', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await page.screenshot({ path: path.join(OUT, `edit-${w}.png`) });
  await page.close();
}
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
