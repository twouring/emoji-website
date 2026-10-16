import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tableOrders=require('../lib/table-orders');
const source=()=>fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const order=()=>({id:'to_1234567890abcdef',session_id:'ts_1234567890abcdef',amount:100,status:'paid',paid_at:new Date().toISOString(),payer:{method:'cash'},invoice:{},items:[{line:'a',price:80,qty:1,venue:'CAFE'},{line:'b',price:20,qty:1,venue:'CAFE'}]});
function harness(o=order(),options={}){
 const routes=new Map(),events=new Map(),queries=[];let serial=0;
 async function query(sql,p=[]){
  queries.push(sql);
  if(options.failAudit&&sql.includes('INSERT INTO pos_drawer_events'))throw Error('audit unavailable');
  if(sql.includes('FROM table_orders'))return {rows:o?[structuredClone(o)]:[]};
  if(sql.includes('INSERT INTO pos_drawer_events')){if(events.has(p[1]))return {rows:[]};const row={id:p[0],params:p};events.set(p[1],row);return {rows:[row]};}
  if(sql.includes('FROM pos_drawer_events'))return {rows:events.has(p[0])?[events.get(p[0])]:[]};
  if(sql.includes('UPDATE table_orders SET items')){o.items=JSON.parse(p[1]);o.amount=p[2];if(p[3])o.payer=JSON.parse(p[3]);}
  if(sql.includes("UPDATE table_orders SET status='void'")){o.status='void';if(p[4])o.payer=JSON.parse(p[4]);}
  if(sql.includes('FROM table_sessions'))return {rows:[]};
  return {rows:[]};
 }
 let lock=Promise.resolve();
 const connect=async()=>{let unlock=null;return {async query(sql,p){if(sql.includes('FROM table_orders')&&sql.includes('FOR UPDATE')){const previous=lock;lock=new Promise(resolve=>{unlock=resolve;});await previous;}const out=await query(sql,p);if((sql==='COMMIT'||sql==='ROLLBACK')&&unlock){unlock();unlock=null;}return out;},release(){if(unlock)unlock();}};};
 const pass=()=>{};
 const context={app:{post:(p,...handlers)=>routes.set(p,handlers)},auth:pass,adminOnly:pass,requireDb:pass,wrap:f=>f,q:query,pool:{connect},tableOrders,ORDER_ID_RE:/^to_[a-z0-9]{16}$/,resolveOperator:async(req,id)=>id==='staff-ok'?{id,name:'小明'}:null,actorOf:a=>a.email,uid:p=>p+(++serial),ezpayInvoice:{config:()=>null},reverseYanForOrder:async()=>{},Date,console};
 for(const route of ['/api/admin/pos/drawer-events','/api/admin/orders/:id/void','/api/admin/orders/:id/items/:line/void']){
  const start=source().indexOf(`app.post('${route}'`);if(start<0)continue;
  const end=source().indexOf('\n}));',start)+6;vm.runInNewContext(source().slice(start,end),context);
 }
 return {o,events,queries,async call(route,body={},params={},auth={email:'admin@example.test',brands:null}){
  const handlers=routes.get(route);assert.ok(handlers,`missing route ${route}`);assert.equal(handlers.length,4);
  const res={code:200,status(n){this.code=n;return this;},json(value){this.body=JSON.parse(JSON.stringify(value));return this;}};
  try{await handlers.at(-1)({body,params,auth},res);}catch(e){res.code=e.status||500;res.body={error:e.message};}return res;
 }};
}
test('real admin middleware narrowly admits CAFE/BAR drawer events, not adjacent POS admin paths',()=>{
 const s=source(),ctx={};vm.createContext(ctx);
 vm.runInContext(s.slice(s.indexOf('const FOOD_API ='),s.indexOf('async function eventEditor(')),ctx);
 for(const brand of ['CAFE','BAR'])for(const [path,expected] of [['/api/admin/pos/drawer-events',200],['/api/admin/pos/other',403],['/api/admin/pos/drawer-events/extra',403]]){
  const req={path,auth:{role:'admin',brands:[brand]}},res={code:200,status(n){this.code=n;return this;},json(){}};let next=false;
  ctx.adminOnly(req,res,()=>{next=true;});assert.equal(res.code,expected,path);assert.equal(next,expected===200);
 }
});
const drawer='/api/admin/pos/drawer-events';
const whole='/api/admin/orders/:id/void',item='/api/admin/orders/:id/items/:line/void';
test('whole void defaults to accounting-only, explicit cash returns persisted claim metadata',async()=>{
 for(const explicit of [false,true]){
  const h=harness();const res=await h.call(whole,{reason:'付款方式改登',refund_cash:explicit},{id:h.o.id});
  assert.equal(res.code,200);assert.equal(res.body.method,'cash');assert.equal(res.body.cash_refund,explicit?100:0);
  if(explicit){assert.equal(res.body.event_key,`refund:${h.o.id}`);assert.equal(h.o.payer.drawer_refunds[res.body.event_key],100);assert.equal((await h.call(drawer,{kind:'refund',order_id:h.o.id,event_key:res.body.event_key,reason:'退還現金'})).body.claimed,true);}
  else assert.equal(res.body.event_key,undefined);
 }
});
test('item void caps refund to actual order reduction and persists cash intent only on opt-in',async()=>{
 for(const explicit of [false,true]){
  const o=order();o.amount=50;const h=harness(o);
  const r=await h.call(item,{reason:'退菜',refund_cash:explicit},{id:o.id,line:'a'});
  assert.equal(r.code,200);assert.equal(r.body.refund,50);assert.equal(r.body.amount,0);assert.equal(r.body.cash_refund,explicit?50:0);assert.equal(r.body.method,'cash');
  assert.equal(r.body.event_key,explicit?`refund:${o.id}:a`:undefined);
  if(explicit)assert.equal((await h.call(drawer,{kind:'refund',line:'a',order_id:o.id,event_key:r.body.event_key,reason:'退菜現金'})).body.claimed,true);
 }
});
test('concurrent duplicate refunds succeed once and roll back the rejected request',async()=>{
 for(const route of [whole,item]){
  const h=harness();const params={id:h.o.id,line:'a'};
  const replies=await Promise.all([h.call(route,{reason:'退還',refund_cash:true},params),h.call(route,{reason:'退還',refund_cash:true},params)]);
  assert.deepEqual(replies.map(r=>r.code).sort(),[200,409]);assert.ok(h.queries.includes('ROLLBACK'));
 }
});
test('manual events require their namespace, reason and valid selected operator',async()=>{
 const h=harness();const valid={event_key:'manual:12345678-abcd-1234-abcd-123456789012',kind:'manual',reason:'補零錢',operator_id:'staff-ok'};
 for(const change of [{reason:''},{operator_id:undefined},{operator_id:'inactive'},{order_id:h.o.id},{event_key:`checkout:${h.o.id}`}])assert.equal((await h.call(drawer,{...valid,...change})).code,400);
 assert.equal((await h.call(drawer,valid)).body.claimed,true);assert.equal((await h.call(drawer,valid)).body.claimed,false);
});
test('checkout accepts positive persisted cash or explicit cash allocation only',async()=>{
 for(const [payer,amount,status,expected] of [[{method:'cash'},100,'paid',200],[{method:'card'},100,'paid',409],[{method:'cash'},0,'paid',409],[{method:'cash'},100,'void',409],[{method:'mixed'},100,'paid',409],[{method:'mixed',payments:[{method:'cash',amount:20},{method:'card',amount:80}]},100,'paid',200],[{payments:[{method:'cash',amount:0}]},100,'paid',409]]){
  const o=order();Object.assign(o,{payer,amount,status});const h=harness(o);
  assert.equal((await h.call(drawer,{kind:'checkout',order_id:o.id,event_key:`checkout:${o.id}`,reason:'現金結帳'})).code,expected);
 }
});
test('drawer refuses forged refund intent, alternate checkout keys, cross-brand orders and invalid operators',async()=>{
 const h=harness();const base={kind:'checkout',order_id:h.o.id,event_key:`checkout:${h.o.id}`,reason:'開櫃'};
 assert.equal((await h.call(drawer,{...base,event_key:base.event_key+':retry'})).code,409);
 assert.equal((await h.call(drawer,{...base,operator_id:'inactive'})).code,400);
 assert.equal((await h.call(drawer,base,{}, {email:'bar@example.test',brands:['BAR']})).code,404);
 h.o.status='void';
 assert.equal((await h.call(drawer,{...base,kind:'refund',event_key:`refund:${h.o.id}`,cash_refund:999})).code,409);
 h.o.items[0].cancelled=true;
 assert.equal((await h.call(drawer,{...base,kind:'refund',line:'a',event_key:`refund:${h.o.id}:a`,cash_refund:999})).code,409);
 assert.equal(h.events.size,0);
});
test('audit DB failure never returns a successful hardware claim',async()=>{
 const h=harness(order(),{failAudit:true});const r=await h.call(drawer,{kind:'checkout',order_id:h.o.id,event_key:`checkout:${h.o.id}`,reason:'現金結帳'});
 assert.equal(r.code,500);assert.equal(r.body.claimed,undefined);assert.equal(h.events.size,0);
});
test('noncash or truthy-string refund flags never create cash refund intent',async()=>{
 for(const route of [whole,item])for(const [method,flag] of [['card',true],['cash','true'],['cash',undefined]]){
  const o=order();o.payer.method=method;const h=harness(o);const r=await h.call(route,{reason:'帳務調整',refund_cash:flag},{id:o.id,line:'a'});
  assert.equal(r.code,200);assert.equal(r.body.cash_refund,0);assert.equal(r.body.event_key,undefined);assert.equal(o.payer.drawer_refunds,undefined);
 }
});
test('concurrent duplicate checkout claims return exactly one claimed=true',async()=>{
 const h=harness(),body={kind:'checkout',order_id:h.o.id,event_key:`checkout:${h.o.id}`,reason:'現金結帳'};
 const replies=await Promise.all([h.call(drawer,body),h.call(drawer,body)]);
 assert.deepEqual(replies.map(r=>r.body.claimed).sort(),[false,true]);assert.equal(replies[0].body.event_id,replies[1].body.event_id);
});
test('checkout audit claims once, preserves actor/operator/reason, and is guarded',async()=>{
 const h=harness();const body={event_key:`checkout:${h.o.id}`,kind:'checkout',order_id:h.o.id,reason:'現金結帳',operator_id:'staff-ok'};
 const a=await h.call(drawer,body),b=await h.call(drawer,body);
 assert.equal(a.code,200);assert.equal(a.body.claimed,true);assert.equal(b.body.claimed,false);assert.equal(a.body.event_id,b.body.event_id);assert.equal(h.events.size,1);
 const values=[...h.events.values()][0].params;assert.ok(values.includes('admin@example.test'));assert.ok(values.includes('現金結帳'));assert.ok(values.includes('staff-ok'));
 assert.match(source(),/CREATE TABLE IF NOT EXISTS pos_drawer_events[\s\S]*?event_key TEXT NOT NULL UNIQUE/);
});
