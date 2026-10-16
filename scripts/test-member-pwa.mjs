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
