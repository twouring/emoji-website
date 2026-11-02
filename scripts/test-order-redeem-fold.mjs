import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
// KK 11/2：掃碼後先看到菜單；兌換從會員列點開才顯示，不在每道菜下方塞兌換框
test('兌換由會員列點開，菜單品項不附兌換框', () => {
  assert.match(html, /function redeemables\(\)/);
  assert.match(html, /id="member-redeem"/);
  assert.match(html, /REDEEM_OPEN=!REDEEM_OPEN/);
  assert.match(html, /class="member-rewards"/);
  assert.doesNotMatch(html, /function redeemRow\(it\)/);
  assert.doesNotMatch(html, /class="item-cell">'\+card\+rd/);
});

// KK 11/2：「最後點餐」提示壓成一行（標題＋時間同列，長語系才換行），讓菜單多露出一兩道
test('最後點餐提示為單行', () => {
  assert.match(html, /\.menu-status>div\{display:flex;flex-wrap:wrap/);
  assert.match(html, /\.menu-status small\{display:inline/);
});
