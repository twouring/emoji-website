import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
function drawerContext(extra={}){
 const calls=[],messages=[];
 const ctx={Promise,Map,Set,Date,Number,String,crypto:{randomUUID:()=> 'manual-unique'},OPERATOR:{id:'staff1'},api:async(path,body)=>{calls.push({path,...body});return {ok:true,claimed:true};},toast:m=>messages.push(m),starReady:()=>true,starSend:async job=>{calls.push(job);return true;},starHint(){},starOpenHere(){},...extra};
 vm.createContext(ctx);
 const start=source.indexOf('const DRAWER_ATTEMPTS=');
 assert.notEqual(start,-1,'drawer controller exists');
 vm.runInContext(source.slice(start,source.indexOf('const c39=',start)),ctx);
 return {ctx,calls,messages};
}
test('cash checkout claims recorded event before standalone drawer pulse; duplicate ignored',async()=>{
 const {ctx,calls}=drawerContext();
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_1',method:'cash',amount:180});
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_1',method:'cash',amount:180});
 assert.equal(calls.length,2);assert.equal(calls[0].path,'/admin/pos/drawer-events');
 assert.equal(calls[0].body.event_key,'checkout:to_1');assert.equal(calls[1].drawer,true);assert.equal(calls[1].canvas,undefined);
});
test('noncash, zero-value, failed/missing order never opens',async()=>{
 const {ctx,calls}=drawerContext();
 for(const method of ['card','linepay','transfer','taishin','tappay'])await ctx.autoCashDrawer({kind:'checkout',order_id:'to_'+method,method,amount:180});
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_free',method:'cash',amount:0});
 await ctx.autoCashDrawer({kind:'checkout',method:'cash',amount:100});
 assert.equal(calls.length,0);
});
test('explicit cash component qualifies mixed payment but noncash components do not',async()=>{
 const {ctx,calls}=drawerContext();
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_mixed',method:'mixed',amount:180,payments:[{method:'card',amount:100},{method:'cash',amount:80}]});
 assert.equal(calls.length,2);
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_digital',method:'mixed',amount:180,payments:[{method:'card',amount:180}]});
 assert.equal(calls.length,2);
});
test('only confirmed positive cash refunds open; item has independent dedupe key',async()=>{
 const {ctx,calls}=drawerContext();
 await ctx.autoCashDrawer({kind:'refund',order_id:'to_1',method:'cash',amount:180,cash_refund:0});assert.equal(calls.length,0);
 await ctx.autoCashDrawer({kind:'refund',order_id:'to_1',line:'l1',cash_refund:50});
 assert.equal(calls[0].body.event_key,'refund:to_1:l1');assert.equal(calls.length,2);
});
test('server duplicate or audit failure never sends hardware command',async()=>{
 for(const api of [async()=>({claimed:false}),async()=>{throw Error('offline');}]){
  const {ctx,calls}=drawerContext({api});await ctx.autoCashDrawer({kind:'checkout',order_id:'to_1',method:'cash',amount:180});assert.equal(calls.length,0);
 }
});
test('hardware failure reports completed transaction and does not retry automatically',async()=>{
 const {ctx,calls,messages}=drawerContext({starSend:async()=>false});
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_1',method:'cash',amount:180});
 await ctx.autoCashDrawer({kind:'checkout',order_id:'to_1',method:'cash',amount:180});
 assert.equal(calls.length,1);
 assert.equal(messages.length,1,'失敗只提示一次，不自動重送交易或開櫃');
 assert.match(messages[0],/交易已完成.*未確認開櫃成功.*按「錢櫃」重試.*勿重複收退款/);
 assert.doesNotMatch(messages[0],/「開錢櫃」/);
});
test('manual drawer is audited with reason and operator',async()=>{
 const {ctx,calls}=drawerContext();await ctx.manualCashDrawer('換鈔');
 assert.equal(calls[0].body.kind,'manual');assert.equal(calls[0].body.reason,'換鈔');assert.equal(calls[0].body.operator_id,'staff1');assert.equal(calls[1].drawer,true);
});
test('checkout lock survives replacement button and releases after failure',async()=>{
 const {ctx}=drawerContext();let release,n=0;
 const first=ctx.runCheckoutOnce('s1',()=>{n++;return new Promise(r=>release=r);});
 await ctx.runCheckoutOnce('s1',()=>{n++;});assert.equal(n,1);release();await first;
 await assert.rejects(()=>ctx.runCheckoutOnce('s1',async()=>{throw Error('fail');}));
 await ctx.runCheckoutOnce('s1',async()=>n++);assert.equal(n,2);
});
test('invoice print/reprint cannot request drawer even when legacy caller passes drawer:true',async()=>{
 const jobs=[];const ctx={toast(){},starReady:()=>true,invoiceProofCanvas:async()=>({id:'canvas'}),starSend:async j=>{jobs.push(j);return true;}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function printInvoiceProof('),source.indexOf('// 出餐單（')),ctx);
 await ctx.printInvoiceProof({invoice:{status:'issued'}},{drawer:true});assert.equal(jobs.length,1);assert.equal(jobs[0].drawer,undefined);
});
test('checkout and refund handlers await drawer independently of printing, and manual asks reason',()=>{
 assert.match(source,/ok=await autoCashDrawer\(drawer\)/);
 assert.match(source,/checkoutHardware\(\{kind:'checkout'/);
 assert.match(source,/runCheckoutOnce\(cur\.id/);
 assert.match(source,/refund_cash:refundCash/);
 assert.match(source,/await autoCashDrawer\(\{kind:'refund'/);
 assert.match(source,/manualCashDrawer\(reason\)/);
 assert.doesNotMatch(source,/printInvoiceProof\(order,\{drawer:/);
});
