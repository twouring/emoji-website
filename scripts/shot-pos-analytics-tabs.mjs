// POS「分析 → 星期／外國客」截圖＋量測（KK 11/15），不碰 DB。用法：node scripts/shot-pos-analytics-tabs.mjs <輸出目錄>
// 假資料用 lib/table-orders 真的 analyticsSummary／visitorSummary／foreignSummary 算，量橫向溢出、分頁切換、pageerror
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const T = require('../lib/table-orders.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || '/workspace/local/.tmp/pos-analytics-tabs'; fs.mkdirSync(OUT, { recursive: true });
const PUB = path.join(ROOT, 'public');
const type = f => ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
const NOW = Date.parse('2026-11-15T04:00:00Z');
const menuDoc = JSON.stringify({ version: 1, items: [] });
const state = { role: 'admin', super: true, brands: null, me: { email: 'kk@emoji.tw', name: 'KK' }, content: { menu: menuDoc }, users: [], commitments: [], entitlements: [], events: [], updates: [], payment_methods: [] };
// 假資料：11/1–11/14 每天在咖啡 6 桌、三點水 4 桌，部分外國客
const sess = [], orders = []; let n = 0;
const ITEMS = [['拿鐵', 'COFFEE', 150], ['鬆餅', 'FOOD', 220], ['檸檬塔', 'DESSERT', 160], ['精釀啤酒', 'BEER', 220], ['炸物拼盤', 'FOOD', 320]];
for (let d = 1; d <= 14; d++) {
  const day = `2026-11-${String(d).padStart(2, '0')}`;
  for (const [hh, venue] of [['09', 'CAFE'], ['10', 'CAFE'], ['12', 'CAFE'], ['13', 'CAFE'], ['14', 'CAFE'], ['15', 'CAFE'], ['19', 'BAR'], ['20', 'BAR'], ['21', 'BAR'], ['23', 'BAR']]) {
    n++; const id = 's' + n, size = 1 + (n % 4), foreign = n % 5 === 0 ? size : n % 7 === 0 ? 1 : 0;
    const created = new Date(`${day}T${hh}:10:00+08:00`).toISOString();
    sess.push({ id, table_no: 'A' + (n % 9 + 1), created_at: created, party_votes: d < 3 ? { __pos: size } : { __pos: size, __foreign: foreign } });
    const it = ITEMS[(n + (venue === 'BAR' ? 3 : 0)) % ITEMS.length], qty = size;
    orders.push({ id: 'o' + n, session_id: id, table_no: 'A1', status: 'paid', amount: it[2] * qty, paid_at: new Date(Date.parse(created) + 50 * 60e3), payer: { source: foreign ? ['google', 'ig', 'walk'][n % 3] : ['friend', 'regular', ''][n % 3] }, items: [{ item_id: it[0], zh: it[0], cat: it[1], venue, qty, price: it[2] }] });
  }
}
const from = '2026-11-01', to = '2026-11-14';
const analytics = { ...T.analyticsSummary(orders, { from, to }), visitors: T.visitorSummary(sess, { from, to }), foreign: T.foreignSummary(sess, orders, { from, to }) };
fs.writeFileSync(path.join(OUT, 'analytics.json'), JSON.stringify(analytics, null, 1));
function api(u) {
  const p = u.pathname;
  if (p === '/api/state') return state;
  if (p.startsWith('/api/pos-devices/')) return { bound: true };
  if (p === '/api/public') return { content: { menu: menuDoc } };
  if (p.startsWith('/api/admin/registers')) return { current: { CAFE: { opened_at: 'x', id: 'r1' } }, wait: {}, active_venue: 'CAFE' };
  if (p.startsWith('/api/admin/reservations')) return { pending: 0, reservations: [] };
  if (p === '/api/admin/analytics') return analytics;
  if (p === '/api/admin/orders') return { sessions: [], orders: [], tickets: [] };
  if (p.startsWith('/api/admin/orders')) return { pending: [], jobs: [] };
  return {};
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const report = [];
for (const [w, h, mobile] of [[1180, 820, false], [390, 844, true]]) {
  for (const kind of ['weekday', 'foreign']) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(n => { localStorage.setItem('tth_pos_token_cafe', 'x'); localStorage.setItem('tth_pos_device', 'dev-1'); const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [n])); } static now() { return n; } }; }, NOW);
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.hostname !== 'pos.test') return r.respond({ status: 404, body: '' });
      if (u.pathname.startsWith('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(api(u)) });
      const f = /^\/(analytics|atcafe|3am)(\/|$)/.test(u.pathname) || u.pathname === '/' ? 'pos.html' : u.pathname.slice(1);
      const fp = path.join(PUB, f); if (!fs.existsSync(fp)) return r.respond({ status: 404, body: '' });
      r.respond({ status: 200, contentType: type(fp), body: fs.readFileSync(fp) });
    });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(`https://pos.test/atcafe/analytics/${kind}`, { waitUntil: 'networkidle0' }).catch(() => {});
    await new Promise(r => setTimeout(r, 900));
    const m = await page.evaluate(() => ({
      path: location.pathname,
      kinds: [...document.querySelectorAll('[data-an-kind]')].map(b => b.dataset.anKind + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join(','),
      cards: [...document.querySelectorAll('#analytics-body .chart-card h3')].map(x => x.textContent),
      h3: [...document.querySelectorAll('#analytics-body > h3')].map(x => x.textContent),
      empty: document.querySelectorAll('#analytics-body .chart-card .a-empty').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      navOverflow: (n => n ? n.scrollWidth - n.clientWidth : null)(document.getElementById('p-nav')),
      kindsOverflow: (n => n ? n.scrollWidth - n.clientWidth : null)(document.querySelector('.an-kinds')),
      // 長條等比例：每張直條圖 高度/數值 的最大相對誤差（%），>3 表示被文字擠壓
      barSkew: Math.max(0, ...[...document.querySelectorAll('.chart-vbars')].map(g => { const r = [...g.querySelectorAll('.chart-vcol')].map(c => [Number(c.querySelector('.chart-vval').textContent.replace(/,/g, '')) || 0, c.querySelector('i').getBoundingClientRect().height]).filter(([v]) => v > 0); const mx = Math.max(...r.map(x => x[0])), hm = Math.max(...r.map(x => x[1])); return Math.max(0, ...r.map(([v, h]) => Math.abs(h / hm - v / mx) * 100)); })),
      barDump: [...document.querySelectorAll('.chart-vbars')].map(g => [...g.querySelectorAll('.chart-vcol')].map(c => c.querySelector('.chart-vval').textContent + ':' + Math.round(c.querySelector('i').getBoundingClientRect().height)).join(' ')),
      legendWrapped: [...document.querySelectorAll('.chart-legend li')].filter(li => li.getBoundingClientRect().height > 40).map(li => li.textContent),
      vvalOverlap: [...document.querySelectorAll('.chart-vbars')].some(g => { const ls = [...g.querySelectorAll('.chart-vval')].filter(x => x.textContent && x.offsetParent).map(x => x.getBoundingClientRect()); return ls.some((a, i) => i && a.left < ls[i - 1].right + 2); }),
      vlblOverlap: [...document.querySelectorAll('.chart-vbars')].some(g => { const ls = [...g.querySelectorAll('.chart-vlbl')].filter(x => x.textContent).map(x => x.getBoundingClientRect()); return ls.some((a, i) => i && a.left < ls[i - 1].right + 2); }),
    }));
    await page.addStyleTag({ content: 'html,body{height:auto!important;overflow:visible!important}body>main{overflow:visible!important;flex:none!important}' });   // main 自己捲動，撐開才截得到整頁
    await page.screenshot({ path: path.join(OUT, `${kind}-${w}.png`), fullPage: true });
    report.push({ w, kind, ...m, errs });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
