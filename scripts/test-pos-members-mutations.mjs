import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),yan=require('../lib/yan');
const src=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('actual grant/space routes: server operator, required reason, limits, rollback, balance and entitlement',async()=>{
 const routes=src.slice(src.indexOf("app.post('/api/admin/yan/grant'"),src.indexOf("app.post('/api/me/profile'"));
 const app=express();app.use(express.json());const queries=[],saved=[];
 const client={query:async(sql,params)=>{queries.push(sql);return {rows:sql.includes('FROM users')?[{id:params[0],name:'會員'}]:[]};},release:()=>{}};
 const rows=yan.applyGrant([],{userId:'u1',points:50,reason:'初始點數',operator:{id:'s1',name:'原店員'}}).rows;
 const next=(req,res,cb)=>{req.auth={email:'admin@example.com'};cb();};
 vm.runInNewContext(routes,{app,auth:next,adminOnly:next,requireDb:next,wrap:fn=>(req,res,cb)=>Promise.resolve(fn(req,res)).catch(cb),resolveOperator:async(req,id)=>id==='s1'?{id:'s1',name:'伺服器店員'}:null,pool:{connect:async()=>client},yan,yanRowsFor:async()=>rows,persistYanDiff:async(c,b,r)=>saved.push(r),actorOf:()=> 'admin@example.com',uid:()=> 'en_test',contentValue:async()=>({day_4h:10,day_12h:100})});
 const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${listener.address().port}/api/admin/yan/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{
  const body={user_id:'u1',points:5,reason:'活動贈點',operator_id:'s1',operator_name:'偽造姓名'};
  assert.equal((await post('grant',{...body,operator_id:null})).status,400);assert.equal(saved.length,0);
  assert.equal((await post('grant',{...body,reason:''})).status,400);assert.equal(saved.length,0);assert.ok(queries.includes('ROLLBACK'));
  assert.equal((await post('grant',{...body,points:1001})).status,400);
  const granted=await post('grant',body);assert.equal(granted.status,200);assert.equal(granted.body.balance,55);assert.equal(saved.at(-1).at(-1).operator_name,'伺服器店員');assert.equal(saved.at(-1).at(-1).reason,'活動贈點');assert.ok(saved.at(-1).at(-1).created_at);assert.equal(saved.at(-1).at(-1).actor,'admin@example.com');
  assert.equal((await post('redeem-space',{user_id:'u1',plan:'day_4h'})).status,400);
  assert.equal((await post('redeem-space',{user_id:'u1',plan:'day_12h',operator_id:'s1'})).status,400);
  const space=await post('redeem-space',{user_id:'u1',plan:'day_4h',operator_id:'s1'});assert.equal(space.status,200);assert.equal(space.body.balance,40);assert.ok(queries.some(s=>s.includes('INSERT INTO entitlements')));
 }finally{await new Promise(r=>listener.close(r));}
});
