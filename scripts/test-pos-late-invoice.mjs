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
test('late issue accepts all five invoice types, prints once, and cancel posts nothing',async()=>{
 const cases=[{mode:'paper'},{mode:'company',buyer_ubn:'12345678'},{mode:'mobile',carrier_num:'/ABC+123'},{mode:'citizen',carrier_num:'AB12345678901234'},{mode:'donate',love_code:'168001'},null];
 for(const inv of cases){
  const calls=[],prints=[];const c=vm.createContext({prompt:()=>{throw new Error('不該再用 prompt');},confirm:()=>true,num:String,toast(){},api:async(url,body)=>{calls.push(body);return {invoice:{status:'issued',number:'AB12345678'}};}});vm.runInContext(src,c);c.prints=prints;vm.runInContext('printInvoiceProof=async o=>prints.push(o)',c);c.pick=inv;vm.runInContext('askInvoice=async()=>pick;posConfirm=async()=>true',c);
  await c.issueOrderInvoice({id:'o1',amount:100,invoice:{mode:''}},()=>{});
  assert.equal(calls.length,inv?1:0);
  if(inv){assert.equal(calls[0].body.invoice.mode,inv.mode);assert.equal(prints.length,1);}
 }
});
test('askInvoice offers five types and validates carrier/donate formats',()=>{
 for(const k of ['paper','company','mobile','citizen','donate'])assert.ok(src.includes(`{value:'${k}',label:`),k);
 assert.match(src,/\^\\\/\[A-Z0-9\.\+-\]\{7\}\$/);
 assert.match(src,/\^\[A-Z\]\{2\}\\d\{14\}\$/);
});
test('late issue sends explicit validated invoice choice and prints issued result',()=>{
 assert.match(src,/async function issueOrderInvoice/);
 assert.match(src,/body:\{invoice\}/);
 assert.match(src,/async function askInvoice/);
});
test('late-issue carrier step has camera scan sharing the checkout scanner loop',()=>{
 assert.match(src,/function pickCarrier\(kind\)/);
 assert.match(src,/id="pos-carrier-scan"/);
 assert.match(src,/id="pos-carrier-video"/);
 assert.equal((src.match(/startInvoiceScan\(/g)||[]).length,4); // 定義＋結帳＋補開＋掃會員條碼
 assert.doesNotMatch(src,/invScan\.onclick=async\(\)=>\{\s*const BD=/); // 結帳不再有自己的掃描迴圈
});
