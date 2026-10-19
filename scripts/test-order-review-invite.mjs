import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Y = require('../lib/yan.js');
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('public/order.html'), lib = read('public/order-lib.js'), server = read('server.js'), pos = read('public/pos-members.js'), docs = read('docs/API.md');
const URL_ = 'https://maps.app.goo.gl/ZKdyKqwXjVA5x6JF6?g_st=ic';

test('送單後提示用餐完到櫃檯結帳（三語）', () => {
  assert.match(lib, /place_done: '已送出點餐，餐點準備中。用餐完記得到櫃檯結帳！'/);
  assert.match(html, /toast\(tr\('place_done'\)/);
});

test('結帳意圖時跳 Google 評論邀請：餐都出完、沒有未送品項、打開已點清單；每場一次', () => {
  assert.match(html, /id="review"/);
  assert.equal(html.split(URL_).length - 1, 3);
  assert.match(html, /function checkoutIntent\(\)\{if\(!S\|\|!S\.id\)return false;var u=unpaid\(\);return u\.length>0&&!pending\(\)\.length&&u\.every\(function\(l\)\{return l\.served_at;\}\);\}/);
  assert.match(html, /\$\('#open-cart'\)\.onclick=function\(\)\{\$\('#cart-body'\)\.scrollTop=0;if\(maybeReview\(\)\)return;openSheet\('#cart'\);\}/);
  assert.match(html, /order_review_/);
  // 櫃檯結帳後的感謝頁也有評論入口
  assert.match(html, /id="thanks"[\s\S]*?data-review-link/);
  for (const k of ['review_title', 'review_hint', 'review_go', 'review_view_cart']) assert.equal(lib.split(k + ':').length - 1, 3, k);
  assert.match(lib, /5 點會員點數/);
  assert.match(html, /rel="noopener"/);
});

test('POS 會員分頁：Google 評論 +5 點，伺服器固定點數、每人一次', () => {
  assert.equal(Y.REVIEW_POINTS, 5);
  assert.match(pos, /id="members-review"/);
  assert.match(pos, /kind:'google_review'/);
  assert.match(server, /req\.body\?\.kind === 'google_review'/);
  assert.match(server, /before\.some\(x => x\.ref_type === 'review'\)/);
  assert.match(server, /status\(409\)/);
  assert.match(server, /reviewed:rows\.some/);
  assert.match(docs, /google_review/);
  const r = Y.applyGrant([], { userId: 'u1', points: Y.REVIEW_POINTS, reason: 'Google 地圖評論', operator: { id: 's1', name: 'A' } });
  assert.equal(r.delta, 5);
  assert.equal(Y.balance(r.rows), 5);
});
