import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../docs/API.md',import.meta.url),'utf8');
const route=server.slice(server.indexOf("app.post('/api/admin/orders/sessions/:id/move'"),server.indexOf("app.delete('/api/admin/orders/sessions/:id/pay-requests"));
test('move API：{takeout:true} 自動取 W 號，與開外帶單同一把鎖',()=>{
  assert.match(route,/const toTakeout=req\.body\?\.takeout===true/);
  assert.match(route,/\['table:takeout'\]/);
  assert.match(route,/tableOrders\.nextTakeoutTable\(used\)/);
  assert.match(route,/已經是外帶單了/);
  assert.match(route,/外帶單號已用完/);
  assert.match(route,/takeout:toTakeout/);
  // 仍然不能直接指定 W 號
  assert.match(route,/!toTakeout&&tableOrders\.isTakeout\(table\)/);
});
test('API 文件寫到 takeout:true',()=>{assert.match(api,/\{ takeout: true \}/);});
test('換桌視窗有「移到外帶」，外帶區可當拖放目標',()=>{
  assert.match(js,/data-takeout>移到外帶<\/button>/);
  assert.match(js,/function moveToTakeout\(id,then\)\{return opsThen\(\(\)=>api\('\/admin\/orders\/sessions\/'\+id\+'\/move',\{method:'POST',body:\{takeout:true\}\}\)/);
  assert.match(js,/<aside class="pos-takeouts" aria-label="外帶單" data-slot="\$\{TAKEOUT_SLOT\}">/);
  assert.match(js,/if\(to===TAKEOUT_SLOT\)\{if\(src\?\.takeout\)return;return moveToTakeout\(id,/);
  assert.match(css,/\.pos-takeouts\.drop-ok/);
});
test('TAKEOUT_SLOT 不會跟真的桌號相撞',async()=>{
  const {TABLE_RE}=await import('../lib/table-orders.js');
  assert.equal(TABLE_RE.test('外帶'),false);
});
test('外帶單可轉內用：按鈕不藏、外帶單可拖回桌位、拖到外帶欄不動作',()=>{
  assert.match(js,/id="pos-move">\$\{cur\.takeout\?'轉內用':'換桌／併桌'\}<\/button>/);
  assert.doesNotMatch(js,/id="pos-move" \$\{cur\.takeout\?'hidden':''\}/);
  assert.doesNotMatch(js,/card\.classList\.contains\('takeout'\)/);
  assert.match(js,/const board=host\.querySelector\('\.pos-tables-row'\)/);
  assert.match(js,/if\(to===TAKEOUT_SLOT\)\{if\(src\?\.takeout\)return;/);
  // 伺服器 move 只擋「目標是 W 號」，不擋來源是外帶單
  assert.doesNotMatch(route,/isTakeout\(src\.table_no\)\)\{await client\.query\('ROLLBACK'\);return res\.status\(400\)\.json\(\{error:'外帶/);
  assert.match(route,/toTakeout&&tableOrders\.isTakeout\(src\.table_no\)/);
});
