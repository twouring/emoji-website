import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fixture} from './linepay-test-harness.mjs';
const require=createRequire(import.meta.url),lp=require('../lib/linepay-offline');
const env={LINEPAY_OFFLINE_ENABLED:'1',LINEPAY_OFFLINE_ENV:'sandbox',LINEPAY_OFFLINE_CHANNEL_ID:'1234567890',LINEPAY_OFFLINE_CHANNEL_SECRET:'synthetic',LINEPAY_OFFLINE_V2_APPROVED:'1'};
test('unrelated or unbound FAIL cannot unlock an unknown bill',async()=>{
 for(const orderId of [undefined,'lp_other']){
  const f=fixture(lp,env,{pay:async()=>{throw Error('timeout');},check:async()=>({returnCode:'0000',info:{status:'FAIL',orderId,failReturnCode:'1142'}})});
  const a=await f.service.prepare('ts_test',{}),body={attempt_id:a.id,oneTimeKey:'123456789012345678'};
  await f.service.pay('ts_test',{},body);
  assert.equal((await f.service.check('ts_test',{},body)).state,'unknown');
  assert.equal((await f.service.prepare('ts_test',{})).id,a.id);
  await f.service.pay('ts_test',{},body);assert.equal(f.payCalls,1);
 }
});

test('new main split mode must not silently charge the whole table',async()=>{
 const orders=require('../lib/table-orders'),pos=require('../lib/linepay-pos');
 const hooks=pos.createHooks({tableOrders:orders,contentValue:async()=>'',resolveOperator:async()=>({id:'op_test'}),activePaymentCodes:async()=>['linepay'],registersOpenMap:async()=>({}),posRegister:{checkoutAllowed:()=>({})},ezpayInvoice:{invoiceForm:()=>({})},actorOf:()=> 'test'});
 const s={id:'ts_test',items:[{line:'a',venue:'CAFE',qty:1,price:120,placed_at:'test'}]};
 await assert.rejects(hooks.quote(s,{},{split:{people:2,index:1}},{}),e=>e.status===400);
 const ui=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
 const checkout=ui.slice(ui.indexOf('async function linepayCheckout('),ui.indexOf('function paintPos('));
 assert.match(checkout,/if\(POS_AA\|\|POS_PICK/);
});

test('each missing configuration gate and whitespace secret fail closed without network',async()=>{
 for(const key of Object.keys(env)){
  const config={...env};delete config[key];const f=fixture(lp,config);
  await assert.rejects(f.service.prepare('ts_test',{}),e=>e.status===503);
  assert.equal(f.payCalls,0);
 }
 const config={...env,LINEPAY_OFFLINE_CHANNEL_SECRET:'   '};
 assert.equal(lp.configuration(config).enabled,false);
});
