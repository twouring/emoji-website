// 結帳右欄順序（KK 11/5）：會員 → 發票 → 支付方式 → 結帳內容；區塊用標題＋細線分隔，不框中框
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
test('右欄區塊順序：會員 → 發票 → 支付方式 → 結帳內容', () => {
  const a = js.indexOf('<div class="pos-pay">');
  const z = js.indexOf('<div class="pos-dock">', a);
  const pay = js.slice(a, z);
  const at = k => { const i = pay.indexOf(k); assert.ok(i > 0, k); return i; };
  const order = [at('id="pos-member-open"'), at('<b>發票</b>'), at('<b>支付方式</b>'), at('<b>結帳內容</b>')];
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.ok(at('class="pos-methods"') > order[2] && at('class="pos-methods"') < order[3], '付款方式鍵在支付方式區');
  assert.ok(at('id="pos-received"') > order[2] && at('id="pos-received"') < order[3], '現金實收跟著支付方式');
  assert.ok(at('class="pos-sum-disc"') > order[3], '折扣在結帳內容區');
  assert.ok(!pay.includes('pos-inv-badge'), '發票不再另放與選中鍵重複的徽章');
});
test('區塊樣式：標題＋細線，內層不再加框與底色', () => {
  assert.match(css, /\.pos-blk\{display:grid;gap:8px;padding:12px 0;border-top:1px solid var\(--line\)\}/);
  assert.match(css, /\.pos-invoice \.pos-invoice-body\{padding:0;border:0;border-radius:0;background:none/);
  assert.match(css, /\.pos-blk--sum \.pos-sum\{border:0;border-radius:0;background:none\}/);
});
