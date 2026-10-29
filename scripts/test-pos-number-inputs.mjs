import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const inputs = [...ops.matchAll(/<input[^>]*>/g)].map(m => m[0]);
const find = re => inputs.find(i => re.test(i));

test('POS 純數字欄位（金額、張數、人數、分鐘）一律 type=number', () => {
  for (const re of [/data-split=/, /id="pos-disc-value"/, /id="pos-received"/, /data-denom=/, /id="reg-open-total"/, /id="acct-actual"/, /id="reg-keep"/, /id="reg-cash-amount"/, /id="reg-count-total"/, /data-f="headcount"/, /id="mk-break"/, /id="fx-break"/, /id="resv-new-party"/, /id="re-party"/]) {
    const el = find(re); assert.ok(el, String(re));
    assert.match(el, /type="number"/, el); assert.match(el, /inputmode="numeric"/, el);
  }
});

test('沒有 inputmode=numeric 卻不是 type=number 的欄位，只剩代碼類（可能開頭 0、要限長度）', () => {
  const left = inputs.filter(i => /inputmode="numeric"/.test(i) && !/type="number"/.test(i));
  const ok = [/name="buyer_ubn"/, /name="love_code"/, /data-code/, /id="st-pin"/];
  for (const el of left) assert.ok(ok.some(r => r.test(el)), el);
});

test('隱藏 number 的上下微調箭頭', () => {
  assert.match(css, /::-webkit-inner-spin-button/);
  assert.match(css, /appearance:textfield/);
});
