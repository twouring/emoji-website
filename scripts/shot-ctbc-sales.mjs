// scripts/shot-ctbc-sales.mjs <輸出目錄> — 日結頁「信用卡對帳（中信）」截圖與量測：假 /admin/sales 資料，不碰 DB／中信
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const C = require('../lib/ctbc.js');
const out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const root = path.resolve(import.meta.dirname, '..');
// 後台表格／KPI 樣式寫在 pos.html 的內嵌 <style>，一起帶進測試頁
const posStyle = (fs.readFileSync(path.join(root, 'public/pos.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/g) || []).join('');
const row = o => ({ TxDate: '20261029', TxExtend: '0', '交易日期': '2026/10/29 14:23:05', '卡號': '411111******1234', '交易金額': '300', '交易類別': '0 - 銷售', '授權碼': 'A1B2C3', '交易進度': '交易成功', '行動裝置使用者': 'A01', ...o });
const txs = [C.normalize(row({ TxEjfNo: '1' })), C.normalize(row({ TxEjfNo: '2', '交易日期': '2026/10/29 19:40:00', '交易金額': '520', '授權碼': 'Z9Y8X7' })), C.normalize(row({ TxEjfNo: '3', '交易日期': '2026/10/29 20:05:00', '交易金額': '120', '交易類別': '3 - 銷售取消' }))];
const orders = [{ status: 'paid', amount: 300, payer: { method: 'ctbc' }, items: [{ venue: 'CAFE' }] }, { status: 'paid', amount: 520, payer: { method: 'ctbc' }, items: [{ venue: 'BAR' }] }];
const registers = [{ venue: 'CAFE', opened_at: '2026-10-29T00:00:00Z', closed_at: '2026-10-29T09:00:00Z' }, { venue: 'BAR', opened_at: '2026-10-29T09:00:00Z', closed_at: null }];
const ct = C.reconcile(orders, txs, { registers });
const sales = { day: '2026-10-29', orders: 2, amount: 820, by_method: { ctbc: 820 }, by_hour: { 14: 300, 19: 520 }, items: [], csv: [], linepay: { configured: true, pos: { count: 0, amount: 0 }, linepay: { count: 0, amount: 0 }, diff: 0, by_venue: {}, rows: [], csv: [] }, ctbc: { ...ct, configured: true, synced_at: '2026-10-29T08:15:00Z', sync_error: null, csv: C.csvRows(ct.rows) } };
const server = http.createServer((req, res) => {
  const files = { '/style.css': 'public/style.css', '/pos-ops.js': 'public/pos-ops.js', '/pos-ops.css': 'public/pos-ops.css', '/menu-lib.js': 'public/menu-lib.js' };
  if (files[req.url]) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(root, files[req.url]))); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pos-ops.css">${posStyle}<body><main><div class="a-sec" id="sales-body"></div></main>
<script>window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=n=>Number(n||0).toLocaleString('en-US');window.applicationTime=s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});window.opsHref=s=>s;window.toast=m=>{};window.downloadCSV=()=>{};window.SCOPE='';window.DATA={payment_methods:[]};window.BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'};
window.api=async p=>{if(p.startsWith('/admin/sales?'))return ${JSON.stringify(sales)};throw Error('x');};</script><script src="/menu-lib.js"></script><script src="/pos-ops.js"></script><script>SALES_DAY='2026-10-29';loadSales().then(()=>{document.querySelector('#sales-body details').open=true;window.done=1;});</script>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
const errors = [];
try {
  for (const w of [1180, 390]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: 900 });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction('window.done===1', { timeout: 15000 });
    const m = await page.evaluate(() => { const h = [...document.querySelectorAll('h3')].find(e => /信用卡對帳（中信）/.test(e.textContent)); h.scrollIntoView(); return { title: h.textContent.trim(), rows: h.closest('details').querySelectorAll('tbody tr').length, ts: !!document.getElementById('ts-form'), sync: !!document.getElementById('ct-sync'), overflow: document.documentElement.scrollWidth - innerWidth }; });
    console.log(w, JSON.stringify(m));
    const el = await page.evaluateHandle(() => [...document.querySelectorAll('h3')].find(e => /信用卡對帳（中信）/.test(e.textContent)).parentElement);
    const box = await el.boundingBox();
    await page.screenshot({ path: path.join(out, `ctbc-sales-${w}.png`), clip: { x: 0, y: Math.max(0, box.y - 10), width: w, height: 760 }, captureBeyondViewport: true });
    await page.close();
  }
  console.log('pageerror', errors.length ? errors : 0);
} finally { await browser.close(); server.close(); }
