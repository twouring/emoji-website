// scripts/shot-sales-draft.mjs <輸出目錄> — 日結草稿留存（KK 11/8）：小結點驗填一半、核對帳戶一筆、現金核對彈窗填一半 → 整頁重載 → 量是否帶回。假 API，不碰 DB
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
let regData = { day: '2026-10-29', registers: [], current: { BAR: { id: 'r1', venue: 'BAR', day: '2026-10-29', opened_at: '2026-10-29T09:00:00Z', closed_at: null, opening_cash: 3000, cash_sales: 1820, cash_in: 0, cash_out: 200, expected: 4620, moves: [], counts: [], last_count: null, sales: { orders: 7, amount: 6480, collected: 6480, by_method: { cash: 1820, ctbc: 4660 } }, pending: { tables: 4, amount: 5390, service: 390, list: [{ table_no: 'A1', amount: 1320, service: 120 }, { table_no: 'A3', amount: 2090, service: 190, unsent: true }, { table_no: 'B2', amount: 880, service: 80 }, { table_no: 'W01', amount: 1100, service: 0 }] } } }, can_open: { BAR: false }, open_tables_by: { BAR: ['A1', 'A3', 'B2', 'W01'] }, handover: {} };
regData.current.BAR.reconciliation_accounts={ctbc:4660};regData.current.BAR.account_labels={};regData.registers=[regData.current.BAR];
const server = http.createServer((req, res) => {
  const files = { '/style.css': 'public/style.css', '/pos-ops.js': 'public/pos-ops.js', '/pos-ops.css': 'public/pos-ops.css', '/menu-lib.js': 'public/menu-lib.js' };
  if (files[req.url]) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(root, files[req.url]))); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pos-ops.css">${posStyle}<body><main><div class="a-sec" id="sales-body"></div></main>
<script>window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=n=>Number(n||0).toLocaleString('en-US');window.applicationTime=s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});window.opsHref=s=>s;window.toast=m=>{};window.downloadCSV=()=>{};window.SCOPE='BAR';window.DATA={payment_methods:[]};window.ensureOperator=f=>f();window.manualCashDrawer=async()=>{};window.posConfirm=async()=>true;window.regOpenTables=()=>[];window.BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'};
window.api=async p=>{if(p.startsWith('/admin/sales?'))return ${JSON.stringify(sales)};if(p.startsWith('/admin/registers?'))return ${JSON.stringify(regData)};throw Error('x');};</script><script src="/menu-lib.js"></script><script src="/pos-ops.js"></script><script>window.ensureOperator=f=>f();window.manualCashDrawer=async()=>{};window.regOpenTables=()=>[];loadSales().then(()=>{window.done=1;});</script>`);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
const errors = [], res = {};
const ok = (k, v) => { res[k] = v; };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1180, height: 900 });
  page.on('pageerror', e => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const boot = async () => { await page.goto(url); await page.waitForFunction('window.done===1', { timeout: 15000 }); await new Promise(r => setTimeout(r, 300)); };
  await boot();
  await page.evaluate(() => localStorage.clear()); await boot();
  const set = (s, v) => page.$eval(s, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
  // 1) 換到前一天再回來：營業日留存
  // 2) 小結點驗填一半
  await page.click('[data-reg-count]'); await new Promise(r => setTimeout(r, 300));
  await set('.reg-count-form [data-denom="1000"]', 3); await set('.reg-count-form [data-denom="100"]', 7); await set('#reg-count-note', '交班前點');
  ok('acct_buttons', await page.$$eval('[data-acct-open]', b => b.map(x => x.dataset.acctOpen)));
  // 3) 核對一個帳戶（信用卡）
  await page.click('[data-acct-open="ctbc"]'); await page.waitForSelector('.pos-move-ov');
  await set('#acct-actual', 4600); await set('#acct-reason', '少刷一筆'); await page.click('.pos-move-ov [data-ok]'); await new Promise(r => setTimeout(r, 300));
  ok('pill_before', await page.$eval('[data-acct-card] .pill', e => e.textContent));
  // 4) 現金核對彈窗填一半（不按確認）
  await page.click('[data-acct-open="cash"]'); await page.waitForSelector('.pos-move-ov');
  await set('.pos-move-ov [data-denom="500"]', 4);
  ok('draft', await page.evaluate(() => JSON.parse(localStorage.getItem('tth_sales_draft_bar'))));
  // 整頁重載（模擬新版上線自動重整）
  await boot(); await new Promise(r => setTimeout(r, 500));
  ok('after', await page.evaluate(() => ({
    countOpen: !!document.querySelector('.reg-count-form'),
    d1000: document.querySelector('.reg-count-form [data-denom="1000"]')?.value,
    d100: document.querySelector('.reg-count-form [data-denom="100"]')?.value,
    note: document.querySelector('#reg-count-note')?.value,
    countShow: document.querySelector('#reg-count-show')?.textContent,
    pill: document.querySelector('[data-acct-card] .pill')?.textContent,
    dialog: !!document.querySelector('.pos-move-ov'),
    dialogTitle: document.querySelector('.pos-move-ov h3')?.textContent,
    dialog500: document.querySelector('.pos-move-ov [data-denom="500"]')?.value,
  })));
  await page.screenshot({ path: path.join(out, 'sales-draft-after-reload.png') });
  // 5) 取消彈窗、取消小結 → 再重載不該再出現
  await page.click('.pos-move-ov [data-cancel]'); await page.click('#reg-count-cancel'); await new Promise(r => setTimeout(r, 300));
  await boot(); await new Promise(r => setTimeout(r, 400));
  ok('after_cancel', await page.evaluate(() => ({ countOpen: !!document.querySelector('.reg-count-form'), dialog: !!document.querySelector('.pos-move-ov'), pill: document.querySelector('[data-acct-card] .pill')?.textContent })));
  const a = res.after, c = res.after_cancel, fail = [];
  if (!(a.countOpen && a.d1000 === '3' && a.d100 === '7' && a.note === '交班前點' && a.countShow === 'NT$3,700')) fail.push('小結點驗欄位沒帶回');
  if (a.pill !== '1/2 已確認') fail.push('已核對帳戶沒帶回');
  if (!(a.dialog && /現金/.test(a.dialogTitle) && a.dialog500 === '4')) fail.push('核對中的現金彈窗沒帶回');
  if (c.countOpen || c.dialog) fail.push('取消後不該再出現');
  if (c.pill !== '1/2 已確認') fail.push('取消表單不可清掉已核對帳戶');
  console.log(JSON.stringify({ after: a, after_cancel: c }));
  console.log(fail.length ? 'FAIL ' + fail.join('；') : 'DRAFT OK');
  console.log('pageerror', errors.length ? errors : 0);
} finally { await browser.close(); server.close(); }
