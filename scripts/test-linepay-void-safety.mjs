// Execute the production void handler and prepare service; all provider calls are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),orders=require('../lib/table-orders'),lp=require('../lib/linepay-offline');
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf("app.post('/api/admin/orders/:id/void'");
const snippet=source.slice(start,source.indexOf('/* 取消已結帳單',start));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
const env={LINEPAY_OFFLINE_ENABLED:'1',LINEPAY_OFFLINE_ENV:'sandbox',LINEPAY_OFFLINE_CHANNEL_ID:'1234567890',LINEPAY_OFFLINE_CHANNEL_SECRET:'synthetic',LINEPAY_OFFLINE_V2_APPROVED:'1'};
function fixture({state=null,prepay=false,number='AB12345678',invoiceGate,quoteGate}={}){
 const order={id:'to_1234567890',session_id:'ts_1234567890',table_no:'A1',status:'paid',paid_at:new Date().toISOString(),amount:120,payer:{method:'cash',...(prepay?{prepay:120}:{})},invoice:{status:'issued',number},items:[{line:'paid',venue:'CAFE',price:120,qty:1}]};
 const session={id:order.session_id,table_no:'A1',status:'open',items:[{...order.items[0],order_id:order.id},{line:'unpaid',venue:'CAFE',price:240,qty:1,placed_at:'test'},...(prepay?[{line:'credit',credit_of:order.id,price:-120,qty:1}]:[])]};
 const attempts=state?[{id:'lp_existing',session_id:session.id,state,amount:240,mode:'sandbox'}]:[];
 const calls=[],locks=new Map(),waiters=new Map();let invalid=0,search=0,n=0;
 async function lock(key,client){
  while(locks.has(key)&&locks.get(key)!==client){const d=deferred();if(!waiters.has(key))waiters.set(key,[]);waiters.get(key).push(d);await d.promise;}
  locks.set(key,client);
 }
 function unlock(client){for(const [key,owner] of locks)if(owner===client){locks.delete(key);for(const d of waiters.get(key)||[])d.resolve();waiters.delete(key);}}
 const pool={async connect(){const client={async query(sql,p=[]){
  calls.push({sql,p,client});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){if(sql!=='BEGIN')unlock(client);return {rows:[]};}
  if(sql.includes('FROM table_sessions')){if(sql.includes('FOR UPDATE'))await lock('session',client);return {rows:[structuredClone(session)]};}
  if(sql.includes('FROM table_orders')){if(sql.includes('FOR UPDATE'))await lock('order',client);return {rows:[structuredClone(order)]};}
  if(sql.includes('FROM linepay_payments'))return {rows:structuredClone(attempts.filter(a=>!['failed','cancelled','settled'].includes(a.state)))};
  if(sql.startsWith('INSERT INTO linepay_payments')){const a={id:p[0],session_id:p[1],amount:p[2],snapshot:JSON.parse(p[3]),state:'prepared',mode:p[5]};attempts.push(a);return {rows:[structuredClone(a)]};}
  if(sql.startsWith('UPDATE table_orders')){order.status='void';order.invoice=JSON.parse(p[3]);return {rows:[]};}
  if(sql.startsWith('UPDATE table_sessions')){if(attempts.some(a=>!['failed','cancelled','settled'].includes(a.state)))throw Error('LINEPAY_PAYMENT_LOCK');session.items=JSON.parse(p[1]);return {rows:[]};}
  throw Error('Unexpected SQL: '+sql);
 },release(){unlock(client);}};return client;}};
 let handler;
 vm.runInNewContext(snippet,{app:{post(...args){handler=args.at(-1);}},auth:0,adminOnly:0,requireDb:0,wrap:f=>f,ORDER_ID_RE:/^to_/,pool,tableOrders:orders,linepayOffline:lp,actorOf:()=> 'synthetic',reverseYanForOrder:async()=>{},ezpayInvoice:{config:()=>({}),searchInvoice:async(c,o,i)=>{search++;return {...i,number:'AB12345678'};},invalidInvoice:async(c,o,i)=>{invalid++;if(invoiceGate){invoiceGate.entered.resolve();await invoiceGate.release.promise;}return {...i,status:'void'};}}});
 const service=lp.createService({pool,env,uid:()=>`lp_${++n}`,owned:()=>true,quote:async s=>{if(quoteGate){quoteGate.entered.resolve();await quoteGate.release.promise;}return {amount:orders.sum(orders.unpaid(s.items))};},finish:async()=>{throw Error('not used');},api:{pay:()=>{throw Error('network forbidden');},check:()=>{throw Error('network forbidden');}}});
 const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 return {order,session,attempts,calls,locks,service,res,get invalid(){return invalid;},get search(){return search;},void:()=>handler({params:{id:order.id},auth:{brands:['CAFE']},body:{reason:'測試作廢'}},res)};
}
for(const state of ['prepared','unknown','paid','review'])for(const prepay of [false,true])test(`partial checkout with issued invoice refuses void before provider I/O: ${state}, prepay=${prepay}`,async()=>{
 const f=fixture({state,prepay,number:''}),before=structuredClone(f.session.items);
 await f.void();assert.equal(f.res.code,423);assert.equal(f.invalid,0);assert.equal(f.search,0);assert.equal(f.order.status,'paid');assert.deepEqual(f.session.items,before);
 assert.ok(!f.calls.some(c=>/^UPDATE|^INSERT/.test(c.sql)));assert.equal(f.locks.size,0);
});
test('void locks session before order and holds it through invoice I/O and commit; concurrent prepare snapshots the restored bill',{timeout:3000},async()=>{
 const gate={entered:deferred(),release:deferred()},f=fixture({invoiceGate:gate});
 const voiding=f.void();await gate.entered.promise;
 let prepared=false;const preparing=f.service.prepare(f.session.id,{}).then(a=>{prepared=true;return a;});
 await tick();assert.equal(prepared,false,'prepare must wait during external invoice I/O');assert.equal(f.attempts.length,0);
 gate.release.resolve();await voiding;const a=await preparing;
 assert.equal(f.res.code,200);assert.equal(f.invalid,1);assert.equal(a.amount,360);assert.equal(f.order.status,'void');
 assert.deepEqual(f.attempts[0].snapshot,f.session.items);
 const lockQueries=f.calls.filter(c=>c.sql.includes('FOR UPDATE')&&c.client===f.calls[0].client);
 assert.match(lockQueries[0].sql,/FROM table_sessions/);assert.match(lockQueries[1].sql,/FROM table_orders/);assert.equal(f.locks.size,0);
});
test('prepare winning the session lock makes racing void reject without invoice calls or an order/session lock inversion',{timeout:3000},async()=>{
 const gate={entered:deferred(),release:deferred()},f=fixture({quoteGate:gate});
 const preparing=f.service.prepare(f.session.id,{});await gate.entered.promise;
 let finished=false;const voiding=f.void().then(()=>{finished=true;});await tick();
 assert.equal(finished,false);assert.equal(f.invalid,0);assert.equal(f.locks.has('order'),false,'waiting void must not hold order lock while prepare owns session');
 gate.release.resolve();await preparing;await voiding;
 assert.equal(f.res.code,423);assert.equal(f.invalid,0);assert.equal(f.order.status,'paid');assert.equal(f.locks.size,0);
});
for(const state of ['failed','cancelled','settled'])test(`terminal ${state} payment does not block ordinary invoiced order void`,async()=>{
 const f=fixture({state});await f.void();assert.equal(f.res.code,200);assert.equal(f.invalid,1);assert.equal(f.order.status,'void');assert.equal(f.locks.size,0);
});
