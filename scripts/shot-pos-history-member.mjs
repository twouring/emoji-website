// 查單補入會員：選會員面板（這桌登入／搜尋會員列表／新增手機）截圖，不碰 DB。用法：node scripts/shot-pos-history-member.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/hist-member'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-05T04:30:00Z');
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: '{"version":1,"items":[]}' }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const order = { id: 'od_hist01', session_id: 'ts_1', table_no: 'A3', status: 'paid', amount: 520, paid_at: new Date(NOW - 3600e3).toISOString(), items: [{ zh: '鬆餅', qty: 1, price: 220 }, { zh: '拿鐵', qty: 2, price: 150 }], payer: { method: 'cash' }, invoice: {}, table_members: [{ id: 'u_a', name: '王小明' }] };
const posts = [];
function api(u, method, body) {
  const p = u.pathname;
  if (method === 'POST') posts.push({ p, body });
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/admin/orders/history') return { day: '2026-11-05', orders: [order], count: 1 };
  if (p === '/api/admin/yan/members') { const q = u.searchParams.get('q'); return { members: q === '0912' ? [{ id: 'u_b', name: '陳大華', phone: '+886912345678' }, { id: 'u_c', name: '林美美', phone: '+886912000111' }] : [], next_offset: null }; }
  if (p.endsWith('/member')) return { ok: true, member: { id: 'u_b', name: '陳大華' }, earned: 5, balance: 12 };
  if (p.startsWith('/api/admin/registers')) return { current: {}, wait: {} };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/orders') return { sessions: [], orders: [], tables: [], tickets: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/.pw/chrome-linux/headless_shell', args: ['--no-sandbox'] });
const report = {};
for (const [w, h] of [[1180, 820], [390, 844]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(n => { for (const k of ['tth_token', 'tth_pos_token_cafe']) localStorage.setItem(k, 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
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
  await page.goto('https://pos.test/atcafe/history', { waitUntil: 'networkidle0' }).catch(e => errs.push(e.message));
  await new Promise(r => setTimeout(r, 600));
  await page.click('[data-hist-row="od_hist01"]').catch(e => errs.push('row ' + e.message));
  await new Promise(r => setTimeout(r, 200));
  const btn = await page.$('[data-hist-member="od_hist01"]');
  if (!btn) errs.push('no 入會員 button'); else { await btn.evaluate(e => e.scrollIntoView({ block: 'center' })); await btn.click(); }
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, `hm-${w}-1-table.png`) });
  const first = await page.evaluate(() => [...document.querySelectorAll('[data-hm-pick]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  await page.type('[data-hm-q]', '0912');
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, `hm-${w}-2-search.png`) });
  const found = await page.evaluate(() => [...document.querySelectorAll('[data-hm-pick]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  await page.$eval('[data-hm-q]', e => { e.value = ''; }); await page.type('[data-hm-q]', '0987654321');
  await new Promise(r => setTimeout(r, 700));
  const newBtn = await page.evaluate(() => ({ q: document.querySelector('[data-hm-q]').value, btn: document.querySelector('[data-hm-new]')?.dataset.hmNew || null }));
  await page.screenshot({ path: path.join(OUT, `hm-${w}-3-new.png`) });
  const ov = await page.evaluate(() => { const b = document.querySelector('.pos-move-box'); return b ? { overflow: b.scrollWidth - b.clientWidth, right: b.getBoundingClientRect().right - innerWidth } : null; });
  report[w] = { first, found, newBtn, ov, pageOverflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), errs };
  await page.close();
}
// 1180 再跑一次選人送出（含操作人員鍵盤可能出現）
console.log(JSON.stringify(report, null, 1));
await browser.close();
