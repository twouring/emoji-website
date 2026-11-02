import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
// KK 11/2：掃碼後先看到菜單，兌換清單預設收合、點「用點數兌換」才展開
test('兌換清單預設收合，點標題才展開', () => {
  assert.match(html, /var REDEEM_OPEN=false;/);
  assert.match(html, /id="redeem-toggle" aria-controls="redeem-list" aria-expanded="'\+\(REDEEM_OPEN\?'true':'false'\)/);
  assert.match(html, /id="redeem-list"'\+\(REDEEM_OPEN\?'':' hidden'\)/);
  assert.match(html, /\.redeem-list\[hidden\]\{display:none\}/);
  assert.match(html, /REDEEM_OPEN=!REDEEM_OPEN/);
  assert.doesNotMatch(html, /class="redeem-title"/);
});

// KK 11/2：「最後點餐」提示壓成一行（標題＋時間同列，長語系才換行），讓菜單多露出一兩道
test('最後點餐提示為單行', () => {
  assert.match(html, /\.menu-status>div\{display:flex;flex-wrap:wrap/);
  assert.match(html, /\.menu-status small\{display:inline/);
});
