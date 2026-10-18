import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8');
test('桌位固定：每桌一格，單卡放在格內，格頭顯示桌號',()=>{
  assert.match(js,/const slotHtml=t=>`<div class="pos-slot [^"]*" data-slot=/);
  assert.match(js,/const grid=baseNames\.map\(slotHtml\)/);
});
test('單卡顯示開桌／開單時間與經過時間',()=>{
  assert.match(js,/class="tk-time pos-order-time">[^`]*clockText\(at\)/);assert.doesNotMatch(js,/elapsedShort\(s\.created_at\)/);
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
  assert.match(css,/\.pos-takeouts\{flex:0 0/);assert.match(js,/class="pos-takeout-list"/);
});
test('單卡是單子版型（票頭／內容／票尾），拖完 600ms 內吃掉 click 不進帳單',()=>{
  assert.match(js,/class="tk-time pos-order-time"/);
  assert.match(js,/Date\.now\(\)-LAST_DRAG<600/);
});
test('v3：外帶標題與櫃檯結帳同列、平面圖桌不重複、拖完不開目標桌',()=>{
  assert.match(js,/<aside class="pos-takeouts" aria-label="外帶單"><div class="ops-head"><h2>外帶/);
  assert.match(js,/class="pos-slot \$\{layoutPos\[t\]\?'is-placed':''\}"/);
  assert.match(css,/\.pos-grid \.pos-slot\.is-placed\{display:none\}/);
  assert.match(js,/已換到 \$\{out\.table\}`,\(\)=>\{POS_TABLE='';return reload\(\);\}\);\n  \}\);/);
});
