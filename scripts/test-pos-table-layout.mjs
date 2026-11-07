import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const srv=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../docs/API.md',import.meta.url),'utf8');
test('POS 桌況有編輯桌位按鈕與拖拉',()=>{
  assert.match(js,/id="pos-edit-tables"/);assert.match(js,/function bindTableDrag/);
  assert.match(js,/pointerdown/);assert.match(js,/class="pos-floor pos-floor-edit"/);assert.match(js,/function defaultTablePos/);assert.match(js,/\/admin\/orders\/table-layout/);
});
test('桌位排列存伺服器並隨 /admin/orders 回傳',()=>{
  assert.match(srv,/app\.post\('\/api\/admin\/orders\/table-layout'/);assert.match(srv,/table_layout:tableLayoutParse/);
  assert.match(api,/POST \/api\/admin\/orders\/table-layout/);assert.match(srv,/req\.body\?\.pos/);
});
test('桌位可拖右下角調整大小，寬高隨 [x,y,w,h] 儲存',()=>{
  assert.match(js,/data-rz/);assert.match(js,/drag\.rz/);assert.match(srv,/xy\.length!==4/);
});
test('編輯桌位的完成／還原／取消在標題列、iPad 橫放固定在頂端（KK 11/2：放平面圖下方會被裁掉按不到）',()=>{
  const css=fs.readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8');
  assert.match(js,/<div class="ops-head pos-edit-bar"><h2>編輯桌位擺放<\/h2><div class="pos-edit-acts"><button[^>]*id="pos-edit-done"/);
  assert.doesNotMatch(js,/pos-floor-edit[^`]*<div class="pos-open"><button[^>]*id="pos-edit-done"/);
  assert.match(css,/\.pos-tables\.pos-editing\{overflow-y:auto/);assert.match(css,/\.pos-editing \.pos-edit-bar\{position:sticky;top:0/);
});
test('編輯桌位可加減桌（KK 11/7）：桌號清單存 table_layout.tables，全店共用',()=>{
  assert.match(js,/id="pos-edit-add"/);assert.match(js,/data-del-table=/);assert.match(js,/function posTables\(d\)/);
  assert.match(js,/body:\{pos,tables\}/);assert.match(js,/使用中，先結帳清桌再移除/);
  assert.doesNotMatch(js,/\.\.\.DEFAULT_TABLES,\.\.\.sessions/);   // 桌況、換桌都改讀 posTables()
  assert.match(srv,/req\.body\?\.tables!==undefined/);assert.match(srv,/new Set\(t\)\.size!==t\.length/);
  assert.match(api,/tables:\["A1",\.\.\.\]/);
});
test('tableLayoutParse 讀 tables：過濾非法、去重、空清單＝不回',async()=>{
  const m=srv.match(/function tableLayoutParse\(v\)\{[\s\S]*?\n\}/);assert.ok(m);
  const f=new Function(m[0]+';return tableLayoutParse;')();
  assert.deepEqual(f(JSON.stringify({pos:{},tables:['A1','A1','B2','壞','D9']})).tables,['A1','B2','D9']);
  assert.equal(f(JSON.stringify({pos:{}})).tables,undefined);assert.equal(f(JSON.stringify({pos:{},tables:[]})).tables,undefined);
  assert.equal(f('not json').tables,undefined);
});
test('編輯桌位可改桌號（KK 11/7）：沿用位置、使用中不能改、新號不可重複',()=>{
  assert.match(js,/data-ren-table=/);assert.match(js,/const renameTable=async t=>/);
  assert.match(js,/使用中，先結帳清桌再改號/);assert.match(js,/POS_EDIT_TABLES\.map\(x=>x===t\?n:x\)/);
  assert.match(js,/p\[n\]=p\[t\];delete p\[t\]/);assert.match(js,/closest\('\[data-del-table\],\[data-ren-table\]'\)/);
});
