// 會員 App「共享空間」「貴賓室」分頁＋POS 掃碼進出／會員清單截圖與量測（KK 11/17，不碰 DB）。
// 用法：node scripts/shot-app-space-lounge.mjs <輸出目錄>（CHROME=<chrome 路徑>）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const S = require('../lib/pos-space.js');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/app-space-lounge'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-17T06:00:00Z');   // 台北 14:00
const at = m => new Date(NOW - m * 60e3).toISOString();
const plans = [
  { id: 'l1', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 1 小時', en: 'Lounge entry · 1 hour', ja: 'ラウンジ入場・1時間', price: 150, minutes: 60 },
  { id: 'l4', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 4 小時', en: 'Lounge entry · 4 hours', ja: 'ラウンジ入場・4時間', price: 450, minutes: 240 },
  { id: 'l8', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 8 小時', en: 'Lounge entry · 8 hours', ja: 'ラウンジ入場・8時間', price: 720, minutes: 480 },
  { id: 'q1', cat: 'QUIET', zh: '空間使用費｜靜讀室 1 小時', en: 'Quiet room · 1 hour', ja: '静読室・1時間', price: 250, minutes: 60 },
  { id: 'q4', cat: 'QUIET', zh: '空間使用費｜靜讀室 4 小時', en: 'Quiet room · 4 hours', ja: '静読室・4時間', price: 750, minutes: 240 },
  { id: 'q8', cat: 'QUIET', zh: '空間使用費｜靜讀室 8 小時', en: 'Quiet room · 8 hours', ja: '静読室・8時間', price: 1200, minutes: 480 }];
const passes = [
  { id: 'ts_1', item_id: 'l4', table: 'E03', status: 'open', created_at: at(30), name: '空間使用費｜貴賓室入場 4 小時', minutes: 240, state: 'ready' },
  { id: 'ts_2', item_id: 'q4', table: 'Q3', status: 'open', created_at: at(200), name: '空間使用費｜靜讀室 4 小時', minutes: 240, state: 'inside', in_at: at(90), due_at: new Date(NOW + 150 * 60e3).toISOString() }];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/opt/hermes/tools/chromium-1208/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none', '--no-proxy-server'] });
const errs = [];

/* ---- App ---- */
async function app(w, name, { lang = 'zh', guest = false, tab = 'lounge', full = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((n, l, g) => { if (g) { localStorage.removeItem('tth_token'); localStorage.removeItem('m_cache'); } else localStorage.setItem('tth_token', 'tok'); localStorage.setItem('m_lang', l); localStorage.setItem('m_installed', '1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, lang, guest);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url()), p = u.pathname;
    if (u.hostname !== 'app.emoji.tw') return r.respond({ status: 404, body: '' });
    const j = b => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === '/sso-client.js') return r.respond({ status: 200, contentType: 'application/javascript', body: '' });   // 訪客不跳 SSO
    if (p === '/api/state') return j({ me: { id: 'u_a', name: '小美', email: 'a@x' }, events: [], updates: [], access: { active: true, activeEntitlements: [{ id: 'en1', plan: 'month', starts_at: at(60 * 24 * 5), ends_at: new Date(NOW + 864e5 * 25).toISOString() }], pending: [], entitlements: [{ id: 'en1', plan: 'month' }] }, commitments: [] });
    if (p === '/api/me/lounge') return j({ ok: true, passes, plans, stripe: true });
    if (p === '/api/lounge/plans') return j({ plans });
    if (p === '/api/events') return j({ events: [], past: [] });
    if (p === '/api/me/yan') return j({ balance: 120 });
    if (p.startsWith('/api/')) return j({});
    const f = p === '/' ? 'm.html' : p.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto('https://app.emoji.tw/' + (lang === 'zh' ? '' : '?lang=' + lang), { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 900));
  await page.waitForFunction(t => { const b = document.querySelector(`nav.tabs [data-tab="${t}"]`); return b && !document.getElementById('tabs').hidden; }, { timeout: 8000 }, tab).catch(() => {});
  await page.evaluate(t => document.querySelector(`nav.tabs [data-tab="${t}"]`)?.click(), tab);
  await new Promise(r => setTimeout(r, 500));
  const m = await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const tabs = [...document.querySelectorAll('nav.tabs button')].map(b => ({ t: b.innerText.trim(), w: Math.round(b.getBoundingClientRect().width), lines: Math.round(b.querySelector('span').getBoundingClientRect().height / parseFloat(getComputedStyle(b.querySelector('span')).lineHeight)), over: b.querySelector('span').scrollWidth > b.querySelector('span').clientWidth + 1 }));
    const small = [...document.querySelectorAll('#app button,#app a.btn')].filter(vis).filter(b => b.getBoundingClientRect().height < 44).map(b => b.innerText.trim().slice(0, 20));
    return { overflowX: document.documentElement.scrollWidth - innerWidth, h1: document.querySelector('.hello h1')?.innerText, by: document.querySelector('.hello small')?.innerText, tabs, buy: [...document.querySelectorAll('[data-lounge]')].map(b => b.innerText), passes: [...document.querySelectorAll('.tile.ag h3')].map(x => x.innerText), pills: [...document.querySelectorAll('.tile.ag .pill')].map(x => x.innerText), small };
  });
  console.log(name.padEnd(20), JSON.stringify(m));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  await page.close();
}
for (const w of [390, 320]) { await app(w, `app-lounge-${w}`); await app(w, `app-space-${w}`, { tab: 'plan' }); await app(w, `app-home-${w}`, { tab: 'home', full: false }); }
await app(390, 'app-lounge-390-en', { lang: 'en' });
await app(390, 'app-lounge-390-ja', { lang: 'ja' });
await app(390, 'app-lounge-guest-390', { guest: true });

/* ---- POS ---- */
const items = S.STAY_ITEMS.map(x => ({ ...x }));
items.push({ id: 'm_rest_space_lounge_entry_4_hours', venue: 'REST', cat: 'LOUNGE', zh: '空間使用費｜貴賓室入場 4 小時', price: 450, published: true, pos_only: true, space_role: 'plan', space_minutes: 240 });
const menuDoc = JSON.stringify({ version: 1, items });
const sess = (venue, table, sp, lines) => { const s = { id: 'ts_' + table.toLowerCase().padEnd(16, '0'), table, items: lines, space: sp }; const unpaid = lines.filter(l => !l.order_id);
  return { id: s.id, table, takeout: false, state: 'eating', lines: unpaid, paid_lines: [], unpaid: unpaid.length, unpaid_amount: unpaid.reduce((a, l) => a + l.price * l.qty, 0), created_at: at(60), updated_at: at(1), pay_requests: [], members: [], space: S.view(s, S.normalizeSettings('', venue), NOW) }; };
const pl = (id, min, price) => ({ line: 'l' + id.slice(-5), item_id: id, zh: items.find(x => x.id === id).zh, cat: items.find(x => x.id === id).cat, venue: 'REST', qty: 1, price, space_role: 'plan', space_minutes: min, order_id: 'to_x' });
const DATA = {
  REST: [sess('REST', 'E03', { seat: '', headcount: 1, in_at: null, prepaid: true, online: true, member_name: '小美' }, [pl('m_rest_space_lounge_entry_4_hours', 240, 450)]),
    sess('REST', 'E01', { seat: '', headcount: 1, in_at: at(40) }, [pl('m_rest_space_lounge_entry_4_hours', 240, 450)])],
  STAY: [sess('STAY', 'E01', { seat: '', headcount: 1, in_at: at(80), member_id: 'u_a', member_name: '小美' }, [{ line: 'lm', item_id: 'm_stay_space_member_entry', zh: '會員入場', cat: 'SPACE', venue: 'STAY', qty: 1, price: 0, space_role: 'plan', space_minutes: 0, order_id: 'to_m' }])],
};
const MEMBERS = [
  { id: 'en1', name: '小美', phone: '0912***678', plan: 'month', plan_label: '月會員', source: 'stripe', purchased_at: at(60 * 24 * 3), ends_at: new Date(NOW + 864e5 * 27).toISOString(), state: 'active', inside: true },
  { id: 'en2', name: '阿寶', phone: '0933***111', plan: 'day_4h', plan_label: '單日 4 小時', source: 'stripe', purchased_at: at(50), ends_at: null, state: 'pending', inside: false },
  { id: 'en3', name: 'Ken', phone: '', plan: 'year_promo', plan_label: '開幕優惠 年會員 18 個月', source: 'pos-manual', purchased_at: at(60 * 24 * 10), ends_at: new Date(NOW + 864e5 * 500).toISOString(), state: 'active', inside: false }];
async function pos(name, venue, urlPath, w, h, prep) {
  const base = { STAY: '/staysquare', REST: '/restbook' }[venue], key = 'tth_pos_token_' + venue.toLowerCase();
  const state = { role: 'admin', super: false, brands: [venue], me: { email: 'pos@emoji.tw', name: 'POS' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
  const cfg = S.normalizeSettings('', venue);
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument((n, k) => { localStorage.setItem(k, 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, key);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url()), p = u.pathname, j = b => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (p === '/api/state') return j(state);
    if (p.startsWith('/api/pos-devices/')) return j({ bound: true });
    if (p === '/api/public') return j({ content: { menu: menuDoc } });
    if (p.startsWith('/api/admin/registers')) return j({ current: { [venue]: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' });
    if (p.startsWith('/api/admin/reservations')) return j({ pending: 0, reservations: [] });
    if (p === '/api/admin/orders/space/settings') return j({ venue, settings: cfg, modes: S.MODE_LABEL });
    if (p === '/api/admin/orders/space/members') return j({ venue, members: MEMBERS });
    if (p === '/api/admin/orders') return j({ sessions: DATA[venue], orders: [], tickets: [], reservations: {}, space_settings: cfg, space_summary: { people: 3, inside: 2, avg_stay_min: 120, overtime_amount: 0 }, payment_methods: [] });
    if (p.startsWith('/api/')) return j({ pending: [], jobs: [] });
    const f = /^\/(atcafe|3am|staysquare|restbook)(\/|$)/.test(p) ? 'pos.html' : p.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto('https://pos.test' + base + urlPath, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 900));
  if (prep) { await prep(page); await new Promise(r => setTimeout(r, 500)); }
  const m = await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const head = [...document.querySelectorAll('.sp-head-acts .btn')].filter(vis).map(b => { const r = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(r.height), Math.round(r.top)]; });
    return { overflowX: document.documentElement.scrollWidth - innerWidth, head, cards: [...document.querySelectorAll('.sp-card')].map(c => c.innerText.replace(/\s+/g, ' ').slice(0, 50)), bar: document.querySelector('.sp-bar-acts')?.innerText.replace(/\s+/g, ' '), members: document.querySelectorAll('.sp-mem').length, scan: !!document.querySelector('.pos-scan-full') };
  });
  console.log(name.padEnd(20), JSON.stringify(m));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await page.close();
}
await pos('pos-rest-board', 'REST', '', 1180, 820);
await pos('pos-rest-e03', 'REST', '/table/E03', 1180, 820);
await pos('pos-stay-board', 'STAY', '', 1180, 820);
await pos('pos-stay-board-390', 'STAY', '', 390, 844);
await pos('pos-stay-members', 'STAY', '', 1180, 820, p => p.evaluate(() => document.querySelector('#sp-members').click()));
await pos('pos-stay-scan', 'STAY', '', 1180, 820, p => p.evaluate(() => document.querySelector('#sp-scan').click()));
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
