import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
async function harness(run){
 const start=server.indexOf("app.get('/api/admin/yan/membership-plans'");
 assert.ok(start>=0,'real manual membership routes must be wired');
 const end=server.indexOf('// POS 兌換空間時數',start);
 const state={ents:[],audits:[],queries:[],failAudit:false};let tail=Promise.resolve();
 const pool={connect:async()=>{let unlock;return {release(){},async query(sql,p=[]){
  state.queries.push(sql);
  if(sql.includes('pg_advisory_xact_lock')){const prev=tail;tail=new Promise(r=>unlock=r);await prev;}
  if(sql==='COMMIT'||sql==='ROLLBACK'){if(sql==='ROLLBACK'&&this.added){state.ents.pop();state.audits.pop();}unlock?.();return {rows:[]};}
  if(sql.startsWith('SELECT id FROM users'))return {rows:p[0]==='missing'?[]:[{id:p[0]}]};
  if(sql.includes('FROM pos_membership_grants'))return {rows:state.audits.filter(a=>a.request_id===p[0])};
  if(sql.includes('FROM entitlements'))return {rows:state.ents};
  if(sql.startsWith('INSERT INTO entitlements')){state.ents.push({id:p[0],user_id:p[1],plan:p[2],activated_at:p[4],starts_at:p[4],ends_at:p[5]});this.added=true;return {rows:[state.ents.at(-1)]};}
  if(sql.startsWith('INSERT INTO pos_membership_grants')){if(state.failAudit)throw new Error('audit unavailable');state.audits.push({request_id:p[0],entitlement_id:p[1],user_id:p[2],plan:p[3],reason:p[4],operator_id:p[5],operator_name:p[6],actor:p[7],created_at:p[8],starts_at:p[8],ends_at:p[9]});return {rows:[state.audits.at(-1)]};}
  return {rows:[]};
 }}}};
 const app=express();app.use(express.json());
 vm.runInNewContext(server.slice(start,end),{app,rateLimit:()=> (req,res,next)=>next(),q:async(sql,p)=>({rows:p[1]==='1234'?[{id:p[0]}]:[]}),require:createRequire(new URL('../server.js',import.meta.url)),auth:(req,res,next)=>{req.auth={sub:'admin',email:'admin@example.com'};return req.headers.authorization?next():res.sendStatus(401);},adminOnly:(req,res,next)=>req.headers.authorization==='admin'?next():res.sendStatus(403),requireDb:(req,res,next)=>next(),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),pool,resolveOperator:async(req,id)=>id==='1234'?{id:'staff1',name:'店員甲'}:null,verifyAccessToken:t=>t==='card-u1'?{sub:'u1',plan:'yan-card'}:t==='card-missing'?{sub:'missing',plan:'yan-card'}:null,SECRET:'test',process:{env:{}},actorOf:a=>a.email,uid:()=>`en_${state.ents.length}`,SEL_ENT:'*'});
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const call=async(body,authorization='admin',method='POST',path='/api/admin/yan/activate-membership')=>{const r=await fetch(`http://127.0.0.1:${listener.address().port}${path}`,{method,headers:{'content-type':'application/json',authorization},...(method==='POST'?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json().catch(()=>null)};};
 try{await run(call,state);}finally{await new Promise(r=>listener.close(r));}
}
test('operator wrapper propagates mutation failure and releases state after cancel',async()=>{
 const line=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8').split('\n').find(l=>l.startsWith('async function ensureOperator('));let done,cancel;
 const ctx=vm.createContext({OPERATOR:{id:'staff1'},openOperatorPad:(fn,required,onCancel)=>{done=fn;cancel=onCancel;}});vm.runInContext(line,ctx);
 const failure=ctx.ensureOperator(async()=>{throw new Error('network');});const rejected=assert.rejects(failure,/network/);await done();await rejected;assert.equal(ctx.OPERATOR,null);
 const cancelled=ctx.ensureOperator(()=>{throw new Error('must not run');});assert.equal(typeof cancel,'function');cancel();await cancelled;assert.equal(ctx.OPERATOR,null);
});
const body={user_id:'u1',plan:'month',reason:'系統漏開',operator_id:'1234',operator_pin:'1234',member_token:'card-u1',request_id:'00000000-0000-4000-8000-000000000001'};
test('real Express activation requires auth, matching signed card, reason and server operator',()=>harness(async(call,state)=>{
 assert.equal((await call(body,'')).status,401);assert.equal((await call(body,'member')).status,403);
 for(const override of [{operator_id:'forged'},{member_token:'wrong'},{user_id:'u2'},{plan:'founding'},{plan:'year_promo'},{reason:''},{request_id:'bad'}])assert.equal((await call({...body,...override})).status,400);
 assert.equal(state.ents.length,0);
 const r=await call({...body,operator_name:'forged',actor:'forged',starts_at:'2000-01-01',ends_at:'2099-01-01'});
 assert.equal(r.status,200);assert.equal(state.ents.length,1);assert.equal(state.audits[0].operator_name,'店員甲');assert.equal(state.audits[0].actor,'admin@example.com');assert.ok(new Date(state.ents[0].starts_at).getFullYear()>2000);
 assert.equal((await call(body)).body.duplicate,true);assert.equal(state.ents.length,1);
 assert.equal((await call({...body,reason:'換原因'})).status,409);
 assert.equal((await call({...body,request_id:'00000000-0000-4000-8000-000000000002'})).status,409);
 assert.ok(!state.queries.some(q=>/^UPDATE|table_orders|invoice|stripe/i.test(q)));
}));
test('manual activation cannot bypass per-mutation PIN with a known staff id',()=>harness(async(call,state)=>{assert.equal((await call({...body,operator_pin:undefined})).status,400);assert.equal((await call({...body,operator_pin:'9999'})).status,400);assert.equal(state.ents.length,0);}));
test('concurrent requests issue one entitlement; audit failure rolls back',()=>harness(async(call,state)=>{
 const r=await Promise.all([call(body),call(body)]);assert.ok(r.every(x=>x.status===200));assert.equal(state.ents.length,1);assert.equal(state.audits.length,1);
}));
test('concurrent different request keys cannot double-activate',()=>harness(async(call,state)=>{
 const results=await Promise.all([call(body),call({...body,request_id:'00000000-0000-4000-8000-000000000003'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(state.ents.length,1);assert.equal(state.audits.length,1);
}));
test('audit failure cannot leave effective grant',()=>harness(async(call,state)=>{state.failAudit=true;assert.equal((await call(body)).status,500);assert.equal(state.ents.length,0);}));
test('manual membership starts now with existing duration, never grants special plans or overlaps',()=>{
 const {prepareManualMembership,manualPlans}=require('../lib/pos-manual-membership');
 const now=new Date('2026-01-31T04:00:00Z');
 assert.deepEqual(manualPlans.map(p=>p.plan),['day_4h','day_12h','month','quarter','year']);
 const out=prepareManualMembership({plan:'month',reason:'現場補發'},[],now);
 assert.equal(out.starts_at.toISOString(),now.toISOString());
 assert.equal(out.activated_at.toISOString(),now.toISOString());
 assert.equal(out.ends_at.toISOString(),'2026-02-28T04:00:00.000Z');
 for(const plan of ['founding','event-ticket','year_promo','__proto__'])assert.throws(()=>prepareManualMembership({plan,reason:'補發'},[],now));
 assert.throws(()=>prepareManualMembership({plan:'month',reason:' '},[],now));
 assert.throws(()=>prepareManualMembership({plan:'month',reason:'補發'},[{plan:'month',purchased_at:now}],now),/會籍/);
 assert.throws(()=>prepareManualMembership({plan:'month',reason:'補發'},[{plan:'month',purchased_at:now,activated_at:now,starts_at:now,ends_at:'2026-02-28'}],now),/會籍/);
});
