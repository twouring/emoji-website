// 廣告歸因（KK 11/23）：Meta 廣告落地頁是子品牌站，utm 首次來源 cookie 必須在子品牌分流前寫入、跨 .emoji.tw，訂位帶進 source。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const s = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('utm 來源 cookie 在子品牌站分流之前', () => {
  const utm = s.indexOf("res.cookie('src',");
  const brand = s.indexOf('const slug = BRAND_HOSTS[String(req.hostname');
  assert.ok(utm > 0 && brand > 0);
  assert.ok(utm < brand, 'utm 中介層要排在子品牌站分流前，否則 atcafe/3am/staysquare/restbook 的廣告到訪會漏記');
});

test('來源 cookie 設在 .emoji.tw', () => {
  assert.match(s, /res\.cookie\('src',[^\n]*domain: srcCookieDomain\(req\)/);
  assert.match(s, /const srcCookieDomain = req => [^\n]*'\.emoji\.tw'/);
});

test('官網與 App 訂位都把首次來源寫進 source', () => {
  const web = s.slice(s.indexOf("app.post('/api/reservations'"), s.indexOf("app.post('/api/me/reservations'"));
  const app = s.slice(s.indexOf("app.post('/api/me/reservations'"), s.indexOf("app.get('/api/me/reservations'"));
  for (const block of [web, app]) {
    const set = block.indexOf("r.source = ('src:' + src");
    assert.ok(set > 0, '缺少 src 歸因');
    assert.ok(set < block.indexOf('INSERT INTO dining_reservations'), '要在寫入前設定');
  }
});
