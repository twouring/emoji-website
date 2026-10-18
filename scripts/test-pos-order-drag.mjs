import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8');
test('桌位固定：每桌一格，單卡放在格內，格頭顯示桌號',()=>{
  assert.match(js,/const slotHtml=t=>`<div class="pos-slot" data-slot=/);
  assert.match(js,/const grid=baseNames\.map\(slotHtml\)/);
});
test('單卡顯示開桌／開單時間與經過時間',()=>{
  assert.match(js,/class="pos-order-time"[^`]*clockText\(s\.created_at\)[^`]*elapsedText\(s\.created_at\)/);
});
test('單卡可拖到別的桌位：呼叫 move API，目標有單先確認併桌',()=>{
  assert.match(js,/function bindOrderDrag/);
  assert.match(js,/bindOrderDrag\(host,async\(id,from,to\)=>/);
  assert.match(js,/'\/admin\/orders\/sessions\/'\+id\+'\/move'/);
  assert.match(js,/pos-ghost/);
});
test('外帶單沒有桌位，排在右側直欄',()=>{
  assert.match(js,/<aside class="pos-takeouts"/);
  assert.match(js,/takeouts\.map\(cardHtml\)/);
  assert.match(css,/\.pos-takeouts\{flex:0 0/);
});
