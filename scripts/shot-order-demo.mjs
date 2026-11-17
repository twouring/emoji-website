// 金流審核示範連結截圖：node scripts/shot-order-demo.mjs <outdir> <public.json> <config.json>
// 只攔 /api/public 與 /api/orders/config；其他 /api/* 一被呼叫就記錄（demo 不該打任何寫入 API）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [out, pubFile, cfgFile] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const browser = await puppeteer.launch({ executablePath: '/workspace/local/.pw/chrome-linux/headless_shell', args: ['--no-sandbox', '--lang=zh-TW'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => { localStorage.setItem('order_lang', 'zh'); });
const hits = [];
await page.setRequestInterception(true);
page.on('request', r => {
  const u = new URL(r.url());
  if (u.hostname !== 'demo.test') return r.continue();
  if (u.pathname === '/api/public') return r.respond({ status: 200, contentType: 'application/json', body: fs.readFileSync(pubFile) });
  if (u.pathname === '/api/orders/config') return r.respond({ status: 200, contentType: 'application/json', body: fs.readFileSync(cfgFile) });
  if (u.pathname.startsWith('/api/')) { hits.push(r.method() + ' ' + u.pathname); return r.respond({ status: 404, contentType: 'application/json', body: '{}' }); }
  let p = u.pathname === '/order' ? '/order.html' : u.pathname;
  const f = path.join(root, p);
  if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' });
  r.respond({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('https://demo.test/order?demo=tappay', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 800));
// 稱呼關卡
if (await page.$('#name-in:not([hidden])')) { await page.type('#name-in', '審核'); await page.evaluate(() => { const b = document.querySelector('#name-gate form button[type=submit], #name-ok, #name-gate .btn'); b && b.click(); }); }
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => { const b = document.querySelector('#policy-ok'); if (b && !document.querySelector('#policy').classList.contains('hidden')) b.click(); });
await page.screenshot({ path: path.join(out, '01_menu.png') });
const items = await page.$$eval('[data-open-item]', a => a.slice(0, 3).map(x => x.dataset.openItem));
console.log('menu items', (await page.$$('[data-open-item]')).length);
// 加第一個非套餐品項
for (const id of items) {
  await page.evaluate(id => document.querySelector(`[data-open-item="${id}"]`).click(), id);
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { document.querySelectorAll('#detail-body .choice-grid').forEach(g => { const i = g.querySelector('input'); if (i && !g.querySelector('input:checked')) i.click(); }); });
  await page.screenshot({ path: path.join(out, '02_item.png') });
  await page.click('#detail-add');
  await new Promise(r => setTimeout(r, 600));
  const n = await page.evaluate(() => document.querySelector('#bar-total')?.textContent);
  if (n && n !== 'NT$0') break;
}
await page.screenshot({ path: path.join(out, '03_bar.png') });
await page.evaluate(() => document.querySelector('#open-cart').click());
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: path.join(out, '04_cart.png') });
await page.evaluate(() => document.querySelector('#cart-place').click());
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(out, '05_confirm.png') });
await page.evaluate(() => document.querySelector('#place-ok-go').click());
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.querySelector('#open-cart').click());
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: path.join(out, '06_placed.png') });
const st = await page.evaluate(() => ({ total: document.querySelector('#cart-total')?.textContent, tags: [...document.querySelectorAll('#cart-lines .tag')].map(t => t.textContent), overflow: document.documentElement.scrollWidth - innerWidth }));
console.log(JSON.stringify({ st, hits, errs }));
await browser.close();
