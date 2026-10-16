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
