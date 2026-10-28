import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
test('桌邊點餐只顯示目前語系，不並列副語品名', () => {
  assert.doesNotMatch(html, /secondary/);
  assert.doesNotMatch(html, /LANG==='zh'\?(it|v|CURRENT_ITEM)\.en/);
  assert.match(html, /var noteOf=function\(it\)\{return LANG==='en'\?\(it\.note_en\|\|''\):LANG==='ja'\?\(it\.note_ja\|\|''\):it\.note;\};/);
});
