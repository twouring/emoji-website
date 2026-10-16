/* 言文字 POS（pos.emoji.tw）service worker：只讓 App 殼（頁面、腳本、樣式、圖示）可離線開啟；
   /api、/auth 一律走網路、不快取（訂單與結帳資料不可用舊的）。部署新版時改 VERSION 即會換快取。 */
const VERSION = 'pos-v43';
const SHELL = ['/pos', '/pos-encouragement.js', '/pos-invoice-scan.js', '/pos-ops.js', '/pos-ops.css', '/menu-lib.js', '/order-lib.js', '/vendor/qrcode.min.js', '/vendor/zxing-reader.js', '/vendor/zxing_reader.wasm', '/vendor/StarWebPrintBuilder.js', '/vendor/StarWebPrintTrader.js', '/style.css', '/pos.webmanifest', '/pos-icon-192.png', '/pos-icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/event-login')) return;
  // 導覽請求（/pos、/pos/orders…）一律回 App 殼：網路優先，離線時用快取的 /pos
  if (e.request.mode === 'navigate') {
    if (!url.pathname.startsWith('/pos')) return;
    e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put('/pos', r.clone())); return r; }).catch(() => caches.match('/pos')));
    return;
  }
  // 其餘靜態資源：網路優先、失敗用快取（確保平板永遠拿到最新腳本，離線仍可開）
  e.respondWith(fetch(e.request).then(r => { if (r.ok && SHELL.includes(url.pathname)) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
