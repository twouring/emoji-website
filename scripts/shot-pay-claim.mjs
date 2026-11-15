// scripts/shot-pay-claim.mjs <輸出目錄> — 品牌 POS 日結頁「營業時間外收款」截圖與量測（KK 11/15）：假 /admin/sales 資料，不碰 DB／中信
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const C = require('../lib/ctbc.js');
const L = require('../lib/linepay.js');
const out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const root = path.resolve(import.meta.dirname, '..');
// 後台表格／KPI 樣式寫在 pos.html 的內嵌 <style>，一起帶進測試頁
const posStyle = (fs.readFileSync(path.join(root, 'public/pos.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/g) || []).join('');
const row = o => ({ TxDate: '20261029', TxExtend: '0', '交易日期': '2026/10/29 14:23:05', '卡號': '411111******1234', '交易金額': '300', '交易類別': '0 - 銷售', '授權碼': 'A1B2C3', '交易進度': '交易成功', '行動裝置使用者': 'A01', ...o });
const txs = [C.normalize(row({ TxEjfNo: '1' })), C.normalize(row({ TxEjfNo: '2', '交易日期': '2026/10/29 19:40:00', '交易金額': '520', '授權碼': 'Z9Y8X7' })), C.normalize(row({ TxEjfNo: '3', '交易日期': '2026/10/29 20:05:00', '交易金額': '120', '交易類別': '3 - 銷售取消' }))];
const orders = [{ status: 'paid', amount: 300, payer: { method: 'ctbc' }, items: [{ venue: 'CAFE' }] }, { status: 'paid', amount: 520, payer: { method: 'ctbc' }, items: [{ venue: 'BAR' }] }];
const registers = [{ venue: 'CAFE', opened_at: '2026-10-29T08:00:00+08:00', closed_at: '2026-10-29T17:00:00+08:00' }, { venue: 'BAR', opened_at: '2026-10-29T18:00:00+08:00', closed_at: null }];
const lpTx = [{ id: 'LP1', type: 'PAYMENT', amount: 180, paid_at: '2026-10-29T17:35:00+08:00', method: 'CREDIT_CARD', card_last4: '7411' }, { id: 'LP2', type: 'PAYMENT', amount: 260, paid_at: '2026-10-29T07:50:00+08:00', method: 'IPASS', claim_venue: 'STAY' }, { id: 'LP3', type: 'PAYMENT', amount: 420, paid_at: '2026-10-29T12:10:00+08:00', method: 'CREDIT_CARD', card_last4: '0088' }, { id: 'LP4', type: 'PAYMENT', amount: 90, paid_at: '2026-10-29T13:00:00+08:00', method: 'IPASS', claim_venue: 'STAY', claim_reason: '本店客人付款，別店已先開帳' }];
const lp = L.reconcile([], lpTx, { venues: ['STAY'], registers });
const ct = C.reconcile(orders, txs, { venues: ['STAY'], registers });
const sales = { day: '2026-10-29', orders: 2, amount: 820, by_method: { ctbc: 820 }, by_hour: { 14: 300, 19: 520 }, items: [], csv: [], linepay: { ...lp, configured: true, synced_at: '2026-10-29T08:15:00Z', csv: [] }, ctbc: { ...ct, configured: true, synced_at: '2026-10-29T08:15:00Z', sync_error: null, csv: C.csvRows(ct.rows) } };
const server = http.createServer((req, res) => {
  const files = { '/style.css': 'public/style.css', '/pos-ops.js': 'public/pos-ops.js', '/pos-ops.css': 'public/pos-ops.css', '/menu-lib.js': 'public/menu-lib.js' };
  if (files[req.url]) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(root, files[req.url]))); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pos-ops.css">${posStyle}<body><main><div class="a-sec" id="sales-body"></div></main>
<script>window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=n=>Number(n||0).toLocaleString('en-US');window.applicationTime=s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});window.opsHref=s=>s;window.toast=m=>{};window.downloadCSV=()=>{};window.SCOPE='STAY';window.DATA={payment_methods:[]};window.BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'};
window.__calls=[];window.api=async(p,o)=>{if(p.includes('/claim')){window.__calls.push([p,o&&o.body]);return {ok:true};}if(p.startsWith('/admin/sales?'))return ${JSON.stringify(sales)};throw Error('x');};</script><script src="/menu-lib.js"></script><script src="/pos-ops.js"></script><script>SALES_DAY='2026-10-29';loadSales().then(()=>{document.querySelector('#sales-body details').open=true;window.done=1;});</script>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
const errors = [];
try {
  for (const w of [1180, 390]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: 900 });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction('window.done===1', { timeout: 15000 });
    const m = await page.evaluate(() => { const h = document.getElementById('pay-outside'); h.scrollIntoView(); const t = h.parentElement; const d = document.getElementById('pay-others'); if (d) d.open = true; return { others: d ? d.querySelectorAll('tbody tr').length : -1, rows: [...t.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()), claim: t.querySelectorAll('[data-pay-claim]').length, release: t.querySelectorAll('[data-pay-release]').length, overflow: document.documentElement.scrollWidth - innerWidth, small: [...t.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 32).length }; });
    console.log(w, JSON.stringify(m));
    const box = await (await page.$('#pay-outside')).boundingBox();
    await page.screenshot({ path: path.join(out, `pay-claim-${w}.png`), clip: { x: 0, y: Math.max(0, box.y - 10), width: w, height: 640 }, captureBeyondViewport: true });
    await page.evaluate(() => document.querySelector('[data-pay-claim]:not([data-from])').click());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => document.querySelector('[data-pay-claim][data-from]').click());
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(out, `pay-claim-reason-${w}.png`) });
    await page.evaluate(() => document.querySelector('[data-reason]').click());
    await new Promise(r => setTimeout(r, 300)); console.log('click', JSON.stringify(await page.evaluate(() => window.__calls)));
    await page.close();
  }
  console.log('pageerror', errors.length ? errors : 0);
} finally { await browser.close(); server.close(); }
