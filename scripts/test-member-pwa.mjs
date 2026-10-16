// 會員 PWA（/m）：manifest、service worker、路由、消費者介面規則
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

test('manifest：standalone、scope /m、含 maskable 圖示且檔案存在', () => {
  const m = JSON.parse(read('public/m.webmanifest'));
  assert.equal(m.start_url, '/m'); assert.equal(m.scope, '/m'); assert.equal(m.display, 'standalone'); assert.equal(m.orientation, 'portrait');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(new URL('public' + i.src, root)), i.src);
  assert.ok(fs.existsSync(new URL('public/m-icon-180.png', root)));
});

test('service worker：API 與登入不快取、只回 /m 殼、scope 只到 /m', () => {
  const sw = read('public/m-sw.js'), server = read('server.js');
  assert.match(sw, /startsWith\('\/api\/'\)/); assert.match(sw, /startsWith\('\/auth\/'\)/);
  assert.match(sw, /VERSION = 'm-v\d+'/);
  assert.match(server, /app\.get\(\['\/m', '\/m\/\*'\]/);
  assert.match(server, /'Service-Worker-Allowed': isAppHost\(_req\) \? '\/' : '\/m'/);
  assert.match(server, /app\.get\('\/m\.webmanifest'/);
});

test('頁面：mobile viewport、安全區、底部分頁、全螢幕 QR；使用者資料一律 esc()', () => {
  const h = read('public/m.html');
  assert.match(h, /viewport-fit=cover/); assert.match(h, /env\(safe-area-inset-bottom\)/);
  assert.match(h, /rel="manifest" href="\/m\.webmanifest"/); assert.match(h, /apple-touch-icon/);
  assert.match(h, /\/api\/me\/card/); assert.match(h, /\/api\/me\/yan/);
  assert.match(h, /data-tab="home"/); assert.match(h, /data-tab="events"/); assert.match(h, /data-tab="me"/);
  assert.match(h, /esc\(me\.name/); assert.match(h, /esc\(e\.title\)/);
  assert.doesNotMatch(h, /font-size\s*:\s*(\.\d+rem|0\.\d+rem|\d{1,2}px)/i, '字級不得低於 1rem');
});

test('hidden 屬性不得被 display 規則蓋掉（未登入不顯示分頁列）', () => {
  assert.match(read('public/m.html'), /\[hidden\]\{display:none!important\}/);
});

test('消費者介面不出現品牌化點數名稱（言點、Yan）', () => {
  for (const f of ['public/m.html', 'public/member.html', 'public/en/member.html', 'public/ja/member.html', 'docs/API.md', 'lib/yan.js'])
    assert.doesNotMatch(read(f), /言點|Yan points|言ポイント/, f);
});

test('會員卡首頁：可兌換清單、訂位／活動／菜單快捷；/api/me/rewards 只讀', () => {
  const h = read('public/m.html'), s = read('server.js');
  assert.match(h, /\/api\/me\/rewards/); assert.match(h, /rewardsSec/);
  assert.match(s, /app\.get\('\/api\/me\/rewards', auth, requireDb/);
});

test('預約分頁：訂位／預約取餐／我的報名；首頁快捷；API 皆要求會員登入', () => {
  const h = read('public/m.html'), s = read('server.js');
  assert.match(h, /data-tab="book"/); assert.match(h, /data-go="resv"/); assert.match(h, /data-go="pickup"/); assert.match(h, /data-go="events"/);
  for (const p of ['/api/me/reservations', '/api/me/pickups', '/api/me/registrations']) { assert.ok(h.includes(p), p); assert.match(s, new RegExp(`app\\.get\\('${p.replace(/\//g, '\\/')}', auth, requireDb`)); }
  assert.match(s, /app\.post\('\/api\/me\/reservations', auth, requireDb, rateLimit/); assert.match(s, /app\.post\('\/api\/me\/pickups', auth, requireDb, rateLimit/);
  assert.match(s, /app\.delete\('\/api\/me\/reservations\/:id', auth/); assert.match(s, /app\.delete\('\/api\/me\/pickups\/:id', auth/);
  assert.match(h, /\/api\/events\/'\+encodeURIComponent\(eventId\)\+'\/ticket/, '票券 QR');
  assert.match(h, /<script src="\/menu-lib\.js"><\/script>/); assert.match(read('public/m-sw.js'), /'\/menu-lib\.js'/);
});
