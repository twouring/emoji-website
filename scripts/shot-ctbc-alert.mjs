// 中信刷卡收款彈窗模擬圖（KK 11/5）：停在在咖啡 A3 結帳頁，假資料回兩筆新刷卡，不碰 DB。
// 用法：node scripts/shot-ctbc-alert.mjs <輸出目錄>
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
  const p = u.pathname; calls.push(method + ' ' + p);
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.includes('/serve')) return { ok: true, items: lines };
  if (p === '/api/admin/orders') return { sessions: [sess], orders, tables: ['A1', 'A2', 'A3'], tickets: [] };
  if (p === '/api/admin/orders/ctbc-alerts') return { alerts: [
    { id: 'c1', type: 'SALE', type_label: '銷售', amount: 380, paid_at: at(4), time: '2026/11/5 19:55:12', card_last4: '8812', auth_code: '503217', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' },
    { id: 'c2', type: 'SALE', type_label: '銷售', amount: 520, paid_at: at(1), time: '2026/11/5 19:58:03', card_last4: '4321', auth_code: '128844', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' }], recent: [
    { id: 'c2', type: 'SALE', type_label: '銷售', amount: 520, paid_at: at(1), time: '2026/11/5 19:58:03', card_last4: '4321', auth_code: '128844', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' },
    { id: 'c1', type: 'SALE', type_label: '銷售', amount: 380, paid_at: at(4), time: '2026/11/5 19:55:12', card_last4: '8812', auth_code: '503217', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' },
    { id: 'c0', type: 'REFUND', type_label: '退貨', amount: -150, paid_at: at(120), time: '2026/11/5 17:58:40', card_last4: '7766', auth_code: '990012', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' },
    { id: 'cx', type: 'SALE', type_label: '銷售', amount: 1260, paid_at: at(300), time: '2026/11/5 14:58:10', card_last4: '0420', auth_code: '660731', terminal_id: '81009123', device_user: '在咖啡櫃台', venue: 'CAFE', venue_label: '在咖啡' }] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [], alerts: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
for (const [w, h, mobile] of [[1180, 820, false], [390, 844, true], [320, 640, true]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_ctbc_seen_cafe', '[]'); localStorage.setItem('tth_lp_seen_cafe', '[]'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
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
  await page.goto('https://pos.test/atcafe/table/A3', { waitUntil: 'networkidle0' }).catch(() => {});
  await page.waitForSelector('#cta .lpa-card', { timeout: 8000 }).catch(e => errs.push('no popup'));
  await new Promise(r => setTimeout(r, 500));
  const m = await page.evaluate(() => { const c = document.querySelector('#cta .lpa-card'); const r = c?.getBoundingClientRect(); return { text: c?.innerText.replace(/\s+/g, ' '), cardW: r?.width, cardBottom: r?.bottom, vh: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, syncPosts: 0 }; });
  m.syncPosts = calls.filter(c => c.includes('ctbc-alerts/sync')).length;
  await page.screenshot({ path: path.join(OUT, `ctbc-alert-${w}.png`) });
  for (let k = 0; k < 2; k++) { await page.click('[data-cta-nav="1"]'); await new Promise(r => setTimeout(r, 200)); }
  m.slide3 = await page.evaluate(() => document.querySelector('#cta .lpa-nav')?.innerText.replace(/\s+/g, ' ') + ' | ' + document.querySelector('#cta .lpa-amt')?.innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(OUT, `ctbc-alert-${w}-slide3.png`) });
  await page.evaluate(() => { const l = document.querySelector('#cta .lpa-list').getBoundingClientRect(); const o = document.getElementById('cta'); const ev = (t, x) => o.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: l.top + 20 })); document.querySelector('#cta .lpa-list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: l.right - 20, clientY: l.top + 20 })); ev('pointerup', l.left + 20); });
  m.afterSwipe = await page.evaluate(() => document.querySelector('#cta .lpa-pos')?.innerText.replace(/\s+/g, ' '));
  console.log(w, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
  calls.length = 0; await page.close();
}
await browser.close();
