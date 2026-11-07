// 一排 12 桌（KK 11/7）：每桌寬 8%，量桌況與編輯模式是否重疊、溢出、按鈕是否擠壞。不碰 DB。
// 用法：node scripts/shot-table-row12.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/table-row12'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const tables = Array.from({ length: 12 }, (_, i) => 'A' + (i + 1)).concat(Array.from({ length: 12 }, (_, i) => 'B' + (i + 1)));
const pos = {}; tables.forEach((t, i) => { pos[t] = [Math.round((i % 12) * 8.2 * 10) / 10 > 92 ? 92 : Math.floor((i % 12) * 8.2), i < 12 ? 0 : 50, 8, 20]; });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: {}, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const NOW = Date.now(); const at = m => new Date(NOW - m * 60e3).toISOString();
const sess = t => ({ id: 'ts_' + t, table: t, takeout: false, state: 'eating', lines: [{ line: 'l1', item_id: 'm1', zh: '鬆餅', cat: 'FOOD', venue: 'CAFE', qty: 1, price: 220, ticket: 'tk', placed_at: at(10), added_at: at(11) }], unpaid: 1, unpaid_amount: 220, opened_at: at(20), party: 2, pay_requests: [], members: [] });
let saved = null;
function api(u, method, body) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p.includes('table-layout')) { if (method !== 'GET') saved = body; return { ok: true }; }
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p === '/api/admin/orders') return { sessions: ['A3', 'A7', 'B12'].map(sess), orders: [], tables, table_layout: { order: [], pos, tables }, pending: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
const res = {};
for (const [w, h] of [[1366, 1024], [1180, 820], [1024, 768], [820, 1180]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method(), r.postData())) });
    const f = u.pathname === '/atcafe' || u.pathname.startsWith('/atcafe/') ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://pos.test/atcafe', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  const measure = sel => page.evaluate(sel => {
    const els = [...document.querySelectorAll(sel)].map(e => ({ e, r: e.getBoundingClientRect() }));
    let overlap = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].r, b = els[j].r; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++; }
    const row1 = els.filter(x => Math.abs(x.r.top - els[0].r.top) < 2).length;
    const inner = els.map(({ e, r }) => { const kids = [...e.querySelectorAll('b,.pill,.tk-time,.pos-slot-name')]; return kids.some(k => { const q = k.getBoundingClientRect(); return q.width && (q.right > r.right + 1 || q.left < r.left - 1); }); }).filter(Boolean).length;
    return { n: els.length, row1, overlap, w: Math.round(els[0]?.r.width), h: Math.round(els[0]?.r.height), innerOverflow: inner, overflowX: document.documentElement.scrollWidth - innerWidth };
  }, sel);
  const floor = await measure('.pos-floor-slot');
  await page.screenshot({ path: path.join(OUT, `floor-${w}.png`) });
  await page.evaluate(() => document.getElementById('pos-edit-tables')?.click()); await new Promise(r => setTimeout(r, 400));
  const edit = await measure('.pos-drag');
  const btns = await page.evaluate(() => { const c = document.querySelector('.pos-drag'); if (!c) return null; const R = s => { const r = c.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)]; }; return { del: R('.pos-del-table'), ren: R('.pos-ren-table'), rz: R('.pos-rz'), card: Math.round(c.getBoundingClientRect().width) }; });
  await page.screenshot({ path: path.join(OUT, `edit-${w}.png`) });
  res[w] = { floor, edit, btns, errs };
  await page.close();
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
