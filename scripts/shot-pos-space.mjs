// POS 空間情境（KK 11/15）截圖＋量測：等等空間入場看板、入場資訊列、入場對話框、設定頁；約書旅席位。不碰 DB。
// 用法：node scripts/shot-pos-space.mjs <輸出目錄>（CHROME=<chrome 路徑>）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-space'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const S = require('../lib/pos-space.js');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-15T07:00:00Z');   // 台北 15:00
const at = m => new Date(NOW - m * 60e3).toISOString();
const items = S.STAY_ITEMS.map(x => ({ ...x }));
items.push(
  { id: 'm_rest_space_lounge_entry_4_hours', venue: 'REST', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 4 小時', price: 450, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
  { id: 'm_rest_space_quiet_room_4_hours', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室 4 小時', price: 750, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 },
  { id: 'm_rest_space_quiet_room_overtime_1_hour', venue: 'REST', cat: 'QUIET', zh: '空間使用費｜靜讀室超時 1 小時', price: 150, published: true, pos_only: true, space_role: 'overtime' });
const menuDoc = JSON.stringify({ version: 1, items });
const plan = (id, min, paid, qty = 1) => { const it = items.find(x => x.id === id); return { line: 'l' + id.slice(-6) + min, item_id: id, zh: it.zh, cat: it.cat, venue: it.venue, qty, price: it.price, space_role: 'plan', space_minutes: min, order_id: paid ? 'to_x' : null, by: '櫃檯', added_at: at(300) }; };
function sess(venue, table, { inMin, plans, headcount = 1, out = null, unpaidOt = 0 }) {
  const lines = [...plans]; if (unpaidOt) lines.push({ line: 'ot' + table, item_id: 'ot', zh: '空間使用費｜等等空間超時 1 小時', cat: 'SPACE', venue, qty: unpaidOt, price: 50, space_role: 'overtime', by: '櫃檯', order_id: null });
  const s = { id: 'ts_' + table.toLowerCase().padEnd(16, '0'), table, items: lines, space: { seat: '', headcount, in_at: inMin == null ? null : at(inMin), out_at: out == null ? null : at(out) } };
  const unpaid = lines.filter(l => !l.order_id);
  return { id: s.id, table, takeout: false, state: 'eating', lines: unpaid, paid_lines: [], unpaid: unpaid.length, unpaid_amount: unpaid.reduce((a, l) => a + l.price * l.qty, 0), created_at: at(300), updated_at: at(1), pay_requests: [], members: [],
    space: S.view(s, S.normalizeSettings('', venue), NOW) };
}
const DATA = {
  STAY: { sessions: [
    sess('STAY', 'E01', { inMin: 60, plans: [plan('m_stay_space_entry_4_hours', 240, true, 2)], headcount: 2 }),
    sess('STAY', 'E02', { inMin: 235, plans: [plan('m_stay_space_entry_4_hours', 240, true)] }),
    sess('STAY', 'E03', { inMin: 250, plans: [plan('m_stay_space_entry_4_hours', 240, true)] }),
    sess('STAY', 'E04', { inMin: 330, plans: [plan('m_stay_space_entry_4_hours', 240, true)] }),
    sess('STAY', 'E05', { inMin: null, plans: [plan('m_stay_space_entry_12_hours', 720, false)] }),
    sess('STAY', 'E06', { inMin: 400, out: 0, plans: [plan('m_stay_space_entry_4_hours', 240, true, 2)], headcount: 2, unpaidOt: 6 }),
    sess('STAY', 'E07', { inMin: 30, plans: [plan('m_stay_space_member_entry', 0, true)] }),
  ], summary: { entries: 9, people: 11, inside: 8, avg_stay_min: 263, overtime_amount: 150, overtime_entries: 2, plan_amount: 2400 } },
  REST: { sessions: [
    sess('REST', 'Q2', { inMin: 90, plans: [plan('m_rest_space_quiet_room_4_hours', 240, true)] }),
    sess('REST', 'Q5', { inMin: 485, plans: [plan('m_rest_space_quiet_room_4_hours', 240, true), { ...plan('m_rest_space_quiet_room_4_hours', 240, true), line: 'x2' }] }),
    sess('REST', 'E01', { inMin: 20, plans: [plan('m_rest_space_lounge_entry_4_hours', 240, true, 3)], headcount: 3 }),
  ], summary: { entries: 5, people: 7, inside: 5, avg_stay_min: 190, overtime_amount: 0, plan_amount: 3600 } },
};
// 約書旅 Q5 已滿 8 小時
DATA.REST.sessions[1].space.limit_hit = true;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/opt/hermes/tools/chromium-1208/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none', '--no-proxy-server'] });
const errs = [];
async function shot(name, venue, urlPath, w, h, prep) {
  const base = { STAY: '/staysquare', REST: '/restbook' }[venue], key = 'tth_pos_token_' + venue.toLowerCase();
  const state = { role: 'admin', super: false, brands: [venue], me: { email: 'pos@emoji.tw', name: 'POS' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
  const cfg = S.normalizeSettings('', venue), d = DATA[venue];
  const api = u => {
    const p = u.pathname;
    if (p === '/api/state') return state;
    if (p.startsWith('/api/pos-devices/')) return { bound: true };
    if (p === '/api/public') return { content: { menu: menuDoc } };
    if (p.startsWith('/api/admin/registers')) return { current: { [venue]: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
    if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
    if (p === '/api/admin/orders/space/settings') return { venue, settings: cfg, modes: S.MODE_LABEL };
    if (p === '/api/admin/payment-methods') return { payment_methods: [] };
    if (p === '/api/admin/orders') return { sessions: d.sessions, orders: [], tickets: [], reservations: {}, space_settings: cfg, space_summary: d.summary, payment_methods: [] };
    if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
    return {};
  };
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument((n, k) => { localStorage.setItem(k, 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, key);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
    const f = /^\/(atcafe|3am|staysquare|restbook)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto('https://pos.test' + base + urlPath, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (prep) { await prep(page); await new Promise(r => setTimeout(r, 400)); }
  const m = await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const small = [...document.querySelectorAll('.sp-card,.sp-plan-opt,.sp-bar .btn,#sp-enter,.sp-mode-opt')].filter(vis).map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.height < 44).length;
    const cut = [...document.querySelectorAll('.sp-card *, .sp-bar *, .sp-dialog *')].filter(e => vis(e) && e.children.length === 0 && e.scrollWidth > e.clientWidth + 1).length;
    return { overflowX: document.documentElement.scrollWidth - innerWidth, cards: document.querySelectorAll('.sp-card').length, bar: !!document.querySelector('.sp-bar'), dialog: !!document.querySelector('.sp-dialog'), mode: !!document.querySelector('.sp-mode'), serveTabHidden: (() => { const b = document.querySelector('#p-nav [data-tab=serve]'); return !b || getComputedStyle(b).display === 'none'; })(), placeHidden: (() => { const b = document.querySelector('#pos-place'); return !b || getComputedStyle(b).display === 'none'; })(), under44: small, textCut: cut, states: [...document.querySelectorAll('.sp-card [data-space-label]')].map(e => e.textContent).join('|') };
  });
  console.log(name.padEnd(22), JSON.stringify(m));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!prep?.full });
  await page.close();
}
await shot('stay-board-1180', 'STAY', '', 1180, 820);
await shot('stay-board-820', 'STAY', '', 820, 1180);
await shot('stay-e04-over-1180', 'STAY', '/table/E04', 1180, 820);
await shot('stay-e06-left-1180', 'STAY', '/table/E06', 1180, 820);
await shot('stay-enter-dialog', 'STAY', '', 1180, 820, p => p.evaluate(() => document.querySelector('#sp-enter').click()));
await shot('stay-settings', 'STAY', '/settings', 1180, 1400);
await shot('rest-board-1180', 'REST', '', 1180, 820);
await shot('rest-seat-dialog', 'REST', '', 1180, 820, p => p.evaluate(() => document.querySelector('[data-space-seat="Q1"]').click()));
await shot('rest-q5-limit', 'REST', '/table/Q5', 1180, 820);
await shot('stay-board-390', 'STAY', '', 390, 844);
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
