// 編輯桌位畫面截圖（不碰 DB）：iPad 橫放／直放，量「完成」鈕是否在可視範圍、點得到。
// 用法：node scripts/shot-table-edit.mjs <輸出目錄>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/table-edit-shots'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(f)] || 'application/octet-stream');
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: {}, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
let saved = null;
function api(u, method, body) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p.includes('table-layout')) { if (method !== 'GET') saved = body; return { ok: true }; }
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/orders')) return { sessions: [], orders: [], tables: [], pending: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
let fail = 0;
for (const [w, h, name] of [[1180, 820, 'ipad-air-land'], [1180, 700, 'ipad-air-land-safari'], [1024, 768, 'ipad-land'], [1024, 640, 'ipad-land-safari'], [1366, 1024, 'ipad-pro-land'], [1366, 900, 'ipad-pro-land-safari'], [820, 1180, 'ipad-port']]) {
  saved = null;
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tth_token', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
    if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u, r.method(), r.postData())) });
    const f = u.pathname === '/pos' || u.pathname.startsWith('/pos/') ? 'pos.html' : u.pathname.slice(1);
    const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('https://pos.test/pos', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => document.getElementById('pos-edit-tables')?.click());
  await new Promise(r => setTimeout(r, 400));
  const m = await page.evaluate(() => {
    const b = document.getElementById('pos-edit-done'); if (!b) return { missing: true };
    // 使用者能做的就是捲動：把所有可捲容器捲到底，再看按鈕
    for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
    const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const sec = b.closest('.pos-tables').getBoundingClientRect(); const clipped = r.bottom > sec.bottom + 1;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, visible: r.bottom <= innerHeight && r.top >= 0 && !clipped, clipped, secBottom: Math.round(sec.bottom), secOverflow: getComputedStyle(b.closest('.pos-tables')).overflowY, hit: hit === b || b.contains(hit), hitEl: hit && (hit.id || hit.className) };
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  let clicked = false;
  if (m.visible && m.hit) { await page.tap('#pos-edit-done').catch(() => {}); await new Promise(r => setTimeout(r, 300)); clicked = saved !== null; }
  const ok = m.visible && m.hit && clicked;
  if (!ok) fail++;
  console.log(name, `${w}x${h}`, JSON.stringify(m), 'saved:', clicked, ok ? 'OK' : 'FAIL', errs.length ? errs : '');
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
