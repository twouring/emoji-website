// 桌邊點餐頁的金流審核揭露：公司名稱＋統編、收費表、客服、退款政策、「TapPay 提供金流服務」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const html = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
require('../public/order-lib.js');
const OrderLib = globalThis.OrderLib;

test('order.html 有店家資訊區塊，且在 #app 之外（錯誤／結束畫面也看得到）', () => {
  const footerAt = html.indexOf('id="site-info"');
  assert.ok(footerAt > 0);
  assert.ok(footerAt > html.indexOf('</section>'), '店家資訊不可包在 #app section 內');
  assert.ok(footerAt < html.indexOf('</main>'));
  assert.match(html, /言文字股份有限公司/);
  assert.match(html, /93537055/);
  assert.match(html, /id="price-table"/);
  assert.match(html, /function renderPriceTable/);
  assert.match(html, /href="tel:\+886921102067"/);
  assert.match(html, /href="mailto:us@emoji\.tw"/);
  assert.match(html, /href="\/refund"/);
});

test('首頁與結帳（已點清單）都有 TapPay 金流字樣', () => {
  assert.match(html, /id="tappay-note"[^>]*><span data-i18n="info_tappay">/);
  assert.match(html, /id="cart-tappay"[^>]*><span data-i18n="info_tappay">/);
  const cart = html.slice(html.indexOf('id="cart-body"'), html.indexOf('id="cart-body"') + 1200);
  assert.match(cart, /cart-tappay/);
});

test('三語字串都有揭露文案，TapPay 字樣不可漏', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    for (const k of ['info_title', 'info_company', 'info_tax_id', 'info_prices', 'info_support', 'info_refund', 'info_refund_text', 'info_tappay']) {
      const v = OrderLib.text(lang, k);
      assert.ok(v && v !== k, `${lang}.${k} 缺字串`);
    }
    assert.match(OrderLib.text(lang, 'info_tappay'), /TapPay/);
    assert.match(OrderLib.text(lang, 'info_tax_id'), /93537055/);
  }
  assert.match(OrderLib.text('zh', 'info_tappay'), /TapPay 提供金流服務/);
});
