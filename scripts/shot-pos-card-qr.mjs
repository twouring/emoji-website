// POS 線上刷卡 QR（KK 11/17）截圖＋量測：等等空間未付入場單的「線上刷卡 QR」面板、付款 QR 彈窗、熱感紙付款 QR 單。不碰 DB。
// 用法：node scripts/shot-pos-card-qr.mjs <輸出目錄>（CHROME=<chrome 路徑>）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-card-qr'; fs.mkdirSync(OUT, { recursive: true });
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
const errs = [], posts = [];
const CQ = { id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', amount: 500, venue: 'STAY', table: 'E05', expires_at: new Date(NOW + 30 * 60e3).toISOString(), state: 'open' };
async function shot(name, venue, urlPath, w, h, prep, pending) {
  const base = { STAY: '/staysquare', REST: '/restbook' }[venue], key = 'tth_pos_token_' + venue.toLowerCase();
  const state = { role: 'admin', super: false, brands: [venue], me: { email: 'pos@emoji.tw', name: 'POS' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
  const cfg = S.normalizeSettings('', venue), d = DATA[venue];
  const sessions = d.sessions.map(s => s.table === 'E05' && pending ? { ...s, card_qr: CQ } : s);
  const api = (u, body) => {
    const p = u.pathname;
    if (p.endsWith('/card-qr')) { posts.push({ p, body }); return CQ; }
    if (p.endsWith('/card-qr/check')) return { ...CQ };
    if (p === '/api/state') return state;
    if (p.startsWith('/api/pos-devices/')) return { bound: true };
    if (p === '/api/public') return { content: { menu: menuDoc } };
    if (p.startsWith('/api/admin/registers')) return { current: { [venue]: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
    if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
    if (p === '/api/admin/orders/space/settings') return { venue, settings: cfg, modes: S.MODE_LABEL };
    if (p === '/api/admin/payment-methods') return { payment_methods: [] };
    if (p === '/api/admin/orders') return { sessions, orders: [], tickets: [], reservations: {}, space_settings: cfg, space_summary: d.summary, payment_methods: [] };
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
    if (u.pathname.startsWith('/api/')) { let b = null; try { b = JSON.parse(r.postData() || 'null'); } catch {} return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, b)) }); }
    const f = /^\/(atcafe|3am|staysquare|restbook)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto('https://pos.test' + base + urlPath, { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  let extra = {};
  if (prep) { extra = (await prep(page)) || {}; await new Promise(r => setTimeout(r, 600)); }
  const m = await page.evaluate(() => {
    const p = document.querySelector('.pos-cardqr'), b = document.querySelector('#pos-cardqr'), card = document.querySelector('.pos-cardqr-card');
    return { overflowX: document.documentElement.scrollWidth - innerWidth, panel: !!p, btn: b ? { text: b.textContent, h: Math.round(b.getBoundingClientRect().height), disabled: b.disabled } : null,
      checkoutDisabled: document.querySelector('#pos-checkout')?.disabled, popup: card ? { img: !!card.querySelector('img'), w: Math.round(card.getBoundingClientRect().width), h: Math.round(card.getBoundingClientRect().height), top: Math.round(card.getBoundingClientRect().top) } : null };
  });
  console.log(name.padEnd(22), JSON.stringify({ ...m, ...extra }));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await page.close();
}
const selectSource = p => p.evaluate(() => { document.querySelector('[data-source]')?.click(); });
const toPanel = p => p.evaluate(() => { document.querySelectorAll('.op-overlay').forEach(o => o.remove()); const e = document.querySelector('.pos-cardqr'); e?.scrollIntoView({ block: 'center' }); const r = e?.getBoundingClientRect(); const hit = r ? document.elementFromPoint(r.left + 20, r.top + 20) : null; return { panelTop: Math.round(r?.top || -1), panelBottom: Math.round(r?.bottom || -1), panelLeft: Math.round(r?.left || -1), hidden: !e?.offsetParent, hit: hit ? (hit.id || hit.className || hit.tagName) : null, inPanel: !!hit?.closest?.('.pos-cardqr'), parent: e?.parentElement?.className }; });
const pickCard = async p => { await p.evaluate(() => { document.querySelectorAll('.op-overlay').forEach(o => o.remove()); const r = document.querySelector('input[name=pos-method][value=card_qr]'); r.checked = true; r.dispatchEvent(new Event('change')); }); await new Promise(r => setTimeout(r, 300)); return p.evaluate(() => ({ methods: [...document.querySelectorAll('.pos-method b')].map(b => b.textContent), go: document.querySelector('#pos-checkout')?.textContent, hint: !!document.querySelector('.pos-cardqr-hint'), wraps: [...document.querySelectorAll('.pos-method')].filter(e => e.scrollWidth > e.clientWidth + 1).length, goCut: (() => { const b = document.querySelector('#pos-checkout'); return b.scrollWidth - b.clientWidth; })(), goRight: Math.round(document.querySelector('#pos-checkout').getBoundingClientRect().right), hintScrollable: (() => { const h = document.querySelector('.pos-cardqr-hint'); h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); const dock = document.querySelector('.pos-dock').getBoundingClientRect(); return { hintBottom: Math.round(r.bottom), dockTop: Math.round(dock.top) }; })() })); };
await shot('stay-e05-method-1180', 'STAY', '/table/E05', 1180, 820, pickCard);
await shot('stay-e05-method-820', 'STAY', '/table/E05', 820, 1180, pickCard);
await shot('stay-e05-click-1180', 'STAY', '/table/E05', 1180, 820, async p => { const m = await pickCard(p); await p.evaluate(() => document.querySelector('[data-source]')?.click()); await new Promise(r => setTimeout(r, 300)); await p.evaluate(() => document.querySelector('#pos-checkout').click()); await new Promise(r => setTimeout(r, 400)); return { ...m, pinPrompt: await p.evaluate(() => /操作人員/.test(document.querySelector('.op-overlay')?.textContent || '')) }; });
await shot('stay-e05-pending-1180', 'STAY', '/table/E05', 1180, 820, toPanel, true);
/* 熱感紙付款 QR 單：把 printCardQr 的 canvas 攔下存 PNG */
{
  const page = await browser.newPage(); await page.setViewport({ width: 600, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' }); const fp = path.join(PUB, u.pathname.slice(1)); if (!fs.existsSync(fp)) return r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><body>' }); r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) }); });
  await page.goto('https://pos.test/blank', { waitUntil: 'load' });
  await page.addScriptTag({ url: 'https://pos.test/vendor/qrcode.min.js' });
  const ops = fs.readFileSync(path.join(PUB, 'pos-ops.js'), 'utf8');
  const fnSrc = ops.slice(ops.indexOf('async function printCardQr(a){'), ops.indexOf('function cardQrReset(){'));
  const png = await page.evaluate(async (fnSrc, a) => {
    window.STAR_DOTS = 384; window.num = n => Number(n).toLocaleString('en-US'); window.BRAND_LABEL = { STAY: '等等空間', REST: '約書旅' }; window.SCOPE = 'STAY';
    window.canPrint = () => true; window.toast = () => {}; let got = null; window.starSend = async ({ canvas }) => { got = canvas; return true; };
    window.qrCanvas = (text, size) => new Promise(res => { const c = document.createElement('canvas'); QRCode.toCanvas(c, text, { margin: 0, width: size }, e => res(e ? null : c)); });
    (0, eval)(fnSrc + ';window.printCardQr=printCardQr;');
    await window.printCardQr(a);
    return got ? { url: got.toDataURL('image/png'), h: got.height } : null;
  }, fnSrc, CQ);
  if (png) { fs.writeFileSync(path.join(OUT, 'card-qr-slip.png'), Buffer.from(png.url.split(',')[1], 'base64')); console.log('slip height dots', png.h, 'mm', (png.h / 8).toFixed(1)); } else console.log('slip FAILED');
  await page.close();
}
console.log('posts', JSON.stringify(posts));
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
