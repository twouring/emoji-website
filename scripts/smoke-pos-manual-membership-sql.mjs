// Local-only SQL acceptance. PGLITE_MODULE_PATH points to an existing installation; never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import express from 'express';
const require=createRequire(new URL('../server.js',import.meta.url));
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('actual activation SQL + immutable audit + real card/PIN/admin permission on PostgreSQL-compatible engine',async()=>{
 const db=new PGlite();let listener;
 try{
 await db.exec('CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE pos_staff(id text PRIMARY KEY,name text,pin text,active boolean,venues text,role text,note text,created_at timestamptz,updated_at timestamptz);');
 const schema=source.slice(source.indexOf('CREATE TABLE IF NOT EXISTS entitlements ('),source.indexOf('CREATE TABLE IF NOT EXISTS access_scans ('));
 await db.exec(schema);await db.exec(schema); // bootstrap must be repeatable
 await db.exec("INSERT INTO users VALUES ('u1'),('u2'); INSERT INTO pos_staff VALUES ('s1','店員甲','1234',true,'CAFE','','',now(),now()); INSERT INTO entitlements(id,user_id,plan,source,source_id,purchased_at,activated_at,starts_at,ends_at) VALUES ('old','u1','month','old','old','2020-01-01','2020-01-01','2020-01-01','2020-02-01');");
 const before=(await db.query("SELECT * FROM entitlements WHERE id='old'")).rows[0];
 const {signAccessToken,verifyAccessToken}=require('./lib/access-token');
 const secret='local-only-test-signing-secret';const card=signAccessToken({sub:'u1',ent:'yan:u1',plan:'yan-card'},secret,{ttlSec:120});
 const app=express();app.use(express.json());
 const context=vm.createContext({app,require,process:{env:{ACCESS_QR_SECRET:secret}},SECRET:secret,verifyAccessToken,rateLimit:()=> (req,res,next)=>next(),auth:(req,res,next)=>{if(!req.headers.authorization)return res.sendStatus(401);req.auth={role:req.headers.authorization==='member'?'member':'admin',sub:'admin',email:'admin@local.test',brands:[req.headers.authorization==='BAR'?'BAR':'CAFE']};next();},requireDb:(req,res,next)=>next(),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next),q:(...a)=>db.query(...a),pool:{connect:async()=>({query:(...a)=>db.query(...a),release(){}})},actorOf:a=>a.email,uid:()=> 'en_new',SEL_ENT:'*',tableOrders:{visibleVenues:brands=>brands},posStaff:require('./lib/pos-staff')});
 vm.runInContext(source.slice(source.indexOf('const FOOD_API ='),source.indexOf('async function eventEditor(')),context);
 vm.runInContext(source.split('\n').filter(l=>l.startsWith('const STAFF_SEL=')||l.startsWith('const staffRow=')).join('\n'),context);
 vm.runInContext(source.slice(source.indexOf('async function resolveOperator('),source.indexOf('/* 認人（不是登入）')),context);
 vm.runInContext(source.slice(source.indexOf("app.get('/api/admin/yan/membership-plans'"),source.indexOf('// POS 兌換空間時數')),context);
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const payload={user_id:'u1',plan:'month',reason:'本機驗收',operator_id:'s1',operator_pin:'1234',member_token:card,request_id:'11111111-1111-4111-8111-111111111111'};
 const call=async(body,auth='CAFE')=>{const r=await fetch(`http://127.0.0.1:${listener.address().port}/api/admin/yan/activate-membership`,{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>null)};};
 assert.equal((await call(payload,'member')).status,403);
 assert.equal((await call(payload,'BAR')).status,400,'other-brand operator is forbidden');
 assert.equal((await call({...payload,operator_pin:'9999'})).status,400);
 assert.equal((await call({...payload,member_token:signAccessToken({sub:'u2',ent:'yan:u2',plan:'yan-card'},secret,{ttlSec:120})})).status,400);
 const result=await call({...payload,operator_name:'偽造',actor:'偽造'});assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.body.grant.operator_name,'店員甲');assert.equal(result.body.grant.actor,'admin@local.test');
 const rows=(await db.query("SELECT * FROM entitlements WHERE user_id='u1' ORDER BY id")).rows;
 assert.equal(rows.length,2);assert.deepEqual(rows.find(e=>e.id==='old'),before);
 assert.equal(require('./lib/entitlements').deriveMemberAccess(rows).active,true,'same eligibility used by memberAccessFor');
 assert.equal((await call(payload)).body.duplicate,true);
 assert.equal((await call({...payload,request_id:'22222222-2222-4222-8222-222222222222'})).status,409);
 for(const sql of ["UPDATE pos_membership_grants SET reason='altered'","DELETE FROM pos_membership_grants"])await assert.rejects(db.query(sql),/append-only/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM pos_membership_grants')).rows[0].n,1);
 assert.ok(!('operator_pin' in (await db.query('SELECT * FROM pos_membership_grants')).rows[0]));
 console.log('SQL evidence: bootstrap twice; real CAFE/BAR admin gate, signed card, staff PIN, immediate active entitlement, old entitlement preserved, idempotency, conflict, UPDATE/DELETE denied.');
 }finally{if(listener)await new Promise(r=>listener.close(r));await db.close();}
});
