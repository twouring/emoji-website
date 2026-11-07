// POS 桌號獨立網址 /pos/table/<桌號>：直接開、點桌、回桌況、上一頁／下一頁、桌已關退回 /pos。不碰 DB。
// 用法：node scripts/shot-pos-table-url.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-scan-checkout'; fs.mkdirSync(OUT, { recursive: true });
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
  if (p === '/api/admin/orders') return { sessions: [sess, { ...sess, id: 'ts_0000000000000002', table: 'B1' }], orders, tables: ['A1', 'A2', 'A3', 'B1'], tickets: [] };
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

await page.evaluateOnNewDocument(() => { const AC = window.AudioContext; });
const out = {};
for (const [w, h] of [[1180, 820], [390, 844]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto('https://pos.test/atcafe', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
  const row = await page.evaluate(() => { const b = [...document.querySelectorAll('.pos-open .btn')]; return b.map(x => { const r = x.getBoundingClientRect(); return { t: x.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), over: x.scrollWidth > x.clientWidth, svg: !!x.querySelector('svg') }; }); });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.evaluate(() => document.querySelector('.pos-open').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUT, `tables-${w}.png`) });
  await page.click('#pos-scan-checkout'); await wait(1500);
  const cam = await page.evaluate(() => { const v = document.querySelector('#pos-table-scan-video'); return { overlay: !!document.querySelector('.pos-scan-full'), playing: !!(v && v.srcObject && v.videoWidth), hint: document.querySelector('.pos-scan-full-hint')?.innerText }; });
  await page.screenshot({ path: path.join(OUT, `scan-${w}.png`) });
  // 模擬掃到 B1 的點餐 QR：由掃描迴圈的 onCode 回呼送進來（以手動欄位貼網址走同一條 done）
  await page.type('#pos-table-scan-input', 'https://atcafe.emoji.tw/order?s=ts_0000000000000002&k=abc');
  await page.click('.pos-scan-full [data-ok]'); await wait(800);
  const after = await page.evaluate(() => ({ path: location.pathname, inTable: !!document.querySelector('#pos-back'), overlay: !!document.querySelector('.pos-scan-full'), toast: document.querySelector('.toast, #toast, .a-toast')?.innerText }));
  await page.screenshot({ path: path.join(OUT, `after-${w}.png`) });
  // 已清桌的 QR
  await page.goto('https://pos.test/atcafe', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(600);
  await page.click('#pos-scan-checkout'); await wait(500);
  await page.type('#pos-table-scan-input', 'https://app.emoji.tw/order?s=ts_gone&k=x'); await page.click('.pos-scan-full [data-ok]'); await wait(800);
  const gone = await page.evaluate(() => ({ path: location.pathname, inTable: !!document.querySelector('#pos-back'), toast: [...document.querySelectorAll('body *')].map(e => e.childElementCount === 0 ? e.innerText : '').find(t => t && t.includes('沒有開著') || t && t.includes('已結帳清桌')) }));
  out[w] = { row, docOverflow: ov, cam, after, gone };
}
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
