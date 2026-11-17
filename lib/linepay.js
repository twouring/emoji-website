/* LINE Pay 商家後台對帳：每日把 LINE Pay 實收明細抓回 linepay_transactions，日結報表比對「POS 登記 LINE Pay」與「LINE Pay 實收」。
 * LINE Pay 沒有商家交易查詢 API（只有線上付款 API），所以用 puppeteer 登入商家後台、呼叫後台自己的 JSON 端點。
 * 帳密一律由環境變數提供（LINEPAY_MERCHANT_ID / LINEPAY_MERCHANT_PW），不寫入 repo。
 * 純函式（normalize / reconcile）無 DB、無瀏覽器，給測試 require。 */
'use strict';

require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const { paymentEnv, venuesOf, entityOf, txEntity } = require('./entities');

const PORTAL_URL = 'https://pay.line.me/epi/center/deal/integrate?locale=zh_TW';
const TX_API = 'https://merchant-paymoney.line.me/mrc/merchant/payment/transactions';
// 後台前端夾帶的版本 header；少了回 404「No endpoint」。後台改版時從 Network 面板抄新值，可用環境變數覆寫
const API_VERSION = '250701_R';
const METHOD_LABEL = { CREDIT_CARD: '信用卡', IPASS: '一卡通MONEY', POINT: 'LINE POINTS', BALANCE: 'LINE Pay Money' };
const TYPE_LABEL = { PAYMENT: '付款', PAYMENT_CANCEL: '退款', PARTIAL_CANCEL: '部分退款' };

/* entity：TTH（言文字，在咖啡＋三點水）／TWOURING（遊遊，等等空間＋約書旅）；不給＝言文字（舊呼叫端） */
function config(env = process.env, entity = 'TTH') {
  env = paymentEnv(env, entity);
  const merchantId = String(env.LINEPAY_MERCHANT_ID || '').trim(), password = String(env.LINEPAY_MERCHANT_PW || '');
  if (!merchantId || !password) return null;
  return { merchantId, password, apiVersion: String(env.LINEPAY_API_VERSION || '').trim() || API_VERSION };
}
function configured(env = process.env, entity = 'TTH') { return !!config(env, entity); }

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
async function loginOnce(browser, cfg) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  try {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    {
      // 商店 ID：等輸入框有值、「下一步」可按才點；Cloud Run CPU 慢時 type 完立刻點，前端狀態還沒更新會停在原頁
      await page.waitForSelector('input[placeholder="請輸入商店ID"]', { timeout: 30000 });
      await page.type('input[placeholder="請輸入商店ID"]', cfg.merchantId, { delay: 20 });
      await page.waitForFunction(id => document.querySelector('input[placeholder="請輸入商店ID"]')?.value === id
        && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '下一步' && !b.disabled), { timeout: 10000 }, cfg.merchantId);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '下一步')?.click());
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 30000 });
      await page.type('input[type="password"]', cfg.password, { delay: 20 });
      await page.waitForFunction(() => [...document.querySelectorAll('button[type=submit]')].some(b => b.textContent.trim() === '登入' && !b.disabled), { timeout: 10000 });
      await page.evaluate(() => [...document.querySelectorAll('button[type=submit]')].find(b => b.textContent.trim() === '登入')?.click());
      await page.waitForFunction(() => /\/epi\/center/.test(location.pathname), { timeout: 60000 });
      await page.goto(PORTAL_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    }
    return page;
  } catch (e) {
    // 錯誤訊息附上 LINE Pay 當下畫面（網址＋頁面文字），日結頁才看得出是被擋、密碼錯還是頁面改版
    const url = (() => { try { const u = new URL(page.url()); return u.origin + u.pathname; } catch { return ''; } })();
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    await page.close().catch(() => {});
    throw Object.assign(Error(`${e.message}｜${url}｜${String(text).replace(/\s+/g, ' ').trim().slice(0, 200)}`), { loginFailed: true });
  }
}
/* 兩段式登入；LINE Pay 登入頁偶發不跳密碼頁，最多重試 3 次（每次新分頁、間隔遞增） */
async function login(browser, cfg, { tries = 3, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await loginOnce(browser, cfg); } catch (e) { last = e; if (i < tries - 1) await wait(3000 * (i + 1)); }
  }
  throw last;
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
          // session 失效或頁面還在跳轉（Execution context was destroyed）都重登續抓
          if (!(err.retry || /context was destroyed|detached/i.test(err.message)) || attempt >= 2) throw err;
          await page.close().catch(() => {});
          page = await login(browser, cfg);
        }
      }
    }
  } finally { await browser.close().catch(() => {}); }
  return [...out.values()];
}

/* 桌號結帳頁每秒同步用（KK 11/5）：保留一個已登入的後台分頁，之後每次只送一次查詢（約 1 秒），不必每次重開瀏覽器登入（約 16 秒，也怕被 LINE Pay 擋）。
 * 閒置 idleMs 自動關瀏覽器；查詢失敗（session 失效等）關掉重登一次。同一時間只跑一個。 */
/* 每個商店代號一個常駐分頁（KK 11/11 付款依法人分開：言文字、遊遊各一組帳密） */
const WARMS = new Map();
const warmOf = id => { let w = WARMS.get(id); if (!w) WARMS.set(id, w = { browser: null, page: null, timer: null, busy: null }); return w; };
function warmClose(merchantId) {
  for (const [id, w] of WARMS) { if (merchantId && id !== merchantId) continue; const b = w.browser; w.browser = w.page = null; clearTimeout(w.timer); if (b) b.close().catch(() => {}); }
}
async function fetchWarm(cfg, start, end, { puppeteer = require('puppeteer'), idleMs = 120000 } = {}) {
  const id = cfg.merchantId, WARM = warmOf(id);
  if (WARM.busy) return WARM.busy;
  WARM.busy = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!WARM.page) {
          WARM.browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
          WARM.page = await login(WARM.browser, cfg);
        }
        const { rows } = await fetchRange(WARM.page, cfg, start, end);
        clearTimeout(WARM.timer); WARM.timer = setTimeout(() => warmClose(id), idleMs); WARM.timer.unref?.();
        return rows.map(normalize).filter(Boolean);
      } catch (e) { warmClose(id); if (attempt) throw e; }
    }
  })();
  try { return await WARM.busy; } finally { WARM.busy = null; }
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
 * 不逐筆配對（POS 單與 LINE Pay 筆數本來就會因分帳／合併付款而不同），只比金額與筆數，差額非 0 就標示。
 * LINE Pay 後台只有一個商店 ID、交易沒有店別欄位，所以用交易時間歸屬：以當天開關帳（pos_registers）的開帳～關帳時間判斷是哪一店開著；
 * 關帳後的交易一律算給下一本帳（客人提早在開帳前付款），最後一本帳關帳後算輪到的另一店；當天還沒開過帳才退回固定時段：在咖啡 08:00–17:00、三點水 17:00 起到隔天凌晨。
 * 店別範圍（venues）同時限制 POS 側與 LINE Pay 側；不限店別時另回 by_venue 分店對帳。 */
const VENUE_LABEL = { CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' };
/* 依時間自動歸屬只在同一法人的兩店間輪（KK 11/11 付款依法人分開）：言文字 在咖啡↔三點水、遊遊 等等空間↔約書旅 */
const NEXT_VENUE = { CAFE: 'BAR', BAR: 'CAFE', STAY: 'REST', REST: 'STAY' };
const ms = x => new Date(x).getTime();
function venueOfTime(paidAt, registers = [], entity = 'TTH') {
  const t = ms(paidAt), auto = venuesOf(entity);
  const regs = (registers || []).filter(r => auto.includes(r.venue) && r.opened_at).map(r => ({ venue: r.venue, open: ms(r.opened_at), close: r.closed_at ? ms(r.closed_at) : Infinity })).sort((a, b) => a.open - b.open);
  if (regs.length) {
    const inside = regs.find(r => t >= r.open && t < r.close);
    if (inside) return inside.venue;
    const next = regs.find(r => r.open > t);              // 關帳後、下一店開帳前（含第一本帳開帳前）：算下一本帳（客人提早在開帳前付款）
    if (next) return next.venue;
    return NEXT_VENUE[regs[regs.length - 1].venue];        // 最後一本帳關帳後：仍算下一本帳＝輪到的另一店（在咖啡→三點水→在咖啡）
  }
  if (entity !== 'TTH') return auto[0];                 // 遊遊當天沒開帳：先算等等空間，可由約書旅認領
  const h = (new Date(paidAt).getUTCHours() + 8) % 24;   // 台北小時
  return h >= 8 && h < 17 ? 'CAFE' : 'BAR';
}
/* 營業時間外＝交易當下沒有任何一本帳開著（任一品牌）。這種交易時間歸屬猜不準（KK 11/15），品牌 POS 可在日結「歸到本店」：
 * 寫進交易表的 claim_venue，之後一律以它為準（對帳、彈窗、CSV）。開帳中的交易不能認領，照時間歸屬。 */
function outsideHours(paidAt, registers = []) {
  const t = ms(paidAt);
  return !(registers || []).some(r => r && r.opened_at && t >= ms(r.opened_at) && t < (r.closed_at ? ms(r.closed_at) : Infinity));
}
/* 交易當下開著帳的店別（不重複，依開帳先後）；only 給定時只看這些店別 */
function openVenuesAt(paidAt, registers = [], only = null) {
  const t = ms(paidAt), out = [];
  for (const r of [...(registers || [])].filter(r => r && r.opened_at).sort((a, b) => ms(a.opened_at) - ms(b.opened_at)))
    if (t >= ms(r.opened_at) && t < (r.closed_at ? ms(r.closed_at) : Infinity) && (!only || only.includes(r.venue)) && !out.includes(r.venue)) out.push(r.venue);
  return out;
}
/* 歸屬不確定（2026-11-15 finance 查核 t_faab4bd4）：在咖啡與三點水的帳時段重疊時，venueOfTime 只能暫歸先開帳的店，
 * 交易可能是任一店的客人。未認領時標 ambiguous=true、candidates=[同時開著的兩店]，兩店日結與彈窗都列出、任一店都可認領（要原因）。
 * 認領後以 claim_venue 為準，ambiguous 回 false。 */
function attribute(t, registers = []) {
  const entity = txEntity(t), own = venuesOf(entity), regs = (registers || []).filter(r => own.includes(r.venue));   // 只看同法人的帳本
  const paid_at = new Date(t.paid_at).toISOString(), claimed = own.includes(t.claim_venue) ? t.claim_venue : '';
  const open = openVenuesAt(paid_at, regs), ambiguous = !claimed && open.length > 1;
  return { paid_at, entity, venue: claimed || venueOfTime(paid_at, regs, entity), outside: outsideHours(paid_at, regs), claimed: !!claimed, ambiguous, candidates: ambiguous ? open : [] };
}
/* 品牌 POS 可否把交易歸到 venue（server payClaim 共用）：
 * 交易當下只有本店開著帳 → 409（本來就算本店）；本店與別店同時開著（重疊時段）或只有別店開著 → 可認領但必填原因；都沒開 → 可直接認領。 */
function claimRule(paidAt, registers = [], venue) {
  const own = venuesOf(entityOf(venue)), open = openVenuesAt(paidAt, (registers || []).filter(r => own.includes(r.venue))), others = open.filter(v => v !== venue), from = others.map(v => VENUE_LABEL[v] || v).join('、');
  const me = VENUE_LABEL[venue] || venue;
  if (open.includes(venue) && !others.length) return { ok: false, status: 409, error: `這筆交易發生時只有${me}開著帳，本來就算本店。` };
  if (others.length) return { ok: true, needReason: true, overlap: open.includes(venue), from,
    error: open.includes(venue) ? `這筆交易發生時${me}和${from}同時開著帳，歸屬不確定，認領要填原因。` : `這筆交易發生時${from}開著帳，改歸本店要填原因。` };
  return { ok: true, needReason: false, overlap: false, from: '' };
}
/* 品牌頁只看同法人的交易（KK 11/11：言文字的交易不會出現在遊遊 POS，反之亦然）；venues 為 null＝全部 */
const sameEntity = (t, venues) => !venues || venues.some(v => entityOf(v) === t.entity);
/* 營業時間外、還沒認領的交易（同法人內不分店別，給品牌 POS 認領用） */
const unclaimedOutside = (rows, venues = null) => (rows || []).filter(t => t.outside && !t.claimed && sameEntity(t, venues));
/* 重疊時段、還沒認領的交易：品牌頁只列本店是候選的；venues 為 null（全店頁）全列 */
const unclaimedAmbiguous = (rows, venues) => (rows || []).filter(t => t.ambiguous && (!venues || t.candidates.some(v => venues.includes(v))));
/* 別店開帳中收的、還沒認領的交易（KK 11/15：別店已開帳才發現是本店的），含重疊時段暫歸本店、尚待確認的交易；venues 為 null（全店頁）回空 */
const othersOpen = (rows, venues) => venues ? (rows || []).filter(t => sameEntity(t, venues) && !t.outside && !t.claimed && (!venues.includes(t.venue) || (t.ambiguous && t.candidates.some(v => venues.includes(v))))) : [];
/* 收款彈窗：本店的，或重疊時段本店也是候選（認領前兩店都跳） */
const alertVisible = (r, venues) => !venues || venues.includes(r.venue) || (r.ambiguous && r.candidates.some(v => venues.includes(v)));
function reconcile(orders, txs, { venues = null, registers = [] } = {}) {
  const ownedBy = require('./table-orders').orderOwnedByVenues;
  const posAll = (orders || []).filter(o => o.status !== 'void' && o.payer?.method === 'linepay' && ownedBy(o, venues));
  // pg 回的 paid_at 是 Date 物件、匯入的是字串：一律轉 ISO 字串再排序／輸出
  const rowsAll = (txs || []).map(t => ({ ...t, amount: Number(t.amount) || 0, ...attribute(t, registers) }));
  const rows = venues ? rowsAll.filter(t => venues.includes(t.venue)) : rowsAll;
  const pos = posAll;
  const label = t => ({ ...t, venue_label: VENUE_LABEL[t.venue], method_label: METHOD_LABEL[t.method] || t.method, type_label: TYPE_LABEL[t.type] || t.type });
  const posAmount = pos.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  const paid = rows.filter(t => t.amount > 0), refund = rows.filter(t => t.amount < 0);
  const lpAmount = rows.reduce((a, t) => a + t.amount, 0);
  const byMethod = {};
  for (const t of rows) byMethod[t.method] = (byMethod[t.method] || 0) + t.amount;
  const by_venue = {};
  for (const v of Object.keys(VENUE_LABEL)) {
    const ps = pos.filter(o => (o.items?.[0]?.venue || '') === v), ls = rows.filter(t => t.venue === v);
    const pa = ps.reduce((a, o) => a + (Number(o.amount) || 0), 0), la = ls.reduce((a, t) => a + t.amount, 0);
    by_venue[v] = { label: VENUE_LABEL[v], pos: { count: ps.length, amount: pa }, linepay: { count: ls.filter(t => t.amount > 0).length, amount: la }, diff: la - pa };
  }
  return {
    pos: { count: pos.length, amount: posAmount },
    linepay: { count: paid.length, amount: lpAmount, refunds: refund.length, refund_amount: Math.abs(refund.reduce((a, t) => a + t.amount, 0)), by_method: byMethod },
    diff: lpAmount - posAmount,   // >0：LINE Pay 收到但 POS 沒登記（漏登或登成現金）；<0：POS 登 LINE Pay 但沒收到錢
    by_venue,
    rows: rows.sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(label),
    outside: unclaimedOutside(rowsAll, venues).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(label),
    others: othersOpen(rowsAll, venues).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(label),
    ambiguous: unclaimedAmbiguous(rowsAll, venues).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map(label),
  };
}
function csvRows(rows) {
  const head = ['營業日', '店別', '交易時間', 'LINE Pay 交易號碼', '類型', '金額', '付款方式', '卡號末四碼', '驗證碼', '訂單號碼'];
  return [head, ...(rows || []).map(t => [MenuLib.businessDay(t.paid_at), VENUE_LABEL[t.venue || venueOfTime(t.paid_at, [], txEntity(t))], new Date(t.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }), t.id, TYPE_LABEL[t.type] || t.type, t.amount, METHOD_LABEL[t.method] || t.method, t.card_last4 || '', t.confirm_no || '', t.order_no || ''])];
}

/* POS 收款通知：同步進來的交易 → 彈窗要顯示的列（含店別、中文標籤、台北時間）。registers 帶 day 欄位，依每筆的營業日挑當天開關帳歸屬店別；venues 為 null＝全部 */
function alertRows(txs, registers = [], venues = null) {
  return (txs || []).map(t => {
    const day = MenuLib.businessDay(t.paid_at);
    const { paid_at, venue, ambiguous, candidates } = attribute(t, (registers || []).filter(r => !r.day || String(r.day).slice(0, 10) === day));
    return { id: String(t.id), type: t.type, type_label: TYPE_LABEL[t.type] || t.type, amount: Number(t.amount) || 0, paid_at, day, ambiguous, candidates,
      time: new Date(paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }),
      method: t.method, method_label: METHOD_LABEL[t.method] || t.method || '', card_last4: t.card_last4 || '', confirm_no: t.confirm_no || '',
      order_no: t.order_no || '', origin_id: t.origin_id || '', venue, venue_label: VENUE_LABEL[venue] || venue,
      synced_at: t.synced_at ? new Date(t.synced_at).toISOString() : null };
  }).filter(r => alertVisible(r, venues));
}

module.exports = { PORTAL_URL, TX_API, API_VERSION, METHOD_LABEL, TYPE_LABEL, config, configured, normalize, fetchRange, login, fetchTransactions, monthChunks, syncWindow, reconcile, csvRows, venueOfTime, outsideHours, openVenuesAt, claimRule, attribute, unclaimedOutside, unclaimedAmbiguous, othersOpen, alertVisible, VENUE_LABEL, alertRows, fetchWarm, warmClose };
