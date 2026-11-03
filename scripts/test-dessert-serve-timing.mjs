// scripts/test-dessert-serve-timing.mjs — KK 11/4：甜點必選「先上／後上」（沒有預設，桌邊點餐與 POS 都要點選才能加入）；三點水掃碼先看低消說明
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import '../public/order-lib.js';
import '../public/menu-lib.js';

const O = globalThis.OrderLib, M = globalThis.MenuLib;
const html = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('甜點有必選「上餐時間：先上／後上」，四語；其他類別沒有', () => {
  for (const l of ['zh', 'en', 'ja', 'ko']) {
    const g = O.optionGroups({ cat: 'DESSERT', zh: '檸檬塔' }, l);
    assert.equal(g.length, 1, l); assert.equal(g[0].key, 'serve'); assert.equal(g[0].required, true); assert.equal(g[0].choices.length, 2);
  }
  assert.deepEqual(O.optionGroups({ cat: 'DESSERT', zh: '檸檬塔' }, 'zh')[0].choices, ['先上', '後上']);
  assert.ok(!O.optionGroups({ cat: 'GRILL', zh: '嫩燒梅花豬蔥芥末醬' }, 'zh').some(g => g.key === 'serve'));
});

test('missingRequired：沒點選就擋，點了就放行', () => {
  const g = O.optionGroups({ cat: 'DESSERT', zh: '檸檬塔' }, 'zh');
  assert.equal(O.missingRequired(g, {}).length, 1);
  assert.equal(O.missingRequired(g, { serve: '後上' }).length, 0);
  assert.equal(O.missingRequired(O.optionGroups({ cat: 'COFFEE', zh: '美式咖啡' }, 'zh'), {}).length, 0, '有預設值的規格不算缺');
});

test('外文規格翻回中文出單：Serving：Serve after meal → 上餐時間：後上', () => {
  assert.equal(O.optionZh('Serving：Serve after meal'), '上餐時間：後上');
  assert.equal(O.optionZh('提供タイミング：先に'), '上餐時間：先上');
});

test('桌邊點餐：required 不預選，送出前擋下並提示；POS 面板同樣不預選、確定前擋下', () => {
  assert.match(html, /\(i===0&&!g\.required\?'checked':''\)/);
  assert.match(html, /OrderLib\.missingRequired\(optionGroups\(CURRENT_ITEM\),pickedOptions\(\)\)/);
  assert.match(ops, /groups\.forEach\(g=>\{ if\(!g\.required\)picks\[g\.key\]=g\.choices\[0\]; \}\)/);
  assert.match(ops, /OrderLib\.missingRequired\(groups,o\.picks\)[^\n]*toast\('請先選「'/);
  assert.match(ops, /上餐時間:'serve'/, '出餐單規格籤有自己的顏色');
});

test('三點水低消說明頁：只在三點水時段、每桌每支手機一次、按「我知道了」才關', () => {
  assert.match(html, /<div id="policy" class="hidden" role="dialog"/);
  assert.match(html, /function needPolicy\(\)\{if\(VENUE!=='BAR'/);
  assert.match(html, /if\(needPolicy\(\)\)showPolicy\(\);/);
  assert.match(html, /\$\('#policy-ok'\)\.onclick=function\(\)\{try\{localStorage\.setItem\(policyKey\(\),'1'\)/);
  for (const l of ['zh', 'en', 'ja', 'ko']) for (const k of ['policy_title', 'policy_min_v', 'policy_ok', 'pick_required']) assert.notEqual(O.text(l, k), k, `${l}.${k}`);
  assert.equal(M.MIN_SPEND.weekday, 300); assert.equal(M.MIN_SPEND.weekend, 600);
});
