/* LINE Pay 商家後台對帳：每日把 LINE Pay 實收明細抓回 linepay_transactions，日結報表比對「POS 登記 LINE Pay」與「LINE Pay 實收」。
 * LINE Pay 沒有商家交易查詢 API（只有線上付款 API），所以用 puppeteer 登入商家後台、呼叫後台自己的 JSON 端點。
 * 帳密一律由環境變數提供（LINEPAY_MERCHANT_ID / LINEPAY_MERCHANT_PW），不寫入 repo。
 * 純函式（normalize / reconcile）無 DB、無瀏覽器，給測試 require。 */
'use strict';

require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;

const PORTAL_URL = 'https://pay.line.me/epi/center/deal/integrate?locale=zh_TW';
const TX_API = 'https://merchant-paymoney.line.me/mrc/merchant/payment/transactions';
// 後台前端夾帶的版本 header；少了回 404「No endpoint」。後台改版時從 Network 面板抄新值，可用環境變數覆寫
const API_VERSION = '250701_R';
const METHOD_LABEL = { CREDIT_CARD: '信用卡', IPASS: '一卡通MONEY', POINT: 'LINE POINTS', BALANCE: 'LINE Pay Money' };
const TYPE_LABEL = { PAYMENT: '付款', PAYMENT_CANCEL: '退款', PARTIAL_CANCEL: '部分退款' };

function config(env = process.env) {
  const merchantId = String(env.LINEPAY_MERCHANT_ID || '').trim(), password = String(env.LINEPAY_MERCHANT_PW || '');
  if (!merchantId || !password) return null;
  return { merchantId, password, apiVersion: String(env.LINEPAY_API_VERSION || '').trim() || API_VERSION };
}
function configured(env = process.env) { return !!config(env); }

/* 後台一筆交易 → 我們的列。交易時間是台北時間（無時區），補 +08:00。退款（PAYMENT_CANCEL／PARTIAL_CANCEL）金額記負數，彙總直接相加即淨額 */
function normalize(t) {
  const id = String(t.transactionSequence || '');
  if (!/^\d{10,32}$/.test(id)) return null;
  const type = String(t.transactionType || 'PAYMENT');
  const amount = Math.round(Number(t.totalPayAmount ?? t.payAmount ?? 0));
  const ymdt = String(t.transactionYmdt || '');
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ymdt) ? new Date(ymdt.slice(0, 19) + '+08:00') : null;
  if (!at || isNaN(at)) return null;
  return {
    id, type, amount: type === 'PAYMENT' ? amount : -Math.abs(amount), paid_at: at.toISOString(),
    method: String(t.paymentMethodType || ''), provider: String(t.payProviderType || ''),
    origin_id: String(t.originTransactionSequence || id), order_no: String(t.merchantOrderNo || '').slice(0, 64),
    card_last4: String(t.cardNumber || '').replace(/\D/g, '').slice(-4), confirm_no: String(t.confirmNo || '').slice(0, 16),
  };
}

/* 用已登入的 page 分頁抓一段區間（後台單次查詢跨太長會 500，呼叫端按月切）。回 { rows, totalCount } */
async function fetchRange(page, cfg, start, end, { perPage = 100 } = {}) {
  const rows = [];
  let pageNo = 1, totalPages = 1, totalCount = 0;
  do {
    const r = await page.evaluate(async ([api, body, ver]) => {
      const res = await fetch(api, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', 'x-atom-api-version': ver }, body: JSON.stringify(body) });
      const text = await res.text();
      try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, text: text.slice(0, 200) }; }
    }, [TX_API, { merchantId: cfg.merchantId, startDateTime: start + 'T00:00', endDateTime: end + 'T23:59', perPage: String(perPage), pageNo: String(pageNo) }, cfg.apiVersion]);
    if (!r.json || r.json.code !== 'SUCCESS') throw Object.assign(Error(`LINE Pay 後台查詢失敗（${r.json?.code || r.status}）`), { code: r.json?.code, retry: r.json?.code === 'G_REFRESH_SESSION' });
    totalPages = Number(r.json.info.totalPageCount) || 1; totalCount = Number(r.json.info.totalCount) || 0;
    rows.push(...(r.json.info.paymentTransactionList || []));
    pageNo++;
  } while (pageNo <= totalPages);
  return { rows, totalCount };
}

/* 兩段式登入：商店 ID → 密碼；沒有驗證碼。回登入後停在交易查詢頁的 page */
async function login(browser, cfg) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder="請輸入商店ID"]', { timeout: 30000 });
  await page.type('input[placeholder="請輸入商店ID"]', cfg.merchantId);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '下一步')?.click());
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  await page.type('input[type="password"]', cfg.password);
  await page.evaluate(() => [...document.querySelectorAll('button[type=submit]')].find(b => b.textContent.trim() === '登入')?.click());
  await page.waitForFunction(() => /\/epi\/center/.test(location.pathname), { timeout: 60000 });
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  return page;
}

/* 抓指定區間（含兩端，YYYY-MM-DD）全部交易；session 失效（G_REFRESH_SESSION）就重新登入續抓。回 normalize 後的列（去重） */
async function fetchTransactions(cfg, start, end, { puppeteer = require('puppeteer'), log = () => {} } = {}) {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const out = new Map();
  try {
    let page = await login(browser, cfg);
    for (const [s, e] of monthChunks(start, end)) {
      for (let attempt = 0; ; attempt++) {
        try {
          const { rows, totalCount } = await fetchRange(page, cfg, s, e);
          for (const t of rows) { const n = normalize(t); if (n) out.set(n.id, n); }
          log(`${s}~${e}: ${rows.length}/${totalCount}`);
          break;
        } catch (err) {
          if (!err.retry || attempt >= 2) throw err;
          await page.close().catch(() => {});
          page = await login(browser, cfg);
        }
      }
    }
  } finally { await browser.close().catch(() => {}); }
  return [...out.values()];
}

/* 區間切成自然月（後台整年查會 500）；start/end 含兩端 */
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

/* 每日同步要抓的區間：最近 N 天（含今天），退款可能回補到幾天前的交易，所以不只抓昨天 */
function syncWindow(now = Date.now(), days = 7) {
  const end = MenuLib.businessDay(now);
  const s = new Date(end + 'T00:00:00Z'); s.setUTCDate(s.getUTCDate() - days);
  return [s.toISOString().slice(0, 10), end];
}

/* ===== 對帳：POS 登記為 linepay 的出餐單 vs LINE Pay 後台實收（同一營業日） =====
 * 不逐筆配對（POS 單與 LINE Pay 筆數本來就會因分帳／合併付款而不同），只比金額與筆數，差額非 0 就標示。 */
function reconcile(orders, txs, { venues = null } = {}) {
  const ownedBy = require('./table-orders').orderOwnedByVenues;
  const pos = (orders || []).filter(o => o.status !== 'void' && o.payer?.method === 'linepay' && ownedBy(o, venues));
  const posAmount = pos.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  const rows = (txs || []).map(t => ({ ...t, amount: Number(t.amount) || 0 }));
  const paid = rows.filter(t => t.amount > 0), refund = rows.filter(t => t.amount < 0);
  const lpAmount = rows.reduce((a, t) => a + t.amount, 0);
  const byMethod = {};
  for (const t of rows) byMethod[t.method] = (byMethod[t.method] || 0) + t.amount;
  return {
    pos: { count: pos.length, amount: posAmount },
    linepay: { count: paid.length, amount: lpAmount, refunds: refund.length, refund_amount: Math.abs(refund.reduce((a, t) => a + t.amount, 0)), by_method: byMethod },
    diff: lpAmount - posAmount,   // >0：LINE Pay 收到但 POS 沒登記（漏登或登成現金）；<0：POS 登 LINE Pay 但沒收到錢
    rows: rows.sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(t => ({ ...t, method_label: METHOD_LABEL[t.method] || t.method, type_label: TYPE_LABEL[t.type] || t.type })),
  };
}
function csvRows(rows) {
  const head = ['營業日', '交易時間', 'LINE Pay 交易號碼', '類型', '金額', '付款方式', '卡號末四碼', '驗證碼', '訂單號碼'];
  return [head, ...(rows || []).map(t => [MenuLib.businessDay(t.paid_at), new Date(t.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }), t.id, TYPE_LABEL[t.type] || t.type, t.amount, METHOD_LABEL[t.method] || t.method, t.card_last4 || '', t.confirm_no || '', t.order_no || ''])];
}

module.exports = { PORTAL_URL, TX_API, API_VERSION, METHOD_LABEL, TYPE_LABEL, config, configured, normalize, fetchRange, login, fetchTransactions, monthChunks, syncWindow, reconcile, csvRows };
