/* 言文字會員 PWA service worker：只快取 App 殼；/api、/auth 一律走網路。改版時換 VERSION。 */
const VERSION = 'm-v11';
const SHELL = ['/m', '/', '/vendor/qrcode.min.js', '/menu-lib.js', '/m.webmanifest', '/m-icon-192.png', '/m-icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (e.request.mode === 'navigate') {
    if (url.pathname !== '/' && !url.pathname.startsWith('/m')) return;
    const shell = url.pathname === '/' ? '/' : '/m';
    e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(shell, r.clone())); return r; }).catch(() => caches.match(shell)));
    return;
  }
  e.respondWith(fetch(e.request).then(r => { if (r.ok && SHELL.includes(url.pathname)) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
