// 常用折扣一鍵套用（KK 11/3）：結帳面板直接列出，按一下就帶入類型＋數值＋原因
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('常用折扣清單：每筆都有類型、數值、原因與標籤', () => {
  const src = ops.match(/const DISCOUNT_PRESETS=\[[^\n]*\];/)[0];
  const list = vm.runInNewContext(src.replace('const DISCOUNT_PRESETS=', '(') .replace(/;$/, ')'));
  assert.ok(list.length >= 3);
  for (const d of list) {
    assert.ok(['percent', 'amount'].includes(d.type));
    assert.ok(Number.isInteger(d.value) && d.value > 0 && d.value <= 100);
    assert.ok(d.reason && d.label);
  }
  assert.ok(list.some(d => d.reason === '員工' && d.value === 20));
  // 免費兌換（KK 11/9）：100% 折扣，應收 0、服務費跟著歸零、0 元單不開發票
  assert.ok(list.some(d => d.type === 'percent' && d.value === 100 && d.reason === '免費兌換' && d.label === '免費兌換'));
});

test('結帳面板：未套折扣時顯示一鍵鍵，按下直接套用（不必再開表單）', () => {
  assert.match(ops, /data-disc-preset="\$\{i\}"/);
  assert.match(ops, /!aa&&!POS_DISCOUNT&&!POS_DISC_OPEN\?`<div class="reason-chips pos-disc-presets"/);
  assert.match(ops, /\[data-disc-preset\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{const d=DISCOUNT_PRESETS\[[^\]]+\];if\(!d\)return;POS_DISCOUNT=\{type:d\.type,value:d\.value,reason:d\.reason\}/);
});

test('百分比折扣顯示成「幾折」', () => {
  const src = ops.match(/const zheText=[^\n]*/)[0];
  const zheText = vm.runInNewContext(src.replace('const zheText=', '(').replace(/;$/, '') + ')');
  assert.equal(zheText(20), '8 折');
  assert.equal(zheText(15), '85 折');
  assert.equal(zheText(10), '9 折');
  assert.equal(zheText(100), '免費');
});

test('免費兌換：折扣文字不重複「免費」', () => {
  const ctx = { num: n => String(n) };
  vm.runInNewContext(ops.match(/const zheText=[^\n]*/)[0].replace('const ', 'var '), ctx);
  vm.runInNewContext(ops.match(/const discountText=[^\n]*/)[0].replace('const ', 'var '), ctx);
  assert.equal(ctx.discountText({ type: 'percent', value: 100, reason: '免費兌換' }), '免費兌換');
  assert.equal(ctx.discountText({ type: 'percent', value: 20, reason: '員工' }), '8 折・員工');
  assert.equal(ctx.discountText({ type: 'amount', value: 50, reason: '補償' }), 'NT$50・補償');
});
