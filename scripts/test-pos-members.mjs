import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
const ops=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
test('switching tables clears bill identity and redemption selection',()=>{
 let click;
 const ctx=vm.createContext({host:{querySelectorAll:()=>[{dataset:{posTable:'A2'},set onclick(fn){click=fn;}}]},POS_YAN:{id:'u1',redeemSet:new Set(['line1'])},POS_MEMBER:true,paintPos:()=>{}});
 const line=ops.split('\n').find(l=>l.includes("host.querySelectorAll('[data-pos-table]')"));
 vm.runInContext(line,ctx);click();assert.equal(ctx.POS_YAN.id,undefined);assert.equal(ctx.POS_MEMBER,false);
});
test('late phone lookup and card scan cannot bind a different table or replace a newer choice',async()=>{
 for(const mode of ['lookup','scan']){
  let resolveLookup;const nodes={};
  const el=id=>nodes[id]||(nodes[id]={value:'0912345678',onclick:null,onchange:null,onkeydown:null});
  const box={set innerHTML(v){},querySelector:sel=>el(sel)};
  const ov={querySelector:()=>box,classList:{add(){}}};
  const ctx=vm.createContext({pickOverlay:()=>({ov,close(){}}),tipIcon:()=>'',esc:String,num:String,memberStatusText:()=>'',cur:null,POS_TABLE:'A1',POS_YAN:{},POS_MEMBER:false,pickMemberCard:async()=> 'QR',toast:()=>{},paintPos:()=>{},api:()=>new Promise(r=>{resolveLookup=r;}),opsThen:async(fn,done,paint)=>{done(await fn());paint();}});
  vm.runInContext(ops.slice(ops.indexOf('function openMemberDialog('),ops.indexOf('function paintPos(){')),ctx);
  vm.runInContext("openMemberDialog({id:'session1',table:'A1'})",ctx);
  const pending=el(mode==='lookup'?'#pos-yan-lookup':'#pos-yan-scan').onclick();for(let i=0;i<10&&!resolveLookup;i++)await new Promise(r=>setImmediate(r));assert.ok(resolveLookup,'lookup must be pending');
  ctx.POS_TABLE='A2';ctx.POS_YAN={id:'new-member'};resolveLookup({member:{id:'old-member'},active:true,balance:50});await pending;
  assert.equal(ctx.POS_YAN.id,'new-member');assert.equal(ctx.POS_MEMBER,false);
 }
});
test('table session turnover clears identity even when table number stays the same',()=>{
 const ctx=vm.createContext({cur:{id:'new-session'},POS_YAN:{id:'u1',sessionId:'old-session'},POS_MEMBER:true});
 vm.runInContext(ops.split('\n').find(l=>l.includes('if(POS_YAN.sessionId&&')),ctx);assert.equal(ctx.POS_YAN.id,undefined);assert.equal(ctx.POS_MEMBER,false);
});
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
async function harness(run){
 const start=server.indexOf("app.get('/api/admin/yan/members',");
 assert.ok(start>=0,'member browse read API must exist');
 const end=server.indexOf("app.post('/api/admin/yan/lookup'",start);
 const app=express(),queries=[];
 vm.runInNewContext(server.slice(start,end),{app,auth:(req,res,next)=>req.headers.authorization?next():res.sendStatus(401),adminOnly:(req,res,next)=>req.headers.authorization==='admin'?next():res.sendStatus(403),requireDb:(req,res,next)=>next(),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),q:async(sql,params)=>{queries.push({sql,params});if(sql.includes('WHERE id=$1'))return {rows:params[0]==='missing'?[]:[{id:'u1',name:'小明',phone_e164:'+886912345678',email:'private'}]};return {rows:[{id:'u1',name:'小明',phone:'+886912345678'}]};},yanRowsFor:async()=>Array.from({length:60},(_,i)=>({id:'l'+i,kind:'grant',delta:5,reason:'活動',operator_name:'店員',operator_id:'s1',actor:'private@example.com',created_at:new Date(i*1000).toISOString()})),yan:{balance:()=>300},loadEntitlements:async()=>[],deriveMemberAccess:()=>({active:true})});
 const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 try{await run(async(path,authorization='admin')=>{const r=await fetch(`http://127.0.0.1:${listener.address().port}${path}`,{headers:authorization?{authorization}:{}});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null};},queries);}finally{await new Promise(r=>listener.close(r));}
}
test('member reads enforce auth/admin, bounded pagination and never create accounts',()=>harness(async(get,queries)=>{
 assert.equal((await get('/api/admin/yan/members','')).status,401);
 assert.equal((await get('/api/admin/yan/members','member')).status,403);
 assert.equal((await get('/api/admin/yan/members?limit=500')).status,400);
 assert.equal((await get('/api/admin/yan/members?offset=-1')).status,400);
 const r=await get('/api/admin/yan/members?q=0912&limit=25');assert.equal(r.status,200);assert.equal(r.body.members[0].name,'小明');
 assert.ok(queries.every(q=>!/(INSERT|UPDATE|DELETE)/.test(q.sql)));assert.ok(queries.at(-1).params.includes(26));
}));
test('detail returns balance/status, paginated audited ledger without private actor/email',()=>harness(async(get)=>{
 const r=await get('/api/admin/yan/members/u1');assert.equal(r.status,200);assert.equal(r.body.balance,300);assert.equal(r.body.active,true);assert.equal(r.body.ledger.length,25);assert.equal(r.body.next_offset,25);assert.equal(r.body.ledger[0].reason,'活動');assert.equal(r.body.ledger[0].operator_name,'店員');assert.equal(r.body.ledger[0].id,'l59');assert.ok(!JSON.stringify(r.body).includes('private'));
 assert.equal((await get('/api/admin/yan/members/missing')).status,404);
 assert.equal((await get('/api/admin/yan/members/u1?offset=no')).status,400);
}));
