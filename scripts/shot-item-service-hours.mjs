// 品項每日供應時段（KK 11/22）：客人點餐頁（demo 模式，不建單）與 POS 在 10:59／11:00／13:59／14:00／隔日 11:00 的實際畫面＋量測。不碰 DB。
// 用法：node scripts/shot-item-service-hours.mjs <輸出目錄> <public.json>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '..');
const [OUT, PUBFILE] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' }[path.extname(f)] || 'application/octet-stream');
const ID = 'm_hzlpmwnu';
const pub = JSON.parse(fs.readFileSync(PUBFILE, 'utf8'));
const doc = typeof pub.content.menu === 'string' ? JSON.parse(pub.content.menu) : pub.content.menu;
doc.items = doc.items.map(it => it.id === ID ? { ...it, hours_from: '11:00', hours_to: '14:00' } : it);
const menuDoc = JSON.stringify(doc);
const pubBody = JSON.stringify({ ...pub, content: { ...pub.content, menu: menuDoc } });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [], invoice: { configured: true } };
const sess = { id: 'ts_0000000000000001', table: 'A3', takeout: false, state: 'eating', lines: [], unpaid: 0, unpaid_amount: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), party_size: 2, pay_requests: [], members: [] };
function posApi(p) {
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return JSON.parse(pubBody);
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/orders') return { sessions: [sess], orders: [], tables: ['A1', 'A2', 'A3'], tickets: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/.pw/chrome-linux/headless_shell', args: ['--no-sandbox', '--lang=zh-TW'] });
const errs = [];
// 時鐘：從 start 起跟著真實時間走（可驗不重整頁面跨過 14:00）
const clock = start => `(()=>{const R=Date,T0=R.now(),S=${start};globalThis.Date=class extends R{constructor(...a){super(...(a.length?a:[S+R.now()-T0]));}static now(){return S+R.now()-T0;}};})()`;
async function newPage(start, host, api) {
  const page = await browser.newPage();
  const writes = [];
  await page.evaluateOnNewDocument(clock(start));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('order_lang', 'zh'); localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== host) return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) {
      if (r.method() !== 'GET') writes.push(r.method() + ' ' + u.pathname);
      const body = api(u.pathname);
      return r.respond({ status: body === null ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
    }
    const f = u.pathname === '/order' ? 'order.html' : /^\/(atcafe|3am)(\/|$)/.test(u.pathname) ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  page.on('pageerror', e => errs.push(host + ': ' + e.message));
  return { page, writes };
}
const T = (d, hm) => Date.parse(`${d}T${hm}:00+08:00`);
const orderApi = p => p === '/api/public' ? JSON.parse(pubBody) : p === '/api/orders/config' ? { tappay: null, vapid_public_key: null, review_urls: {} } : null;
async function orderCheck(name, start) {
  const { page, writes } = await newPage(start, 'demo.test', orderApi);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('https://demo.test/order?store=atcafe', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 700));
  const r = await page.evaluate(id => ({ shown: !!document.querySelector(`[data-open-item="${id}"]`), items: document.querySelectorAll('[data-open-item]').length }), ID);
  await page.evaluate(id => document.querySelector(`[data-open-item="${id}"]`)?.scrollIntoView({ block: 'center' }), ID);
  await page.screenshot({ path: path.join(OUT, 'order-' + name + '.png') });
  await page.close();
  return { ...r, writes };
}
async function posCheck(name, start) {
  const { page, writes } = await newPage(start, 'pos.test', posApi);
  await page.setViewport({ width: 1180, height: 820 });
  await page.goto('https://pos.test/atcafe/table/A3', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 900));
  const tile = async () => page.evaluate(id => { const b = document.querySelector(`.pos-item[data-add="${id}"]`); return b ? { off: b.classList.contains('off'), tag: b.querySelector('small')?.textContent || '', price: b.querySelector('span')?.textContent || '' } : null; }, ID);
  const t = await tile();
  await page.evaluate(id => { const b = document.querySelector(`.pos-item[data-add="${id}"]`); b?.scrollIntoView({ block: 'center' }); b?.click(); }, ID);
  await new Promise(r => setTimeout(r, 600));
  const after = await page.evaluate(() => ({ toast: [...document.querySelectorAll('.toast,#toast,[role=status]')].map(e => e.textContent.trim()).filter(Boolean).join('｜').slice(0, 80), optionsOpen: !!document.querySelector('.pos-opt-panel,.op-overlay,[data-opt-ok]') }));
  await page.screenshot({ path: path.join(OUT, 'pos-' + name + '.png') });
  await page.close();
  return { tile: t, ...after, writes };
}
const cases = [['1059', T('2026-11-23', '10:59')], ['1100', T('2026-11-23', '11:00')], ['1359', T('2026-11-23', '13:59')], ['1400', T('2026-11-23', '14:00')], ['next-0030', T('2026-11-24', '00:30')], ['next-1059', T('2026-11-24', '10:59')], ['next-1100', T('2026-11-24', '11:00')]];
for (const [n, t] of cases) console.log('order', n.padEnd(10), JSON.stringify(await orderCheck(n, t)));
for (const [n, t] of cases.filter(c => c[0] !== 'next-0030')) console.log('pos  ', n.padEnd(10), JSON.stringify(await posCheck(n, t)));
// 不重整：13:59:50 開頁，等過 14:00 看點餐頁（30 秒輪）與 POS（重畫）有沒有自己切掉
{
  const { page } = await newPage(T('2026-11-23', '13:59') + 50e3, 'demo.test', orderApi);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('https://demo.test/order?store=atcafe', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  const before = await page.evaluate(id => !!document.querySelector(`[data-open-item="${id}"]`), ID);
  await new Promise(r => setTimeout(r, 42e3));
  const after = await page.evaluate(id => ({ shown: !!document.querySelector(`[data-open-item="${id}"]`), now: new Date().toTimeString().slice(0, 8) }), ID);
  console.log('order live 13:59:50→14:00:3x', JSON.stringify({ before, after }));
  await page.close();
}
console.log(errs.length ? 'ERR ' + errs.join(' | ') : 'no-errors');
await browser.close();
