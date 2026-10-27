import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');

test('桌邊點餐：掃碼先輸入稱呼，確認後才看得到菜單', () => {
  // 稱呼關卡與點餐內容分開兩個容器
  assert.match(html, /id="name-gate"/);
  assert.match(html, /id="order-content" class="hidden"/);
  // 菜單、已出餐卡、酒精警語都在稱呼關卡「之後」的容器裡，不是跟稱呼表單同層
  const orderContentBlock = html.slice(html.indexOf('id="order-content"'), html.indexOf('</section>'));
  assert.match(orderContentBlock, /id="orders-card"/);
  assert.match(orderContentBlock, /id="menu"/);
  assert.match(orderContentBlock, /id="alcohol-notice"/);
  assert.match(orderContentBlock, /id="name-display"/);
  assert.match(orderContentBlock, /id="name-edit-btn"/);
  // 稱呼表單仍在 name-gate 卡片內，不在 order-content 裡
  const gateBlock = html.slice(html.indexOf('id="name-gate"'), html.indexOf('id="order-content"'));
  assert.match(gateBlock, /id="name-form"/);
  assert.match(gateBlock, /id="name-in"/);
});

test('桌邊點餐：開機時沒有稱呼就顯示關卡，有稱呼（localStorage）就直接看菜單', () => {
  assert.match(html, /if\(NAME\)\{hideGate\(\);\$\('#order-content'\)\.classList\.remove\('hidden'\);\$\('#name-display'\)\.textContent=NAME;\}else if\(!token\(\)\)\{showGate\(\);\}/);
  // 掃碼第一個畫面：會員登入（Google／LINE）或輸入稱呼二選一；已登入會員直接用會員名進菜單，登入失敗才回關卡
  assert.match(html, /id="name-gate"[\s\S]*id="gate-login"[\s\S]*id="gate-or"[\s\S]*id="name-form"/);
  assert.match(html, /if\(!NAME\)setName\(/);
  assert.match(html, /ME=null;renderMember\(\);if\(!NAME\)showGate\(\);/);
  assert.match(html, /function showGate\(\)\{\$\('#name-gate'\)\.classList\.remove\('hidden'\)/);
  assert.match(html, /function hideGate\(\)\{\$\('#name-gate'\)\.classList\.add\('hidden'\)/);
});

test('桌邊點餐：確認稱呼才解鎖點餐（送出前再次防呆，不再依賴輸入框現場取值）', () => {
  assert.match(html, /var needName=function\(\)\{if\(NAME\)return true;showGate\(\);return false;\}/);
  assert.doesNotMatch(html, /detail-add'\)\.onclick=function\(\)\{if\(!CURRENT_ITEM\)return;NAME=\$\('#name-in'\)/);
  assert.match(html, /detail-add'\)\.onclick=function\(\)\{if\(!CURRENT_ITEM\)return;if\(!needName\(\)\)return;/);
});

test('桌邊點餐：名字沒確認前，下方結帳列也不顯示', () => {
  assert.match(html, /\$\('#bar'\)\.hidden=!NAME;/);
  assert.doesNotMatch(html, /\$\('#bar'\)\.hidden=false;/);
});

test('稱呼關卡「略過」：以桌號＋流水號命名（同桌已出現的稱呼數＋1，撞名往後推）後直接進菜單', () => {
  assert.match(html, /<button class="btn ghost" type="button" id="name-skip" data-i18n="name_skip">略過<\/button>/);
  assert.match(html, /\$\('#name-skip'\)\.onclick=function\(\)\{[\s\S]*?var v=base\+'-'\+n;while\(seen\[v\]\)\{n\+\+;v=base\+'-'\+n;\}\s*setName\(v\.slice\(0,20\)\);/);
  assert.match(html, /function setName\(v\)\{\s*NAME=v;try\{localStorage\.setItem\('order_name',NAME\);\}/);
  assert.match(lib, /name_skip: '略過'/); assert.match(lib, /name_skip: 'Skip'/); assert.match(lib, /name_skip: 'スキップ'/);
});

test('稱呼關卡文案提供三語並可事後更改', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    assert.match(lib, new RegExp(`name_gate_title:`));
    assert.match(lib, new RegExp(`name_gate_submit:`));
  }
  assert.match(lib, /ordering_as:/);
  assert.match(lib, /name_edit:/);
});
