import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tableOrders=require('../lib/table-orders');
const front=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const doc=fs.readFileSync(new URL('../docs/API.md',import.meta.url),'utf8');

function drawerContext(extra={}){
 const calls=[],messages=[];
 const ctx={Promise,Map,Set,Date,Number,String,crypto:{randomUUID:()=>'x'},OPERATOR:{id:'staff1'},api:async(path,body)=>{calls.push({path,...body});return {ok:true,claimed:true};},toast:m=>messages.push(m),starReady:()=>true,starSend:async job=>{calls.push(job);return true;},starHint(){},starOpenHere(){},...extra};
 vm.createContext(ctx);
 const start=front.indexOf('const DRAWER_ATTEMPTS=');
 vm.runInContext(front.slice(start,front.indexOf('const c39=',start)),ctx);
 return {ctx,calls,messages};
}
test('開帳成功後送一次 register:<id> 開櫃事件，重按不重送',async()=>{
 const {ctx,calls}=drawerContext();
 assert.equal(await ctx.registerCashDrawer('rg_0123456789abcdef'),true);
 assert.equal(await ctx.registerCashDrawer('rg_0123456789abcdef'),false);
 assert.equal(calls.length,2);
 assert.equal(calls[0].path,'/admin/pos/drawer-events');
 assert.deepEqual({k:calls[0].body.event_key,kind:calls[0].body.kind,r:calls[0].body.register_id},{k:'register:rg_0123456789abcdef',kind:'register',r:'rg_0123456789abcdef'});
 assert.equal(calls[1].drawer,true);
});
test('沒有帳本 id 不開；稽核失敗不送硬體指令',async()=>{
 assert.equal(await drawerContext().ctx.registerCashDrawer(''),null);
 const {ctx,calls}=drawerContext({api:async()=>{throw Error('offline');}});
 assert.equal(await ctx.registerCashDrawer('rg_0123456789abcdef'),false);assert.equal(calls.length,0);
});
test('開帳表單成功回呼呼叫 registerCashDrawer(out.id)，失敗提示按「錢櫃」',()=>{
 const s=front.slice(front.indexOf('function bindOpenForm'),front.indexOf('function registerReportSpec'));
 assert.match(s,/api\('\/admin\/registers\/open'[\s\S]*registerCashDrawer\(out\.id\)/);
 assert.match(s,/按「錢櫃」/);
});

function harness(reg){
 const routes=new Map(),events=new Map();
 async function q(sql,p=[]){
  if(sql.includes('FROM pos_registers'))return {rows:reg&&p[0]===reg.id?[reg]:[]};
  if(sql.includes('INSERT INTO pos_drawer_events')){if(events.has(p[1]))return {rows:[]};const row={id:p[0]};events.set(p[1],row);return {rows:[row]};}
  if(sql.includes('FROM pos_drawer_events'))return {rows:events.has(p[0])?[events.get(p[0])]:[]};
  return {rows:[]};
 }
 const pass=()=>{};
 const ctx={app:{post:(path,...h)=>routes.set(path,h)},auth:pass,adminOnly:pass,requireDb:pass,wrap:f=>f,q,tableOrders,ORDER_ID_RE:/^to_[a-z0-9]{16}$/,resolveOperator:async(req,id)=>id==='staff-ok'?{id,name:'小明'}:null,actorOf:a=>a.email,uid:p=>p+'1',String,Number,JSON,Error};
 const start=server.indexOf("app.post('/api/admin/pos/drawer-events'");
 vm.runInNewContext(server.slice(start,server.indexOf('\n}));',start)+6),ctx);
 return async(body,brands=null)=>{const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await routes.get('/api/admin/pos/drawer-events').at(-1)({body,auth:{email:'a@x',brands}},res);return res;};
}
const RID='rg_0123456789abcdef';
test('伺服器：開著的帳本可領一次開櫃資格，重送 claimed:false',async()=>{
 const call=harness({id:RID,venue:'CAFE',closed_at:null});
 const body={kind:'register',event_key:'register:'+RID,register_id:RID,reason:'開帳放零用金'};
 assert.equal((await call(body)).body.claimed,true);
 assert.equal((await call(body)).body.claimed,false);
});
test('伺服器：代碼不符、帶訂單、已關帳、跨品牌都拒絕',async()=>{
 const base={kind:'register',event_key:'register:'+RID,register_id:RID,reason:'開帳放零用金'};
 const call=harness({id:RID,venue:'CAFE',closed_at:null});
 assert.equal((await call({...base,event_key:'register:rg_ffffffffffffffff'})).code,400);
 assert.equal((await call({...base,order_id:'to_0123456789abcdef'})).code,400);
 assert.equal((await call({...base,register_id:'bad'})).code,400);
 assert.equal((await call(base,['BAR'])).code,404);
 assert.equal((await harness({id:RID,venue:'CAFE',closed_at:'2026-10-18'})(base)).code,409);
 assert.equal((await harness(null)(base)).code,404);
});
test('schema 與文件允許 register 種類',()=>{
 assert.match(server,/CHECK \(kind IN \('checkout','refund','manual','register'\)\)/);
 assert.match(server,/DROP CONSTRAINT IF EXISTS pos_drawer_events_kind_check/);
 assert.match(doc,/`register`：/);
});
