import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './linepay-test-harness.mjs';
const require=createRequire(import.meta.url);
let lp;try{lp=require('../lib/linepay-offline');}catch{}
test('offline payments default to disabled, never reuse reconciliation credentials',()=>{
  assert.ok(lp,'LINE Pay offline integration exists');
  assert.equal(lp.configuration({LINEPAY_MERCHANT_ID:'merchant',LINEPAY_MERCHANT_PW:'password'}).enabled,false);
});
const env={LINEPAY_OFFLINE_ENABLED:'1',LINEPAY_OFFLINE_ENV:'sandbox',LINEPAY_OFFLINE_CHANNEL_ID:'1234567890',LINEPAY_OFFLINE_CHANNEL_SECRET:'synthetic-test-secret',LINEPAY_OFFLINE_V2_APPROVED:'1'};
test('v2 request sends addFriends, auto capture, fixed host, 40s deadline and lossless transaction ID',async()=>{
  let call;
  const api=lp.createClient({env,fetcher:async(url,opts)=>{call={url,opts};return {ok:true,text:async()=>'{"returnCode":"0000","info":{"orderId":"lp_test","transactionId":2019010112345678910,"payInfo":[{"amount":120}]}}'};}});
  const out=await api.pay({id:'lp_test',amount:120},'123456789012345678');
  assert.equal(out.info.transactionId,'2019010112345678910');
  assert.equal(call.url,'https://sandbox-api-pay.line.me/v2/payments/oneTimeKeys/pay');
  assert.deepEqual(JSON.parse(call.opts.body),{amount:120,currency:'TWD',capture:true,orderId:'lp_test',productName:'言文字 POS 消費',oneTimeKey:'123456789012345678',extras:{addFriends:[{type:'LINE_AT',idList:['@338ymhys']}]}});
  assert.equal(call.opts.headers['X-LINE-ChannelSecret'],env.LINEPAY_OFFLINE_CHANNEL_SECRET);
  assert.ok(call.opts.signal);
});
test('server quote ignores caller amount; successful durable payment settles once on concurrent resends',async()=>{
  const f=fixture(lp,env),auth={brands:['CAFE']};
  const a=await f.service.prepare('ts_test',auth,{amount:1});
  assert.equal(a.amount,120);assert.equal(a.state,'prepared');
  const req={attempt_id:a.id,oneTimeKey:'123456789012345678'};
  const results=await Promise.all([f.service.pay('ts_test',auth,req),f.service.pay('ts_test',auth,req)]);
  assert.ok(results.some(r=>r.state==='settled'));
  assert.equal(f.payCalls,1);assert.equal(f.orders.length,1);
  assert.equal((await f.service.pay('ts_test',auth,req)).state,'settled');
  assert.equal(f.payCalls,1);
});
test('decline releases bill; explicit provider failure is not recorded as revenue',async()=>{
  const f=fixture(lp,env,{pay:async()=>({returnCode:'1142'})}),a=await f.service.prepare('ts_test',{});
  const out=await f.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'});
  assert.equal(out.state,'failed');assert.equal(out.code,'1142');assert.equal(f.orders.length,0);
});
test('timeout locks bill, never replays charge; check COMPLETE settles once',async()=>{
  const f=fixture(lp,env,{pay:async()=>{throw Error('timeout');},check:async a=>({returnCode:'0000',info:{status:'COMPLETE',orderId:a.id,transactionId:'2019010112345678910',payInfo:[{amount:120}]}})});
  const a=await f.service.prepare('ts_test',{}),body={attempt_id:a.id,oneTimeKey:'123456789012345678'};
  assert.equal((await f.service.pay('ts_test',{},body)).state,'unknown');
  assert.equal((await f.service.pay('ts_test',{},body)).state,'unknown');assert.equal(f.payCalls,1);
  assert.equal((await f.service.prepare('ts_test',{})).id,a.id);
  assert.equal((await f.service.check('ts_test',{},body)).state,'settled');
  assert.equal((await f.service.check('ts_test',{},body)).state,'settled');assert.equal(f.orders.length,1);assert.equal(f.checkCalls,1);
});
test('cancel is allowed only before dispatch, check FAIL releases unknown transaction',async()=>{
  const f=fixture(lp,env,{pay:async()=>{throw Error('timeout');},check:async()=>({returnCode:'0000',info:{status:'FAIL',failReturnCode:'1283'}})});
  let a=await f.service.prepare('ts_test',{});
  assert.equal((await f.service.cancel('ts_test',{},{attempt_id:a.id})).state,'cancelled');
  a=await f.service.prepare('ts_test',{});await f.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'});
  await assert.rejects(f.service.cancel('ts_test',{},{attempt_id:a.id}),e=>e.status===409);
  assert.equal((await f.service.check('ts_test',{},{attempt_id:a.id})).state,'failed');
});
test('all operations enforce brand ownership before provider contact',async()=>{
  const f=fixture(lp,env),a=await f.service.prepare('ts_test',{}),auth={brands:['BAR']};
  for(const method of ['prepare','pay','check','cancel'])await assert.rejects(f.service[method]('ts_test',auth,{attempt_id:a.id,oneTimeKey:'123456789012345678'}),e=>e.status===404);
  assert.equal(f.payCalls,0);assert.equal(f.checkCalls,0);
});
for(const code of ['1145','1152','1172','1198','1199','1900','1999','9000'])test('ambiguous '+code+' never releases original bill or replays payment',async()=>{
  const f=fixture(lp,env,{pay:async()=>({returnCode:code})}),a=await f.service.prepare('ts_test',{});
  const req={attempt_id:a.id,oneTimeKey:'123456789012345678'};
  assert.equal((await f.service.pay('ts_test',{},req)).state,'unknown');
  await f.service.pay('ts_test',{},req);assert.equal(f.payCalls,1);assert.equal(f.orders.length,0);
});
for(const status of ['PROCESSING','READY','UNKNOWN'])test('check '+status+' keeps payment locked',async()=>{
  const f=fixture(lp,env,{pay:async()=>{throw Error('timeout');},check:async()=>({returnCode:'0000',info:{status}})}),a=await f.service.prepare('ts_test',{});
  await f.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'});
  assert.equal((await f.service.check('ts_test',{},{attempt_id:a.id})).state,'unknown');assert.equal(f.orders.length,0);
});
test('wrong amount never records revenue and requires reconciliation',async()=>{
  const f=fixture(lp,env,{pay:async a=>({returnCode:'0000',info:{orderId:a.id,transactionId:'1234567890123456789',payInfo:[{amount:1}]}})}),a=await f.service.prepare('ts_test',{});
  assert.equal((await f.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'})).state,'review');assert.equal(f.orders.length,0);
});
test('disabled setup and malformed customer code never dispatch, and code is never persisted',async()=>{
  const f=fixture(lp,{});await assert.rejects(f.service.prepare('ts_test',{}),e=>e.status===503);
  const g=fixture(lp,env),a=await g.service.prepare('ts_test',{});
  await assert.rejects(g.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'@338ymhys'}),e=>e.status===400);
  assert.equal(g.payCalls,0);assert.ok(!JSON.stringify(g.attempts).includes('oneTimeKey'));
});
test('API-paid orders cannot be manually voided before provider refund',()=>{
  const orders=require('../lib/table-orders'),o={status:'paid',paid_at:new Date().toISOString(),payer:{method:'linepay',linepay_payment:'lp_test'},items:[{line:'a'},{line:'b'}]};
  assert.throws(()=>orders.voidOrder(o,'test'),/LINE Pay/);
  assert.throws(()=>orders.voidOrderLine(o,'a','test'),/LINE Pay/);
});
test('payment credentials have separate encrypted live settings and validated enable gates',()=>{
 const settings=require('../lib/system-settings');
 for(const key of ['LINEPAY_OFFLINE_ENABLED','LINEPAY_OFFLINE_ENV','LINEPAY_OFFLINE_CHANNEL_ID','LINEPAY_OFFLINE_CHANNEL_SECRET','LINEPAY_OFFLINE_V2_APPROVED']){assert.ok(settings.byKey.has(key),key);assert.ok(settings.isLive(key),key);}
 assert.equal(settings.byKey.get('LINEPAY_OFFLINE_CHANNEL_SECRET').secret,true);
 assert.throws(()=>settings.validate('LINEPAY_OFFLINE_ENABLED','yes'));
 assert.throws(()=>settings.validate('LINEPAY_OFFLINE_ENV','https://evil.test'));
 assert.throws(()=>settings.validate('LINEPAY_OFFLINE_CHANNEL_ID','merchant-login'));
});
test('turning off new payments still allows original unknown payment reconciliation',async()=>{
 const settings={...env};const f=fixture(lp,settings,{pay:async()=>{throw Error('timeout');},check:async a=>({returnCode:'0000',info:{status:'COMPLETE',orderId:a.id,transactionId:'1234567890123456789',payInfo:[{amount:120}]}})});
 const a=await f.service.prepare('ts_test',{});await f.service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'});
 settings.LINEPAY_OFFLINE_ENABLED='0';
 assert.equal((await f.service.check('ts_test',{},{attempt_id:a.id})).state,'settled');
});
