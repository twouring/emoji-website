import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
// KK 11/2：兌換不再是會員卡裡的獨立清單，整合進下方菜單品項卡片
test('兌換整合到菜單品項，會員卡不再有兌換清單', () => {
  assert.match(html, /function redeemRow\(it\)/);
  assert.match(html, /var rd=redeemRow\(it\),card=/);
  assert.match(html, /class="item-cell">'\+card\+rd/);
  assert.match(html, /closest\('\[data-redeem\]'\)/);
  assert.doesNotMatch(html, /redeem-toggle|redeem-list|REDEEM_OPEN|redeemables\(/);
});

// KK 11/2：「最後點餐」提示壓成一行（標題＋時間同列，長語系才換行），讓菜單多露出一兩道
test('最後點餐提示為單行', () => {
  assert.match(html, /\.menu-status>div\{display:flex;flex-wrap:wrap/);
  assert.match(html, /\.menu-status small\{display:inline/);
});
