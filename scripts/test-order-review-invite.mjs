import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Y = require('../lib/yan.js');
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('public/order.html'), lib = read('public/order-lib.js'), server = read('server.js'), pos = read('public/pos-members.js'), docs = read('docs/API.md');
const RL = require('../lib/review-links.js');
const URL_ = RL.MAIN;

test('送單後提示用餐完到櫃檯結帳（三語）', () => {
  assert.match(lib, /place_done: '已送出點餐，餐點準備中。用餐完記得到櫃檯結帳！'/);
  assert.match(html, /showPlaced\(sentN\)/);   // 送出成功改成置中確認窗（KK 11/17：toast 疊在墨色頁首上看不見）
  assert.match(html, /\$\('#placed-pop-text'\)\.textContent=tr\('place_done'\)/);
  assert.match(html, /id="placed-pop"[^>]*role="alertdialog"/);
  assert.match(html, /tr\('placing'\)/);   // 送出中按鈕文字
  assert.doesNotMatch(html, /toast\(tr\('place_done'\)/);
});

test('結帳意圖時跳 Google 評論邀請：餐都出完、沒有未送品項、打開已點清單；每場一次', () => {
  assert.match(html, /id="review"/);
  assert.equal(html.split(URL_).length - 1, 2);   // HTML 預設＝總店，載入設定後依品牌換掉
  assert.doesNotMatch(html, /var REVIEW_URL=/);
  assert.match(html, /function checkoutIntent\(\)\{if\(!S\|\|!S\.id\)return false;var u=unpaid\(\)\.filter\(function\(l\)\{return !l\.song&&!l\.tip;\}\);return u\.length>0&&!pending\(\)\.length&&u\.every\(function\(l\)\{return l\.served_at;\}\);\}/);   // 點歌／打賞不算餐點
  assert.match(html, /\$\('#open-cart'\)\.onclick=function\(\)\{\$\('#cart-body'\)\.scrollTop=0;if\(maybeReview\(\)\)return;openSheet\('#cart'\);\}/);
  assert.match(html, /order_review_/);
  // 櫃檯結帳後的感謝頁也有評論入口
  assert.match(html, /id="thanks"[\s\S]*?data-review-link/);
  // 結帳完成感謝頁：評論之外也引導回 App 首頁（KK 11/2）
  assert.match(html, /id="thanks"[\s\S]*?id="thanks-home" href="https:\/\/app\.emoji\.tw\/"/);
  assert.equal(lib.split('thanks_home').length - 1, 4);
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

test('評論連結依品牌（KK 11/22）：四品牌各自 Google 商家、系統設定可覆蓋、點餐頁依場次 venue 切換', () => {
  const u = RL.reviewUrls({});
  for (const v of ['CAFE', 'BAR', 'STAY', 'REST']) assert.match(u[v], /^https:\/\/search\.google\.com\/local\/writereview\?placeid=ChIJ/, v);
  assert.equal(new Set([u.CAFE, u.BAR, u.STAY]).size, 3);   // 三家各自商家，不得共用
  assert.notEqual(u.CAFE, u.DEFAULT); assert.notEqual(u.BAR, u.DEFAULT); assert.notEqual(u.STAY, u.DEFAULT);
  assert.equal(u.DEFAULT, RL.MAIN);
  assert.equal(RL.reviewUrls({ GOOGLE_REVIEW_URL_BAR: 'https://g.page/r/x/review' }).BAR, 'https://g.page/r/x/review');
  assert.equal(RL.reviewUrls({ GOOGLE_REVIEW_URL_BAR: 'javascript:alert(1)' }).BAR, RL.DEFAULTS.BAR);   // 非 https 不採用
  const S = require('../lib/system-settings.js');
  for (const v of RL.VENUES) assert.ok(S.isLive(RL.keyOf(v)), v);
  assert.throws(() => S.validate('GOOGLE_REVIEW_URL_CAFE', 'http://x'), /https/);
  assert.match(server, /review_urls:require\('\.\/lib\/review-links'\)\.reviewUrls\(\)/);
  assert.match(server, /const publicSession=[^\n]*venue:s\.venue\|\|null/);
  assert.match(html, /function reviewVenue\(\)\{var v=\(S&&S\.venue\)\|\|document\.documentElement\.dataset\.venue/);
  assert.match(html, /markReview\(\);applyReviewLinks\(\);openSheet\('#review'\)/);
  assert.match(html, /CFG=r\[0\];applyReviewLinks\(\);/);
  assert.match(html, /applyState\(s\);rememberReviewVenue\(\);/);
  assert.match(docs, /GOOGLE_REVIEW_URL_<VENUE>/);
});
