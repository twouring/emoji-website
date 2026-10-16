// 平板 POS 子站（pos.emoji.tw → /pos，PWA）：路由分流、登入導回白名單、App 殼與 service worker 的安全邊界。
// 以隔離的 server.js（無真 DB、無外網）實跑 HTTP；前端以原始碼正則驗證接線。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

async function server(t, env = {}) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x', ...env } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  // fetch（undici）不允許自訂 Host 標頭：有 host 的請求改走 node:http，回傳物件對齊 fetch 的 status/headers
  return (url, headers = {}) => headers.host
    ? new Promise((resolve, reject) => {
        const req = httpRequest(base + url, { headers }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: { get: k => res.headers[k.toLowerCase()] ?? null } })); });
        req.on('error', reject); req.end();
      })
    : fetch(base + url, { redirect: 'manual', headers });
}

test('/pos 與子路徑回同一頁、noindex；/pos.html 轉 301；不再是 PWA（無 manifest、無 service worker）', async t => {
  const get = await server(t);
  for (const url of ['/pos', '/pos/orders', '/pos/soldout', '/pos/reservations', '/pos/history', '/pos/sales', '/pos/clock', '/pos/shifts']) {
    const res = await get(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', url);
    const body = await res.text();
    assert.doesNotMatch(body, /rel="manifest"|apple-mobile-web-app|apple-touch-icon|beforeinstallprompt/, url + ' 不可再有 PWA 標記');
  }
  const legacy = await get('/pos.html');
  assert.equal(legacy.status, 301); assert.match(legacy.headers.get('location'), /\/pos$/);
  for (const gone of ['/pos.webmanifest', '/pos-sw.js', '/pos-icon-192.png']) assert.doesNotMatch(String((await get(gone)).headers.get('content-type')), /manifest|javascript|image\/png/, gone + ' 應已移除');
});

test('pos.emoji.tw：首頁與 /admin 轉到 /pos；www 與 localhost 不受影響；CORS 放行 pos 來源；登入導回接受 pos 子網域', async t => {
  const get = await server(t);
  for (const url of ['/', '/index.html', '/admin', '/admin.html']) {
    const res = await get(url, { host: 'pos.emoji.tw' });
    assert.equal(res.status, 302, url); assert.match(res.headers.get('location'), /\/pos$/, url);
  }
  assert.equal((await get('/pos', { host: 'pos.emoji.tw' })).status, 200);
  assert.notEqual((await get('/', { host: 'www.emoji.tw' })).status, 302);
  assert.notEqual((await get('/', { host: 'localhost' })).status, 302);
  assert.equal((await get('/', { host: 'pos.emoji.tw.evil.test' })).status !== 302, true);
  const cors = await get('/api/health', { origin: 'https://pos.emoji.tw' });
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://pos.emoji.tw');
  assert.equal((await get('/api/health', { origin: 'https://evil.test' })).headers.get('access-control-allow-origin'), null);
  const login = await get('/auth/google?redirect=' + encodeURIComponent('https://pos.emoji.tw/pos'));
  assert.equal(login.status, 302);
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const { verifyToken } = require('../lib/security');
  assert.equal(verifyToken(state, 'local-test-secret-not-used-in-production', { purpose: 'oauth' }).r, 'https://pos.emoji.tw/pos');
  const bad = await get('/auth/google?redirect=' + encodeURIComponent('https://pos.emoji.tw.evil.test/pos'));
  assert.equal(verifyToken(new URL(bad.headers.get('location')).searchParams.get('state'), 'local-test-secret-not-used-in-production', { purpose: 'oauth' }).r, 'https://app.emoji.tw/');
});

test('pos.html：只做餐飲五件事、與 /admin 共用 pos-ops.js、登入走 www 網域、token 只存 localStorage', () => {
  const html = read('public/pos.html');
  assert.match(html, /<script src="\/pos-ops\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/pos-ops\.css">/);
  assert.doesNotMatch(html, /rel="manifest"|apple-mobile-web-app|apple-touch-icon|installHint|beforeinstallprompt/, '純瀏覽器：不留 PWA 安裝提示');
  assert.match(html, /getRegistrations\(\)\.then\(rs => rs\.forEach\(r => r\.unregister\(\)\)\)/, '註銷舊版殘留的 service worker');
  assert.doesNotMatch(html, /serviceWorker\.register/);
  assert.match(html, /\{ id:'pos',(?: icon:'wallet',)?\s+label:'結帳' \}/); assert.match(html, /\{ id:'orders',(?: icon:'utensils',)?\s+label:'出餐' \}/); assert.match(html, /\{ id:'soldout',(?: icon:'ban',)?\s+label:'估清' \}/);
  assert.match(html, /\{ id:'reservations',(?: icon:'calendar',)?\s+label:'訂位' \}/); assert.match(html, /\{ id:'history',(?: icon:'search',)?\s+label:'查單' \}/); assert.match(html, /\{ id:'sales',(?: icon:'chart',)?\s+label:'日結' \}/);
  assert.match(html, /else if \(TAB === 'history'\) loadHistory\(\);/);
  assert.doesNotMatch(html, /members|commitments|social|permissions/, 'POS 不帶後台其他分頁');
  assert.match(html, /const BRAND_LABEL = \{ CAFE:'在咖啡', BAR:'三點水' \}/);
  assert.match(html, /const AUTH_ORIGIN = \/\^pos\\\.\/i\.test\(location\.hostname\)/);
  assert.match(html, /\$\{esc\(AUTH_ORIGIN\)\}\/auth\/google\?redirect=\$\{redirect\}/);
  assert.match(html, /const KEY = 'tth_token'/);
  assert.match(html, /d\.role !== 'admin'/); assert.match(html, /d\.brands && !d\.brands\.some\(b => BRAND_LABEL\[b\]\)/, '等等空間子帳號擋在 POS 外');
  // 現場長期開著：喚醒重抓、到期前背景續期
  assert.match(html, /addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden && DATA\) \{ activate\(\); refreshPending\(\); \} \}\)/);
  assert.match(html, /api\('\/auth\/renew', \{ method:'POST'/); assert.match(html, /setInterval\(renewToken, 3600e3\)/);
  assert.match(html, /tokenExp\(token\) - Date\.now\(\) > 2 \* 86400e3\) return;/, '只在剩不到 2 天時續');
  // 宿主頁必須提供 pos-ops.js 用到的全域
  for (const g of ['function toast(', 'const esc =', 'const num =', 'const NT =', 'async function api(', 'function applicationTime(', 'function downloadCSV(', 'function opsHref(', 'let toastT, DATA = null, TAB = ', 'SCOPE = ', 'MENU_DOC = null']) assert.ok(html.includes(g), g);
});

test('pos-ops.js：共用模組不碰 /admin 專屬狀態；估清分頁只動 sold_out；Star webPRNT 列印接線', () => {
  const ops = read('public/pos-ops.js');
  for (const fn of ['tabOrders', 'tabPos', 'tabReservations', 'tabSales', 'tabSoldOut', 'loadOrders', 'loadPos', 'paintPos', 'loadReservations', 'loadSales', 'loadSoldOut', 'printOrder', 'voidOrderPrompt']) assert.match(ops, new RegExp(`function ${fn}\\(`), fn);
  assert.doesNotMatch(ops, /\bWORKSPACES\b|\bscopedRoute\(|\brender\(DATA\)|\bgo\(/, '共用模組不可依賴 /admin 的路由與工作區');
  assert.match(ops, /opsHref\('pos'\)/);
  // 現場作業：櫃檯開桌／外帶、櫃檯登記訂位（電話／現場）、ezPay 電子發票
  assert.doesNotMatch(ops, /id="pos-open"/); assert.doesNotMatch(ops, /id="pos-open-table"/); assert.match(ops, /id="pos-takeout"/); assert.match(ops, /api\('\/admin\/orders\/sessions',\{method:'POST',body:\{\.\.\.body,operator_id:OPERATOR\?\.id\}\}\)/);
  assert.match(ops, /id="resv-form"/); assert.match(ops, /api\('\/admin\/reservations',\{method:'POST',body\}\)/);
  assert.match(ops, /電子發票/); assert.match(ops, /name="pos-invoice"/); assert.match(ops, /buyer_ubn/); assert.match(ops, /carrier_num/); assert.match(ops, /love_code/);
  assert.match(ops, /invoice:invoiceBody\(host\)/); assert.match(ops, /\/invoice\/issue/);
  assert.match(ops, /STAR_WEBPRNT_URL='https:\/\/localhost:8001\/StarWebPRNT\/SendMessage'/, '硬體列印／開錢櫃走 Star webPRNT Browser（mPOP POP10CI 沒藍牙，USB-C 有線）');
  assert.match(ops, /const inStarBrowser=\(\)=>\/StarWebPRNTBrowser\/i\.test\(navigator\.userAgent\)/, '用 UA 判斷是否在 Star webPRNT Browser 裡');
  assert.match(ops, /createPeripheralElement\(\{channel:1,on:200,off:200\}\)/, '開錢櫃用 peripheral 指令');
  assert.match(ops, /createBitImageElement\(\{context:canvas\.getContext\('2d'\)/, '發票以點陣圖送 mPOP');
  assert.match(ops, /const STAR_DOTS=384/, 'mPOP 58mm 可印寬 384 點');
  assert.match(ops, /function openCashDrawer\(\{auto=false\}=\{\}\)/); assert.match(ops, /id="pos-cash-drawer"/);
  assert.match(ops, /function drawCode39\(g,text,x0,y,h\)/); assert.match(ops, /async function invoiceProofCanvas\(o\)/); assert.match(ops, /async function printInvoiceProof\(o,\{auto=false\}=\{\}\)/);
  assert.match(ops, /data-invoice-print=/); assert.match(ops, /await printCheckoutOrder\(order\)/);
  assert.match(ops, /await autoCashDrawer\(\{kind:'checkout'/); assert.doesNotMatch(ops, /printInvoiceProof\(order,\{drawer:/);
  assert.match(ops, /await printReceipt\(order,\{auto:true\}\)/);
  assert.doesNotMatch(ops, /starpassprnt|PassPRNT|WebUSB|StarXpand|藍牙配對/i, 'POP10CI 沒藍牙：不留 PassPRNT／WebUSB 路徑');
  assert.match(ops, /iPad 用 USB-C 線接 mPOP，並用 Star webPRNT Browser 開這個網址/, '操作說明講 webPRNT Browser + USB-C');
  assert.match(read('public/pos.html'), /<script src="\/vendor\/StarWebPrintBuilder\.js"><\/script>\s*<script src="\/vendor\/StarWebPrintTrader\.js"><\/script>/, 'pos.html 載入 Star webPRNT SDK');
  assert.match(ops, /empty:\['pill-draft','已開桌'\]/);
  assert.match(ops, /\/admin\/menu\/sold-out/); assert.match(ops, /data-so=/);
  assert.match(ops, /if\(host\.querySelector\('\.kds-grid'\)\)toast\('更新失敗：'/, '出餐看板更新失敗不清空畫面');
  assert.match(ops, /const opsHelp=tipIcon;/, '長說明統一走 opsHelp()＝標題後方的「?」圖示（點擊才顯示）');
  assert.match(ops, /class="tip-q" aria-label="操作說明"/); assert.doesNotMatch(ops, /<details class="ops-help"/, '不再有攤開／摺疊的「操作說明」按鈕');
  assert.match(ops, /\$\{opsHelp\(`客人掃桌上 QR 點餐/, '出餐看板長說明要預設收合，避免 UI 雜亂');
  for (const lead of ['找某一筆已結帳的單', '客人從 <a href="\\/reserve"', '營業日從凌晨 03:00', '點一下品項切換「今日估清」', '輸入你的 4 位數識別碼，按「上班」', '在咖啡與三點水共用同一個抽屜帳', '員工先按「排休」', '工時＝下班－上班－休息']) {
    assert.match(ops, new RegExp("opsHelp\\('" + lead), lead + ' 要用 opsHelp 收合');
    assert.doesNotMatch(ops, new RegExp('<p class="hint">' + lead), lead + ' 不可直接攤開');
  }
  assert.match(ops, /if\(host\.querySelector\('\.pos-grid'\)\)toast\('更新失敗：'/, '結帳頁更新失敗不清空畫面');
  const admin = read('public/admin.html');
  assert.match(admin, /function opsHref\(tab\)\{ return BASE \+ '\/' \+ scopedRoute\(tab\); \}/);
});
