import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('public/pos-ops.js','utf8');
test('unrequested active orders offer issue, void orders do not',()=>{
 const c=vm.createContext({esc:String});vm.runInContext(src,c);
 assert.match(vm.runInContext("invoiceHtml({id:'x',invoice:{}})",c),/data-invoice-issue/);
 assert.doesNotMatch(vm.runInContext("invoiceHtml({id:'x',status:'void',invoice:{}})",c),/data-invoice-issue/);
});
test('paper/company late issue posts invoice, prints once, and cancel posts nothing',async()=>{
 for(const value of ['', '12345678',null,'123']){
  // 補開發票改用點選面板（askUbn：紙本／統編＋數字鍵盤），回傳形狀與舊 prompt 相同：''＝紙本、8 碼＝統編、null＝取消
  const calls=[],prints=[];const c=vm.createContext({prompt:()=>{throw new Error('不該再用 prompt');},confirm:()=>true,num:String,toast(){},api:async(url,body)=>{calls.push(body);return {invoice:{status:'issued',number:'AB12345678'}};}});vm.runInContext(src,c);c.prints=prints;vm.runInContext('printInvoiceProof=async o=>prints.push(o)',c);c.ubnValue=value;vm.runInContext('askUbn=async()=>ubnValue',c);
  await c.issueOrderInvoice({id:'o1',amount:100,invoice:{mode:''}},()=>{});
  assert.equal(calls.length,value===null||value==='123'?0:1);
  if(calls.length){assert.equal(calls[0].body.invoice.mode,value?'company':'paper');assert.equal(prints.length,1);}
 }
});
test('late issue sends explicit validated invoice choice and prints issued result',()=>{
 assert.match(src,/async function issueOrderInvoice/);
 assert.match(src,/body:\{invoice\}/);
 assert.match(src,/buyer_ubn:ubn/);
});
