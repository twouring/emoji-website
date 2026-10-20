import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');

test('掃碼點餐依台北時間切換供應品牌，但不標示白天或晚上菜單', () => {
  assert.match(html, /id="menu-shift"/);
  assert.doesNotMatch(html, /白天菜單/);
  assert.doesNotMatch(html, /晚上菜單/);
  assert.doesNotMatch(html, /Day menu/);
  assert.doesNotMatch(html, /Evening menu/);
  assert.match(html, /MenuLib\.orderWindow\(\)/);
  assert.match(html, /16:00／16:30／02:00／02:30／08:00 換時段/);
});

test('桌邊點餐沒有結帳鍵：客人到櫃檯告知，現場人員在 POS 結帳', () => {
  assert.match(html, /離席前請到櫃檯結帳/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(html, />結帳<\/button>/);
  for (const id of ['open-pay', 'cart-pay', 'pay-notify', 'pay-cancel', 'pay-scope', 'split-people']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), id);
  }
  assert.doesNotMatch(html, /class="sheet" id="pay"/);
  assert.doesNotMatch(html, /data-i18n="checkout"/);
  assert.doesNotMatch(html, /\/pay-request'/, '客人端不再送「通知櫃檯結帳」');
});

test('掃碼點餐提供多國語系切換', () => {
  assert.match(html, /id="lang-toggle"/);
  assert.match(html, /order-lib\.js/);
  assert.match(html, /LANG==='zh'\?'EN'/);
});

test('關鍵操作使用可存取的內嵌 SVG icon 輔助文字', () => {
  for (const id of ['globe', 'clock', 'cart', 'receipt', 'users', 'user', 'split', 'counter', 'bell', 'check']) {
    assert.match(html, new RegExp(`id="i-${id}"`), id);
  }
  assert.match(html, /class="ico" aria-hidden="true"/);
  assert.match(html, /href="#i-globe"/);
  assert.match(html, /href="#i-cart"/);
  assert.match(html, /href="#i-bell"/);
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

test('餐點詳情＝獨立頁面：全螢幕、只捲中間內容、「上一步」固定底部；開頁 pushState 讓手機返回手勢回菜單並保留捲動位置', () => {
  assert.match(html, /#item-detail\{background:var\(--paper\);align-items:stretch\}/, '不是半透明底部彈窗，是整頁');
  assert.match(html, /#item-detail \.in\{display:flex;flex-direction:column;[^}]*overflow:hidden;max-height:none;height:100%;border-radius:0/);
  assert.match(html, /#item-detail #detail-body\{flex:1 1 auto;min-height:0;overflow:auto/);
  assert.match(html, /#item-detail \.sheet-actions\{flex:none/);
  assert.match(html, /<div class="row sheet-actions"><button class="btn ghost with-icon" type="button" data-close>[\s\S]*?data-i18n="back_step">上一步</);
  assert.match(html, /max-height:92dvh/);
  assert.match(html, /body\.sheet-open\{overflow:hidden\}/);
  assert.match(html, /function openSheet\(sel\)\{[\s\S]*?history\.pushState\(\{sheet:sel\},''\)[\s\S]*?classList\.add\('on'\);document\.body\.classList\.add\('sheet-open'\)/);
  assert.match(html, /function closeSheets\(viaHistory\)\{[\s\S]*?document\.body\.classList\.remove\('sheet-open'\);[\s\S]*?history\.back\(\)/);
  assert.match(html, /window\.addEventListener\('popstate',function\(\)\{if\(SHEET_OPEN\)closeSheets\(true\);\}\)/, '返回手勢關閉詳情頁');
  assert.match(html, /\$\('#detail-body'\)\.scrollTop=0;openSheet\('#item-detail'\)/);
  assert.doesNotMatch(html, /\$\('#item-detail'\)\.classList\.add\('on'\)/);
  assert.doesNotMatch(html, /\$\('#item-detail'\)\.classList\.remove\('on'\)/);
  assert.match(html, /e\.target\.classList\.contains\('sheet'\)\)closeSheets\(\)/);
});

test('小螢幕：按鈕一律不斷行；375px／320px 底部列金額欄保最小寬、按鈕縮內距不折行', () => {
  assert.match(html, /\.btn\{[^}]*white-space:nowrap\}/);
  assert.match(html, /@media \(max-width:400px\)\{\.bar\{grid-template-columns:minmax\(84px,1fr\) auto auto/);
  assert.match(html, /@media \(max-width:320px\)\{[^@]*\.bar\{grid-template-columns:minmax\(72px,1fr\) auto auto/);
  assert.match(html, /\.name-actions \.btn\{flex:1 1 0;min-width:0;white-space:nowrap\}/);
});

test('出餐通知：一進頁面就請求通知權限；POS 出某一道 → 輪詢到 served_at → 頁內橫幅＋提示音；拒絕授權仍有橫幅；確認稱呼時解鎖 iOS 音效', () => {
  assert.match(html, /function askNotify\(\)\{[^}]*Notification\.requestPermission\(\)/);
  assert.match(html, /askNotify\(\);\s*renderMenu\(\);renderState\(\);live\(\);poll\(\);/, '啟動時就問');
  assert.match(html, /if\(l\.served_at&&!l\.order_id&&!seenServed\[l\.line\]\)/, '品項層級判斷新出餐');
  assert.match(html, /SERVED_READY=true;/, '第一次載入不通知');
  assert.match(html, /function notifyGuest\(text\)\{[\s\S]*?ready-banner[\s\S]*?beep\(\);[\s\S]*?Notification\.permission==='granted'/);
  assert.match(html, /function unlockAudio\(\)/); assert.match(html, /hideGate\(\);unlockAudio\(\);/, '確認稱呼時解鎖音效');
  assert.match(lib, /served_banner: '桌號 \{table\}｜\{items\} 已送到桌上'/); assert.match(lib, /served_banner: 'Table/); assert.match(lib, /served_banner: 'テーブル/);
});

test('已點清單彈窗：品項多、多人一起點時整張單比視窗高，「送出點餐／用餐完結帳」照樣固定在底部（否則會被捲出畫面點不到、按了沒反應）', () => {
  assert.match(html, /#cart \.in\{display:flex;flex-direction:column;[^}]*overflow:hidden/);
  assert.match(html, /#cart \.sheet-body\{flex:1 1 auto;min-height:0;overflow:auto/);
  assert.match(html, /#cart \.sheet-actions\{flex:none/);
  assert.match(html, /<div class="sheet-body" id="cart-body">/);
  assert.match(html, /<div class="row sheet-actions"><button class="btn ghost" data-close/);
  assert.match(html, /\$\('#cart-body'\)\.scrollTop=0;openSheet\('#cart'\)/);
  // cart-place 要留在 .sheet-actions 裡，不能又回到跟著品項清單一起捲動的區塊
  assert.match(html, /sheet-actions"><button class="btn ghost" data-close data-i18n="continue">[\s\S]*?id="cart-place"/);
});

test('掃碼點餐菜單為單欄小方圖列表（大圖只在詳細頁）', () => {
  const h = html;
  assert.match(h, /\.menu-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(h, /\.item img,\.item \.ph\{width:60px;height:60px/);
  assert.doesNotMatch(h, /\.item img[^}]*aspect-ratio:4\/3/);
  assert.doesNotMatch(h, /\.menu-grid\{grid-template-columns:1fr 1fr/);
});
