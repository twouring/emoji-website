import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
function checkout({method='cash',fail=false,printFail=false}={}){
 const events=[],messages=[],button={disabled:false};
 const ctx={Promise,Map,Set,Date,Number,String,priceOf:l=>l.price,printReceipt:async()=>events.push('receipt'),printOrder:async()=>events.push('kitchen'),OPERATOR:{id:'op1'},POS_METHOD:method,POS_RECEIVED:'200',POS_MEMBER:false,POS_YAN:{phone:'',name:'',balance:null},POS_DISCOUNT:null,POS_INVOICE:{mode:''},POS_PICK:null,POS_QTY:{},POS_SPLIT:{},aa:null,mixed:false,splitList:[],splitLeft:0,cash:method==='cash',cashDue:method==='cash'?180:0,cur:{lines:[]},picked:[{zh:'測試品項',qty:1,price:180}],total:180,cur:{id:'s1',table:'A1'},host:{querySelector:sel=>sel==='#pos-checkout'?button:null},posConfirm:async()=>true,num:String,payMethodLabel:x=>x,invoiceBody:()=>({}),ensureOperator:fn=>fn(),toast:m=>messages.push(m),reload:async()=>events.push('reload'),api:async()=>{events.push('payment');if(fail)throw Error('payment rejected');return {order_id:'to_1',amount:180,change:20,method,invoice:{status:'issued',number:'AB12345678'}};},autoCashDrawer:async event=>{events.push(event);return true;},printInvoiceProof:async()=>{events.push('print');if(printFail)throw Error('canvas failed');}};
 vm.createContext(ctx);
 vm.runInContext(src.slice(src.indexOf('async function opsThen('),src.indexOf('function ordersBeep(')),ctx);
 vm.runInContext(src.slice(src.indexOf('const DRAWER_ATTEMPTS='),src.indexOf('async function openCashDrawer(')),ctx);
 vm.runInContext(src.match(/const invoicePrintable=[^\n]+/)[0].replace('const ','var '),ctx);
 vm.runInContext(src.slice(src.indexOf('async function printCheckoutOrder('),src.indexOf('// 出餐單（')),ctx);
 vm.runInContext(src.slice(src.indexOf("  host.querySelector('#pos-checkout').onclick="),src.indexOf("  const place=host.querySelector('#pos-place')")),ctx);
 const hw=()=>vm.runInContext('CHECKOUT_HW',ctx);
 return {ctx,button,events,messages,hw};
}
test('checkout UI resets and reloads without waiting for drawer or printer',async()=>{
 const {ctx,button,events,messages,hw}=checkout();let release;
 ctx.autoCashDrawer=event=>new Promise(r=>{events.push(event);release=()=>r(true);});
 await button.onclick();
 assert.equal(events[0],'payment');assert.ok(events.includes('reload'));assert.equal(button.disabled,false);
 assert.equal(events.includes('print'),false);assert.match(messages.join(' '),/已收款 NT\$180/);
 release();await hw();assert.ok(events.indexOf('print')>events.findIndex(e=>e?.kind==='checkout'));
});
test('checkout failure never triggers drawer or invoice',async()=>{
 const {button,events,messages}=checkout({fail:true});await button.onclick();
 assert.deepEqual(events,['payment']);assert.equal(button.disabled,false);assert.match(messages.join(' '),/payment rejected/);
});
test('successful checkout opens before invoice work and resets even when canvas fails',async()=>{
 const {ctx,button,events,messages,hw}=checkout({printFail:true});await button.onclick();await hw();
 const hwEvents=events.filter(e=>e!=='reload');
 assert.equal(hwEvents[0],'payment');assert.equal(hwEvents[1].kind,'checkout');assert.equal(hwEvents[1].order_id,'to_1');assert.equal(hwEvents[2],'print');assert.equal(hwEvents[3],'receipt');assert.equal(events.filter(e=>e==='reload').length,1);assert.equal(button.disabled,false);assert.equal(ctx.POS_RECEIVED,'');assert.equal(ctx.POS_INVOICE.mode,'paper');assert.match(messages.join(' '),/發票列印失敗/);
});
for(const averageSplit of [false,true]){
 test(`${averageSplit?'average-split':'ordinary'} checkout drawer failure points to 錢櫃 without repeating payment`,async()=>{
  const {ctx,button,events,messages,hw}=checkout();
  if(averageSplit)ctx.aa={people:3,index:1,each:60};
  ctx.autoCashDrawer=async event=>{events.push(event);return false;};
  await button.onclick();await hw();
  assert.equal(events.filter(e=>e==='payment').length,1);
  assert.equal(events.filter(e=>e?.kind==='checkout').length,1);
  assert.equal(events.filter(e=>e==='reload').length,1);
  assert.equal(button.disabled,false);
  const message=messages.find(m=>m.includes('未確認開櫃成功'));
  assert.match(message,/已收.*未確認開櫃成功.*按「錢櫃」重試.*勿重複收款/);
  assert.doesNotMatch(message,/「開錢櫃」/);
 });
}
test('rapid double click submits only once while processing',async()=>{
 const {ctx,button,events}=checkout();let release;ctx.api=()=>new Promise(r=>{events.push('payment');release=()=>r({order_id:'to_2',amount:180,method:'cash'});});
 const first=button.onclick();await button.onclick();assert.deepEqual(events,['payment']);release();await first;assert.equal(events.filter(x=>x==='payment').length,1);
});
test('printer queue serializes jobs and recovers after synchronous SDK exception',async()=>{
 const sent=[],traders=[];
 class Builder {createInitializationElement(){return 'init';}createPeripheralElement(){return 'drawer';}}
 class Trader {constructor(){traders.push(this);}sendMessage(job){sent.push(job.request);if(sent.length===1)throw Error('transport');}}
 const ctx={Promise,setTimeout,clearTimeout,StarWebPrintBuilder:Builder,StarWebPrintTrader:Trader,STAR_WEBPRNT_URL:'test',starReady:()=>true,toast(){}};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('let STAR_NATIVE_UNCERTAIN='),src.indexOf('const DRAWER_ATTEMPTS=')),ctx);
 const first=ctx.starSend({drawer:true}),second=ctx.starSend({drawer:true});await first;await Promise.resolve();await Promise.resolve();
 assert.equal(sent.length,2);traders[1].onReceive({traderSuccess:'true'});assert.equal(await second,true);
});
function refundContext({cash=true,confirmCash=true,fail=false,item=false}={}){
 const calls=[],opens=[],messages=[];let reloaded=false;
 const ctx={OPERATOR:{id:'op1'},REASON_PRESETS:{void_order:['test'],cancel_item:['test']},pickReason:async()=> '測試原因',posConfirm:async()=>confirmCash,ensureOperator:fn=>fn(),api:async(path,options)=>{calls.push({path,...options});if(fail)throw Error('rejected');return {cash_refund:options.body.refund_cash?50:0,refund:50};},autoCashDrawer:async e=>{opens.push(e);return null;},toast:m=>messages.push(m),num:String};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('async function opsThen('),src.indexOf('function ordersBeep(')),ctx);
 vm.runInContext(src.slice(src.indexOf('const cashPaidOf='),src.indexOf('\n',src.indexOf('const cashPaidOf='))),ctx);
 vm.runInContext(src.slice(src.indexOf('async function voidOrderPrompt('),src.indexOf('function bindOrderButtons(')),ctx);
 const order={amount:180,payer:{method:cash?'cash':'card'}};
 const run=()=>item?ctx.cancelOrderItemPrompt('to_1','l1','品項',()=>reloaded=true,order):ctx.voidOrderPrompt('to_1',()=>reloaded=true,order);
 return {ctx,run,calls,opens,messages,get reloaded(){return reloaded;}};
}
for(const item of [false,true]){
 test(`${item?'item':'whole'} completed refund drawer failure points to 錢櫃 and preserves cash amount`,async()=>{
  const c=refundContext({item});
  c.ctx.autoCashDrawer=async e=>{c.opens.push(e);return false;};
  await c.run();
  assert.equal(c.calls.length,1);assert.equal(c.calls[0].body.refund_cash,true);
  assert.equal(c.opens.length,1);assert.equal(c.reloaded,true);
  assert.match(c.messages.join(' '),/已(?:取消|作廢).*請退現金 NT\$50.*未確認開櫃成功.*按「錢櫃」重試/);
  assert.doesNotMatch(c.messages.join(' '),/「開錢櫃」/);
 });
 test(`${item?'item':'whole'} refund opens only after successful explicit cash intent`,async()=>{
  const c=refundContext({item});await c.run();assert.equal(c.calls[0].body.refund_cash,true);assert.equal(c.opens[0].cash_refund,50);assert.equal(c.opens[0].line,item?'l1':undefined);assert.equal(c.reloaded,true);
 });
 test(`${item?'item':'whole'} accounting-only, noncash and failed refund never qualify for cash opening`,async()=>{
  for(const options of [{confirmCash:false},{cash:false},{fail:true}]){const c=refundContext({item,...options});await c.run();assert.equal(c.opens.some(e=>e.cash_refund>0),false);}
 });
}
