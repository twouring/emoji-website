import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../public/pos-inventory.js', import.meta.url), 'utf8');
const c = vm.createContext({ esc: String }); vm.runInContext(src, c);

test('叫貨單：只列低於安全量的原物料，依供應商分組，建議補到安全量 2 倍並換算整包', () => {
  const plan = vm.runInContext(`invOrderPlan([
    {id:'a',kind:'raw',name:'鮮奶',unit:'ml',qty:1500,safety_qty:4000,supplier:'蓄生',pack_unit:'瓶',pack_size:1860},
    {id:'b',kind:'raw',name:'咖啡豆',unit:'g',qty:-200,safety_qty:0,supplier:''},
    {id:'c',kind:'raw',name:'檸檬',unit:'個',qty:30,safety_qty:10,supplier:'蓄生'},
    {id:'d',kind:'prep',name:'柚子醬',unit:'g',qty:0,safety_qty:500},
    {id:'e',kind:'raw',name:'停用',unit:'g',qty:0,safety_qty:5,active:false}
  ])`, c);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].supplier, '蓄生'); assert.equal(plan[1].supplier, '未填供應商');
  assert.deepEqual(JSON.parse(JSON.stringify(plan[0].lines[0])), { id: 'a', name: '鮮奶', unit: 'ml', qty: 1500, safety: 4000, need: 6500, pack: { unit: '瓶', n: 4 } });
  assert.equal(plan[1].lines[0].need, 200, '負庫存至少補回 0');
  assert.equal(vm.runInContext(`invOrderText(invOrderPlan([{id:'a',kind:'raw',name:'鮮奶',unit:'ml',qty:0,safety_qty:1000,supplier:'蓄生',pack_unit:'瓶',pack_size:1860}])[0])`, c), '【叫貨】蓄生\n・鮮奶 2 瓶');
});
test('庫存分頁有「叫貨單」頁籤與複製鍵', () => {
  for (const s of ["['order','叫貨單']", 'data-inv-order-copy', 'invOrderHtml()']) assert.ok(src.includes(s), s);
});
