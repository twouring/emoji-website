// 進駐方案（KK 11/19）：年約 12 期、每月 Stripe 訂閱 NT$3,000；月／季／年與開幕優惠停售；對外「會籍」改稱「方案」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PLAN_PRICE_TWD, SALE_PLANS, RESIDENT_TERM_MONTHS } = require('../lib/plans');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('販售方案只剩單日與進駐方案', () => {
  assert.deepEqual(SALE_PLANS, ['day_4h', 'day_12h', 'resident']);
  assert.equal(PLAN_PRICE_TWD.resident, 3000);
  assert.equal(RESIDENT_TERM_MONTHS, 12);
  assert.match(server, /if \(!SALE_PLANS\.includes\(plan\)\)/, '停售方案結帳被擋');
});

test('進駐方案走 Stripe 訂閱：每月扣款、invoice.paid 入帳、12 期後停扣', () => {
  assert.match(server, /mode: 'subscription'/);
  assert.match(server, /recurring: \{ interval: 'month' \}/);
  assert.match(server, /subscription_data: \{ metadata: meta/);
  assert.match(server, /event\.type === 'invoice\.paid'[\s\S]{0,200}fulfillResidentInvoice/);
  assert.match(server, /cancel_at: cancelAt/);
  assert.match(server, /VALUES \(\$1,\$2,'resident','stripe_inv',\$3/, '每張 invoice 冪等開通一期');
});

test('對外頁面不再出現「會籍」', () => {
  const files = ['public/system.html', 'public/space.html', 'public/stay-square.html', 'public/terms.html', 'public/refund.html', 'public/privacy.html',
    'public/brand-sites/stay-square.html', 'public/llms.txt', 'public/ai/faq.json', 'public/m.html', 'public/brand-sites/stay-square-shop.js'];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /會籍/, f);
});
