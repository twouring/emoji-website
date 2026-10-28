import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
test('桌邊點餐只顯示目前語系，不並列副語品名', () => {
  assert.doesNotMatch(html, /secondary/);
  assert.doesNotMatch(html, /LANG==='zh'\?(it|v|CURRENT_ITEM)\.en/);
  // 韓文（10/28）：沒有 note_ko 時退回 note_en，仍是單一語系，不會出現中文產品內容
  assert.match(html, /var noteOf=function\(it\)\{return LANG==='en'\?\(it\.note_en\|\|''\):LANG==='ja'\?\(it\.note_ja\|\|''\):LANG==='ko'\?\(it\.note_ko\|\|it\.note_en\|\|''\):it\.note;\};/);
});
