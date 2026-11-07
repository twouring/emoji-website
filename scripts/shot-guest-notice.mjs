// POS 通知客人截圖（不碰 DB）：POS 在咖啡 A3 左欄「通知」→ 彈窗選「餐點要等」；客人點餐頁收到通知跳出＋常駐列（390／320，中英）。
// 用法：node scripts/shot-guest-notice.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/guest-notice-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' })[path.extname(f)] || 'application/octet-stream';
const NOW = Date.parse('2026-11-07T04:30:00Z');   // 台北 12:30 在咖啡
const menuDoc = JSON.stringify({ version: 1, items: [{ id: 'm1', venue: 'CAFE', cat: 'FOOD', zh: '雞腿飯', en: 'Chicken rice', price: 220, published: true }] });
const line = { line: 'l1', item_id: 'm1', zh: '雞腿飯', en: 'Chicken rice', price: 220, qty: 1, venue: 'CAFE', by: '小明', placed_at: new Date(NOW - 20 * 60e3).toISOString(), ticket: 'tk_1' };
const notices = [{ id: 'gn_1', kind: 'wait', minutes: 10, at: new Date(NOW - 30e3).toISOString() }];
const session = { id: 'ts_0000000000000001', table: 'A3', status: 'open', items: [{ ...line, mine: true }], orders: [], total_unpaid: 220, pay_request: null, notices };
const posSession = { id: 'ts_0000000000000001', table: 'A3', takeout: false, unpaid: 1, unpaid_amount: 220, lines: [line], state: 'ordering', created_at: new Date(NOW - 40 * 60e3).toISOString(), updated_at: new Date(NOW).toISOString(), operator: '小美', party_size: 2, kids: 0, foreign: 0, members: [], pay_requests: [], last_notice: { kind: 'delay', at: new Date(NOW - 15 * 60e3).toISOString(), text: '不好意思，今天比較忙，餐點會晚一點送到，請稍候。', by: '小美' } };
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
const posted = [];
function api(u, method, body) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p.endsWith('/notice')) { posted.push(JSON.parse(body || '{}')); return { ok: true, table: 'A3', notice: {}, text: '不好意思，餐點需要再等約 15 分鐘，請稍候。' }; }
  if (p === '/api/orders/table' || p.startsWith('/api/orders/ts_')) return session;
  if (p === '/api/orders/config') return { tappay: null, vapid_public_key: null };
  if (p === '/api/orders/pause') return { venue: 'CAFE', paused: null };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p === '/api/songs') return { enabled: false };
  if (p === '/api/service-calls') return { kinds: [], open: [], recent_done: [], cooldown: 0 };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x' } }, registers: [{ venue: 'CAFE', closed_at: null }], wait: {}, active_venue: 'CAFE' };
  if (p === '/api/admin/orders') return { sessions: [posSession], orders: [], tickets: [], tables: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], items: [], jobs: [] };
  return {};
}
const exe = ['/workspace/local/.pw/chrome-linux/headless_shell', '/workspace/local/brand-chrome/chrome-linux64/chrome'].find(f => fs.existsSync(f));
const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--font-render-hinting=none'] });
async function shot(url, w, h, name, { lang = 'zh', act = null, mobile = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((n, lang) => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); localStorage.setItem('order_name', '小明'); localStorage.setItem('order_guest', 'abcdef0123456789'); localStorage.setItem('order_lang', lang); localStorage.setItem('order_inst_x', String(n));
    const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW, lang);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (/fonts\.(googleapis|gstatic)/.test(u.hostname)) return r.respond({ status: 200, contentType: 'text/css', body: '' });
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method(), r.postData())) });
    const f = /^\/atcafe(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname === '/order' ? 'order.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (act) await act(page);
  await new Promise(r => setTimeout(r, 400));
  const m = await page.evaluate(() => {
    const q = s => document.querySelector(s), box = s => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
    return { overflow: document.documentElement.scrollWidth - innerWidth, noticeBtn: box('#pos-notice'), noticeBtnText: q('#pos-notice')?.innerText, actions: [...document.querySelectorAll('.pos-table-actions .btn')].map(b => b.innerText.trim() + ':' + Math.round(b.getBoundingClientRect().width)), card: box('.pos-notice-card'), preview: q('[data-notice-preview]')?.textContent, pop: q('#notice-pop')?.classList.contains('on'), popText: q('#notice-pop-text')?.textContent, bar: q('#notice-bar') && !q('#notice-bar').hidden ? q('#notice-bar').innerText : null };
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(name, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : '');
  await page.close();
}
const openDlg = async page => { await page.click('#pos-notice'); await new Promise(r => setTimeout(r, 300)); await page.click('[data-notice-kind="wait"]'); await page.click('[data-notice-m="15"]'); };
await shot('https://pos.test/atcafe/table/A3', 1180, 820, 'pos-1180');
await shot('https://pos.test/atcafe/table/A3', 1180, 820, 'pos-1180-dialog', { act: openDlg });
await shot('https://pos.test/atcafe/table/A3', 390, 844, 'pos-390-dialog', { act: openDlg, mobile: true });
await shot('https://pos.test/atcafe/table/A3', 1180, 820, 'pos-send', { act: async p => { await openDlg(p); await p.click('[data-notice-ok]'); } });
console.log('POSTED', JSON.stringify(posted));
const orderUrl = 'https://pos.test/order?s=ts_0000000000000001&k=x';
for (const [w, lang] of [[390, 'zh'], [320, 'zh'], [390, 'en'], [390, 'ja']]) await shot(orderUrl, w, 844, `order-${w}-${lang}-pop`, { lang, mobile: true });
await shot(orderUrl, 390, 844, 'order-390-zh-bar', { mobile: true, act: async p => { await p.click('#notice-pop-ok'); } });
await browser.close();
