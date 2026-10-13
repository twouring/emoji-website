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

test('商品細項彈窗：按鈕列固定底部、只捲中間內容、開窗鎖頁面捲動（小螢幕按鈕被擠出畫面點不到）', () => {
  assert.match(html, /#item-detail \.in\{display:flex;flex-direction:column;[^}]*overflow:hidden/);
  assert.match(html, /#item-detail #detail-body\{flex:1 1 auto;min-height:0;overflow:auto/);
  assert.match(html, /#item-detail \.sheet-actions\{flex:none/);
  assert.match(html, /<div class="row sheet-actions"><button class="btn ghost" type="button" data-close/);
  assert.match(html, /max-height:92dvh/);
  assert.match(html, /body\.sheet-open\{overflow:hidden\}/);
  assert.match(html, /function openSheet\(sel\)\{[^}]*classList\.add\('on'\);document\.body\.classList\.add\('sheet-open'\)/);
  assert.match(html, /function closeSheets\(\)\{[\s\S]*?document\.body\.classList\.remove\('sheet-open'\);\}/);
  assert.match(html, /\$\('#detail-body'\)\.scrollTop=0;openSheet\('#item-detail'\)/);
  assert.doesNotMatch(html, /\$\('#item-detail'\)\.classList\.add\('on'\)/);
  assert.doesNotMatch(html, /\$\('#item-detail'\)\.classList\.remove\('on'\)/);
  assert.match(html, /e\.target\.classList\.contains\('sheet'\)\)closeSheets\(\)/);
});

test('已點清單彈窗：品項多、多人一起點時整張單比視窗高，「送出點餐／用餐完結帳」照樣固定在底部（否則會被捲出畫面點不到、按了沒反應）', () => {
  assert.match(html, /#cart \.in\{display:flex;flex-direction:column;[^}]*overflow:hidden/);
  assert.match(html, /#cart \.sheet-body\{flex:1 1 auto;min-height:0;overflow:auto/);
  assert.match(html, /#cart \.sheet-actions\{flex:none/);
  assert.match(html, /<div class="sheet-body" id="cart-body">/);
  assert.match(html, /<div class="row sheet-actions"><button class="btn ghost" data-close/);
  assert.match(html, /\$\('#cart-body'\)\.scrollTop=0;openSheet\('#cart'\)/);
  // cart-place/cart-pay 要留在 .sheet-actions 裡，不能又回到跟著品項清單一起捲動的區塊
  assert.match(html, /sheet-actions"><button class="btn ghost" data-close data-i18n="continue">[\s\S]*?id="cart-place"[\s\S]*?id="cart-pay"/);
});
