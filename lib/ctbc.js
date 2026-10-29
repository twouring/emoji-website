/* 中信行動刷卡（mPOS／iPhone 卡緊收）對帳：每日把中信實收明細抓回 ctbc_transactions，日結報表比對「POS 登記信用卡」與「中信實收」。
 * 中信沒有給商店的交易查詢 API，做法同 LINE Pay（lib/linepay.js）：puppeteer 登入「手機刷卡機/mPOS 商店管理平台」，
 * 在「交易資料查詢」頁查詢並讀結果表。登入有 4 位數字驗證碼，用 lib/ctbc-captcha.js 模板比對辨識（不另裝 OCR）。
 * 帳密一律由環境變數提供（CTBC_MPOS_MERCHANT_ID／CTBC_MPOS_USER／CTBC_MPOS_PASSWORD），不寫入 repo。
 * 純函式（config／normalize／monthChunks／reconcile／csvRows）無 DB、無瀏覽器，給測試 require。 */
'use strict';

const crypto = require('node:crypto');
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const { venueOfTime, VENUE_LABEL } = require('./linepay');
const captcha = require('./ctbc-captcha');

const BASE = 'https://mpos.ctbcbank.com:8443/MP/';
const LOGIN_URL = BASE + 'Home/Login';
const MAX_RANGE_DAYS = 180;   // 後台「交易日期查詢範圍不可超過6個月」
const TYPE_LABEL = { SALE: '銷售', SALE_CANCEL: '銷售取消', REFUND: '退貨', REFUND_CANCEL: '退貨取消' };
// 結帳付款方式代碼：ctbc 是現行信用卡；taishin／card 是 2026-10-29 前的歷史單，一起算進信用卡對帳
const POS_METHODS = ['ctbc', 'taishin', 'card'];

function config(env = process.env) {
  const merchantId = String(env.CTBC_MPOS_MERCHANT_ID || '').trim(), user = String(env.CTBC_MPOS_USER || '').trim(), password = String(env.CTBC_MPOS_PASSWORD || '');
  if (!merchantId || !user || !password) return null;
  return { merchantId, user, password, proxy: String(env.CTBC_PROXY || '').trim() || null };
}
function configured(env = process.env) { return !!config(env); }

/* 交易類別文字（可能是「0 - 銷售」「銷售」「11」）→ 類型；順序要先比「退貨取消」再比「退貨」 */
function typeOf(v) {
  const s = String(v || '').trim();
  if (/退貨取消|^13\b/.test(s)) return 'REFUND_CANCEL';
  if (/退貨|^11\b/.test(s)) return 'REFUND';
  if (/取消|^3\b/.test(s)) return 'SALE_CANCEL';
  return 'SALE';
}
const SIGN = { SALE: 1, REFUND_CANCEL: 1, SALE_CANCEL: -1, REFUND: -1 };

/* 交易日期：「2026/10/29 14:23:05」「2026-10-29 14:23」或民國「115/10/29 14:23:05」，都是台北時間 */
function parseTime(v) {
  const m = String(v || '').match(/(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let y = Number(m[1]); if (y < 1911) y += 1911;
  const p = n => String(n).padStart(2, '0');
  const d = new Date(`${y}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${m[5]}:${p(m[6] || 0)}+08:00`);
  return isNaN(d) ? null : d;
}
const money = v => { const s = String(v || '').replace(/[^\d.-]/g, ''); if (!/\d/.test(s)) return NaN; const n = Number(s); return Number.isFinite(n) ? Math.round(Math.abs(n)) : NaN; };

/* 結果表一列（以表頭文字為 key）→ 我們的列。id 用後台隱藏欄位 TxDate＋TxEjfNo＋TxExtend（同一筆交易每次查都一樣）；缺時退回內容雜湊 */
function normalize(r) {
  if (!r || typeof r !== 'object') return null;
  const at = parseTime(r['交易日期']);
  const abs = money(r['交易金額']);
  if (!at || !Number.isFinite(abs)) return null;
  const type = typeOf(r['交易類別'] || r.TxExtend);
  const card = String(r['卡號'] || '').trim();
  const key = [r.TxDate, r.TxEjfNo, r.TxExtend].map(x => String(x || '').trim());
  const id = key[1] ? key.filter(Boolean).join('-') : 'h' + crypto.createHash('sha1').update([r['交易日期'], card, abs, r['授權碼'], r['交易類別'], r.TID].join('|')).digest('hex').slice(0, 20);
  return {
    id: id.slice(0, 64), type, amount: SIGN[type] * abs, paid_at: at.toISOString(),
    card_no: card.slice(0, 32), card_last4: card.replace(/\D/g, '').slice(-4), auth_code: String(r['授權碼'] || '').trim().slice(0, 16),
    biz: String(r['業務別'] || '').trim().slice(0, 20), progress: String(r['交易進度'] || '').trim().slice(0, 40),
    settle: String(r['結帳方式'] || '').trim().slice(0, 20), settle_date: String(r['結帳日期'] || '').trim().slice(0, 20),
    pay_date: String(r['預計請款日期'] || '').trim().slice(0, 20), terminal_id: String(r.TID || '').trim().slice(0, 20),
    device_user: String(r['行動裝置使用者'] || '').trim().slice(0, 40), note: String(r['商品備註'] || '').trim().slice(0, 200),
    raw: r,
  };
}
// 交易進度顯示失敗／拒絕的不算實收
const failed = t => /失敗|拒絕|未完成|逾時|error/i.test(t.progress || '');

/* 區間切成自然月（後台上限 6 個月；與 LINE Pay 一致按月切） */
function monthChunks(start, end) {
  const out = [];
  let s = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (s <= last) {
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
    out.push([s.toISOString().slice(0, 10), (e > last ? last : e).toISOString().slice(0, 10)]);
    s = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1));
  }
  return out;
}
function syncWindow(now = Date.now(), days = 7) {
  const end = MenuLib.businessDay(now);
  const s = new Date(end + 'T00:00:00Z'); s.setUTCDate(s.getUTCDate() - days);
  return [s.toISOString().slice(0, 10), end];
}

/* ===== 瀏覽器部分 ===== */
function launchArgs(cfg) {
  const a = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  if (cfg.proxy) a.push('--proxy-server=' + cfg.proxy);
  return a;
}
const visibleDialog = page => page.evaluate(() => [...document.querySelectorAll('.ui-dialog')].filter(d => d.offsetParent).map(d => d.innerText.replace(/\s+/g, ' ').trim()).join(' / '));
async function closeDialogs(page) {
  await page.evaluate(() => { for (const b of document.querySelectorAll('.ui-dialog button')) if (b.offsetParent && /確認|確定|OK|Close/i.test(b.textContent)) b.click(); });
}

/* 登入：驗證碼辨識錯就換一張重試（最多 5 次）；不是驗證碼的錯誤（帳密錯、鎖定）立刻停，避免把帳號試到鎖住 */
async function login(browser, cfg, { log = () => {} } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9' });
  page.on('dialog', d => d.accept().catch(() => {}));
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#MerchantID', { timeout: 30000 });
    const img = await page.$("img[src*='function_id=other']");
    await page.waitForFunction(el => el.complete && el.naturalWidth > 0, { timeout: 15000 }, img);
    const { data, w, h } = await page.evaluate(el => {
      const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(el, 0, 0);
      return { data: Array.from(x.getImageData(0, 0, c.width, c.height).data), w: c.width, h: c.height };
    }, img);
    const code = captcha.solve(data, w, h);
    await page.evaluate((c, code) => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('MerchantID', c.merchantId); set('MerUserID', c.user); set('SSUser1_SsCode', c.password); set('ValidateCode', code);
    }, cfg, code);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}), page.click('#Login')]);
    await new Promise(r => setTimeout(r, 1500));
    if (!/\/Home\/Login/i.test(page.url())) { log(`登入成功（第 ${attempt} 次）`); return page; }
    const msg = (await visibleDialog(page)) || (await page.evaluate(() => (document.querySelector('.validation-summary-errors,.field-validation-error,.error')?.innerText || '').trim()));
    log(`登入失敗（第 ${attempt} 次）：${msg || '無訊息'}`);
    if (msg && !/驗證碼|verification|validate/i.test(msg)) throw Object.assign(Error('中信商店管理平台登入失敗：' + msg.slice(0, 120)), { fatal: true });
  }
  throw Error('中信商店管理平台登入失敗：驗證碼連續 5 次辨識錯誤');
}

/* 選單由頁面 script 綁 gotoUrl('/MP/Settle/ShowTxIndex?v=…')，v 每次登入不同：從 script 取出網址再呼叫 gotoUrl（沒有就直接開） */
async function openQuery(page) {
  const path = await page.evaluate(() => (([...document.scripts].map(s => s.textContent).join('\n').match(/gotoUrl\('(\/MP\/Settle\/ShowTxIndex[^']*)'\)/) || [])[1] || ''));
  if (!path) throw Error('中信商店管理平台改版：找不到「交易資料查詢」入口');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.evaluate(p => { if (typeof gotoUrl === 'function') gotoUrl(p); else location.href = p; }, path),
  ]);
  await page.waitForSelector('#TranDateS', { timeout: 30000 });
}

/* 讀目前頁的結果表：找含「授權碼」與「交易日期」表頭的表格，回 [{表頭: 值}] */
const readTable = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('table')].reverse().find(t => t.rows.length && /授權碼/.test(t.rows[0].innerText) && /交易日期/.test(t.rows[0].innerText) && /交易金額/.test(t.rows[0].innerText));
  if (!t) return { head: [], rows: [] };
  const head = [...t.rows[0].cells].map(c => c.innerText.trim());
  const rows = [...t.rows].slice(1).filter(r => r.cells.length >= head.length - 1 && !/第一頁|下一頁/.test(r.innerText))
    .map(r => Object.fromEntries([...r.cells].map((c, i) => [head[i] || 'c' + i, c.innerText.trim()])))
    .filter(o => Object.values(o).some(v => v));
  return { head, rows };
});

/* 查一段（含兩端，YYYY-MM-DD）並翻完所有頁；查無資料回 [] */
async function fetchRange(page, start, end, { log = () => {} } = {}) {
  const ymd = s => s.replace(/-/g, '/');
  await page.evaluate((s, e) => {
    for (const id of ['TranDateS', 'TranDateE']) { const el = document.getElementById(id); el.value = id === 'TranDateS' ? s : e; }
    const ps = document.getElementById('pagesize'); if (ps) ps.value = '100';
  }, ymd(start), ymd(end));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}), page.click('input[name=ShowTxQuery]')]);
  await new Promise(r => setTimeout(r, 1500));
  const msg = await visibleDialog(page);
  if (/查無資料|No data/i.test(msg)) { await closeDialogs(page); return []; }
  if (msg && !/成功/.test(msg)) { await closeDialogs(page); throw Error('中信交易查詢失敗：' + msg.slice(0, 120)); }
  const all = [];
  const seen = new Set();
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const { head, rows } = await readTable(page);
    if (!head.length) throw Error('中信交易查詢頁面改版：找不到結果表');
    const sig = JSON.stringify(rows[0] || {});
    if (seen.has(sig)) break;
    seen.add(sig); all.push(...rows);
    const moved = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a,input[type=button],span')].find(e => /^下一頁$/.test((e.value || e.textContent || '').trim()) && e.offsetParent && !e.disabled && !/disabled/.test(e.className));
      if (!a || (a.tagName === 'SPAN' && !a.onclick)) return false;
      a.click(); return true;
    });
    if (!moved) break;
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  }
  log(`${start}~${end}: ${all.length} 列`);
  return all;
}

async function fetchTransactions(cfg, start, end, { puppeteer = require('puppeteer'), log = () => {} } = {}) {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: launchArgs(cfg) });
  const out = new Map();
  try {
    const page = await login(browser, cfg, { log });
    await openQuery(page);
    for (const [s, e] of monthChunks(start, end)) {
      for (const r of await fetchRange(page, s, e, { log })) { const n = normalize(r); if (n) out.set(n.id, n); }
    }
  } finally { await browser.close().catch(() => {}); }
  return [...out.values()];
}

/* ===== 對帳：POS 登記為信用卡（ctbc，含歷史 taishin／card）的成立單 vs 中信實收（同一營業日） =====
 * 與 LINE Pay 相同：不逐筆配對、只比金額與筆數；中信只有一個商店代號，店別依當天開關帳時間歸屬（venueOfTime）。 */
function reconcile(orders, txs, { venues = null, registers = [] } = {}) {
  const ownedBy = require('./table-orders').orderOwnedByVenues;
  const pos = (orders || []).filter(o => o.status !== 'void' && POS_METHODS.includes(o.payer?.method) && ownedBy(o, venues));
  const rowsAll = (txs || []).filter(t => !failed(t)).map(t => { const paid_at = new Date(t.paid_at).toISOString(); return { ...t, amount: Number(t.amount) || 0, paid_at, venue: venueOfTime(paid_at, registers) }; });
  const rows = venues ? rowsAll.filter(t => venues.includes(t.venue)) : rowsAll;
  const posAmount = pos.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  const sales = rows.filter(t => t.type === 'SALE'), back = rows.filter(t => t.amount < 0);
  const amt = rows.reduce((a, t) => a + t.amount, 0);
  const by_venue = {};
  for (const v of Object.keys(VENUE_LABEL)) {
    const ps = pos.filter(o => (o.items?.[0]?.venue || '') === v), ls = rows.filter(t => t.venue === v);
    const pa = ps.reduce((a, o) => a + (Number(o.amount) || 0), 0), la = ls.reduce((a, t) => a + t.amount, 0);
    by_venue[v] = { label: VENUE_LABEL[v], pos: { count: ps.length, amount: pa }, ctbc: { count: ls.filter(t => t.type === 'SALE').length, amount: la }, diff: la - pa };
  }
  return {
    pos: { count: pos.length, amount: posAmount },
    ctbc: { count: sales.length, amount: amt, refunds: back.length, refund_amount: Math.abs(back.reduce((a, t) => a + t.amount, 0)) },
    diff: amt - posAmount,   // >0：中信刷到但 POS 沒登記信用卡；<0：POS 登記信用卡但中信沒有這筆
    by_venue,
    rows: rows.sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(({ raw, ...t }) => ({ ...t, venue_label: VENUE_LABEL[t.venue], type_label: TYPE_LABEL[t.type] || t.type })),
  };
}
function csvRows(rows) {
  const head = ['營業日', '店別', '交易時間', '中信交易序號', '類型', '金額', '卡號', '授權碼', '交易進度', '結帳方式', '預計請款日期', 'TID', '行動裝置使用者'];
  return [head, ...(rows || []).map(t => [MenuLib.businessDay(t.paid_at), VENUE_LABEL[t.venue || venueOfTime(t.paid_at)], new Date(t.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }), t.id, TYPE_LABEL[t.type] || t.type, t.amount, t.card_no || '', t.auth_code || '', t.progress || '', t.settle || '', t.pay_date || '', t.terminal_id || '', t.device_user || ''])];
}

module.exports = { BASE, LOGIN_URL, MAX_RANGE_DAYS, TYPE_LABEL, POS_METHODS, config, configured, typeOf, parseTime, normalize, monthChunks, syncWindow, login, openQuery, fetchRange, fetchTransactions, reconcile, csvRows };
