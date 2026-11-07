// 訂位「已到」帶位選桌截圖：node scripts/shot-resv-seat.mjs <輸出目錄>（假資料、不碰 DB）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/resv-seat'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-07T12:50:00+08:00');
const R = (id, time, status, party, name, extra = {}) => ({ id, request_id: '1107-' + id, reserve_date: '2026-11-07', reserve_time: time, period: 'CAFE', venue: 'CAFE', party_size: party, name, phone: '0912345678', email: '', note: '', internal_note: '', status, table_no: '', staff_note: '', ...extra });
const today = [R('1', '10:00', 'no_show', 2, '林小姐'), R('2', '11:00', 'confirmed', 2, '張先生'), R('3', '12:00', 'arrived', 4, '王小明', { table_no: 'A1', note: '靠窗' }), R('4', '13:00', 'confirmed', 2, 'Amy', { internal_note: '招待飲品' }), R('5', '13:30', 'confirmed', 6, '陳先生', { table_no: 'B1', note: '慶生' }), R('6', '15:00', 'new', 5, '黃太太'), R('7', '14:00', 'cancelled', 3, '李先生')];
const later = [R('8', '12:00', 'confirmed', 2, '明天客', { reserve_date: '2026-11-08' })];
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: {}, users: [], payment_methods: [] };
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/admin/reservation-hours') return { ok: true, all: [], weekly: {}, dates: {} };
  if (p === '/api/admin/reservations') { const days = Number(u.searchParams.get('days')); return { pending: 1, from: u.searchParams.get('from'), days, labels: { new: '待確認', confirmed: '已確認', arrived: '已到', no_show: '未到', cancelled: '已取消' }, reservations: days === 1 ? today : [...today, ...later] }; }
  if (p.startsWith('/api/admin/registers')) return { current: {}, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/orders')) return { sessions: [{ id: 's1', table: 'A2', lines: [] }, { id: 's2', table: 'A3', lines: [] }, { id: 's3', table: 'W1', takeout: true, lines: [] }], orders: [], tables: [], tickets: [], reservations: { B1: [{ id: '5', time: '13:30', name: '陳先生', party_size: 6, status: 'confirmed' }], C2: [{ id: '9', time: '18:00', name: '晚客', party_size: 2, status: 'confirmed' }] }, pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const errs = []; const wait = ms => new Promise(r => setTimeout(r, ms));
const posts = [];
for (const [w, h, who, act] of [[1180, 900, '5', 'shot'], [390, 900, '5', 'shot'], [320, 900, '4', 'shot'], [390, 900, '4', 'arrive'], [1180, 900, '4', 'pick']]) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(n => { for (const k of ['tth_pos_token_cafe', 'tth_token']) localStorage.setItem(k, 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const D = Date; globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== 'pos.emoji.tw') return r.respond({ status: 404, body: '' });
    if (r.method() === 'POST' && u.pathname.startsWith('/api/')) { posts.push(w + ' ' + u.pathname + ' ' + r.postData()); return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'arrived' }) }); }
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = /^\/(atcafe|3am)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1); const fp = path.join(PUB, f);
    if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' }); r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) }); });
  page.on('pageerror', e => errs.push(w + ' ' + e.message));
  await page.goto('https://pos.emoji.tw/atcafe/reservations', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
  await page.evaluate(id => document.querySelector(`.resv-today [data-resv="${id}"][data-resv-status="arrived"]`).click(), who); await wait(600);
  const m = await page.evaluate(() => { const ov = document.querySelector('.pos-move-ov'); const box = ov && ov.querySelector('.pos-move-box'); const r = box && box.getBoundingClientRect();
    return { open: !!ov, title: ov && ov.querySelector('h3').innerText, picked: [...document.querySelectorAll('[data-st][aria-pressed=true]')].map(b => b.dataset.st), disabled: [...document.querySelectorAll('[data-st]:disabled')].map(b => b.dataset.st), ok: ov && ov.querySelector('[data-ok]').innerText, box: r && [Math.round(r.left), Math.round(r.right), Math.round(r.height)], overflow: document.documentElement.scrollWidth - innerWidth, small: [...document.querySelectorAll('.pos-move-ov button')].filter(b => b.getBoundingClientRect().height < 44).length }; });
  console.log(w, who, act, JSON.stringify(m));
  if (act === 'shot') await page.screenshot({ path: path.join(OUT, `seat-${w}-${who}.png`) });
  if (act === 'arrive') { await page.click('[data-arrive]'); await wait(800); }
  if (act === 'pick') { await page.click('[data-st="C1"]'); await page.click('[data-st="C3"]'); await wait(200); console.log('ok label', await page.$eval('[data-ok]', b => b.innerText)); await page.click('[data-ok]'); await wait(500);
    console.log('party', await page.evaluate(() => [document.querySelector('.pos-move-ov h3')?.innerText, document.querySelector('[data-adults].on')?.dataset.adults])); await page.screenshot({ path: path.join(OUT, `seat-party-${w}.png`) }); }
  await page.close();
}
console.log('posts', posts);
console.log('errors', errs);
await browser.close();
