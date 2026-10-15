// 2026-10-15：等等空間移除點數制，會員所有設備自由使用。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const server = read('server.js');
const PAGES = ['member.html', 'en/member.html', 'ja/member.html'];

test('點數相關程式與 API 已移除', () => {
  assert.equal(fs.existsSync(new URL('../lib/points.js', import.meta.url)), false);
  assert.doesNotMatch(server, /\/api\/(me|admin)\/points|\/api\/points|grantMembershipGift|fulfillPointsCheckout|point_(orders|lots|ledger|redemptions|refunds)/);
  assert.doesNotMatch(server, /MEMBERSHIP_GIFT_POINTS|pointsSummaryFor|points_balance/);
});

test('會籍價目表仍可用', () => {
  const { PLAN_PRICE_TWD } = createRequire(import.meta.url)('../lib/plans');
  assert.deepEqual(PLAN_PRICE_TWD, { day_4h: 200, day_12h: 500, month: 4000, quarter: 10000, year: 35000 });
});

test('會員頁（三語）不再有點數錢包、購點、兌換、退款', () => {
  for (const page of PAGES) {
    const html = read('public/' + page);
    assert.doesNotMatch(html, /renderPoints|buyPack|redeemService|refundPoints|fulfillPointsIfNeeded|\/api\/me\/points/, page);
    assert.doesNotMatch(html, /點數錢包|購買點數|兌換服務|Points wallet|Buy points/, page);
  }
});

test('後台會員名單沒有點數欄與發點表單', () => {
  const html = read('public/admin.html');
  assert.doesNotMatch(html, /points_balance|pg-go|data-grant-uid|\/admin\/points\/grants/);
});

test('公開文案（三語）改為會員所有設備自由使用', () => {
  for (const f of ['public/system.html', 'public/en/system.html', 'public/ja/system.html']) {
    const html = read(f);
    assert.match(html, /id="facilities"/, f);
    assert.doesNotMatch(html, /70 點|100 點|70 points|100 points|70ポイント|100ポイント|贈點|gift points|bonus points|贈呈ポイント/, f);
  }
  for (const f of ['public/index.html', 'public/en/index.html', 'public/ja/index.html', 'public/llms.txt', 'public/llms-full.txt',
    'public/fellow/index.html', 'public/en/fellow/index.html', 'public/ja/fellow/index.html', 'public/fellow/app.js']) {
    assert.doesNotMatch(read(f), /贈點|20,000 點|gift points|one-year bonus points|贈呈ポイント|20,000ポイント/, f);
  }
});
