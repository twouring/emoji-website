import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');

test('掃碼點餐依台北時間切換供應品牌，但不標示白天或晚上菜單', () => {
  assert.match(html, /id="menu-shift"/);
  assert.doesNotMatch(html, /白天菜單/);
  assert.doesNotMatch(html, /晚上菜單/);
  assert.doesNotMatch(html, /Day menu/);
  assert.doesNotMatch(html, /Evening menu/);
  assert.match(html, /MenuLib\.activeVenue\(\)/);
  assert.match(html, /17:00／03:00／08:00 換品牌/);
});

test('掃碼點餐手機流程提醒用餐完再到櫃檯結帳', () => {
  assert.match(html, /用餐完再到櫃檯結帳/);
  assert.match(html, /櫃檯結帳/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(html, />結帳<\/button>/);
});

test('掃碼點餐提供多國語系切換與三種分帳方式', () => {
  assert.match(html, /id="lang-toggle"/);
  assert.match(html, /order-lib\.js/);
  assert.match(html, /value="all"/);
  assert.match(html, /value="mine"/);
  assert.match(html, /value="split"/);
  assert.match(html, /id="split-people"/);
  assert.match(html, /OrderLib\.splitBill/);
  assert.match(html, /LANG==='zh'\?'EN'/);
});

test('關鍵操作使用可存取的內嵌 SVG icon 輔助文字', () => {
  for (const id of ['globe', 'clock', 'cart', 'receipt', 'users', 'user', 'split', 'counter', 'bell', 'check']) {
    assert.match(html, new RegExp(`id="i-${id}"`), id);
  }
  assert.match(html, /class="ico" aria-hidden="true"/);
  assert.match(html, /href="#i-globe"/);
  assert.match(html, /href="#i-cart"/);
  assert.match(html, /href="#i-split"/);
  assert.match(html, /var icon=function\(name\)/);
});


test('掃碼點餐以圖片優先商品卡與細項面板收集規格', () => {
  assert.match(html, /class="menu-grid"/);
  assert.match(html, /data-open-item/);
  assert.match(html, /id="item-detail"/);
  assert.match(html, /OrderLib\.optionGroups/);
  assert.match(html, /name="opt_/);
  assert.match(html, /id="detail-note"/);
  assert.match(html, /note:optionNote\(\)/);
  assert.match(html, /@media \(max-width:320px\)/);
});
