// Optional real PostgreSQL-engine verification, no production DB and no external messages.
// npm install --prefix .tmp/line-test-tools --no-audit --no-fund @electric-sql/pglite
// PGLITE_MODULE="$PWD/.tmp/line-test-tools/node_modules/@electric-sql/pglite" node --test scripts/verify-line-delivery-postgres.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {once} from 'node:events';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const {createLineDelivery,SCHEMA,TICKETS,REVIEWS,CLAIM}=require('../lib/line-delivery');
const {createLineService}=require('../lib/line-service');
const {signAccessToken,verifyAccessToken}=require('../lib/access-token');
const owner='U'+'a'.repeat(32);
const env={LINE_CHANNEL_SECRET:'s',LINE_CHANNEL_ACCESS_TOKEN:'t',LINE_REVIEW_URL:'https://example.com/review'};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id text PRIMARY KEY,name text,email text,phone_e164 text,line_user_id text UNIQUE,line_linked_at timestamptz);
 CREATE TABLE events(id text PRIMARY KEY,slug text,title text,location text,starts_at timestamptz,ends_at timestamptz,status text,event_details jsonb DEFAULT '{}');
 CREATE TABLE event_regs(id text PRIMARY KEY,user_id text,event_id text,ticket_version int DEFAULT 1,status text,quantity int DEFAULT 1,language text DEFAULT 'zh',confirmation_queued boolean DEFAULT true,stripe_session_id text,stripe_payment_intent_id text,amount_due int DEFAULT 0,amount_paid int DEFAULT 0,paid_at timestamptz,checkout_expires_at timestamptz);
 CREATE TABLE event_attendees(id text PRIMARY KEY,registration_id text,order_id text);
 CREATE TABLE event_ticket_orders(id text PRIMARY KEY,status text);
 CREATE TABLE table_orders(id text PRIMARY KEY,user_id text,amount int,status text,paid_at timestamptz,done_at timestamptz);
 CREATE TABLE pos_staff(id text,name text);
 CREATE TABLE dining_reservations(id text PRIMARY KEY,request_id text,reserve_date date,reserve_time text,period text,party_size int,name text,phone text,email text,note text,source text,status text,table_no text,staff_note text,handled_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),deleted_at timestamptz,lang text,line_user_id text);`);
 await db.exec(SCHEMA);
 const q=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rows.length || result.affectedRows || 0};};
 await q('INSERT INTO users(id,name,line_user_id) VALUES($1,$2,$3)',['u1','private@example.com',owner]);
 const calls=[],logs=[];
 const service=createLineDelivery({q,origin:()=> 'https://www.emoji.tw',env:()=>env,log:{error:m=>logs.push(m)},
 buildTicket:async(serial)=>({event:{id:'e1',title:'Event',slug:'event',starts_at:Date.now()+86400000},ticket:{token:signAccessToken({sub:'u1',ent:'r1',plan:'event-ticket',event:'e1',version:1,attendee:serial},'qr-secret',{ttlSec:3600})}}),
 fetcher:async(url,init)=>{calls.push({url,body:JSON.parse(init.body),key:init.headers['X-Line-Retry-Key']});return {ok:true,text:async()=> '{}'};}});
 return {db,q,calls,logs,service};
}
test('PostgreSQL 引擎（PGlite）：已成立票券逐人去重，兩個 worker 不會重複領取',async t=>{
 const {db,q,calls,service}=await fixture(t);
 await db.exec(`INSERT INTO events(id,status,starts_at) VALUES('e1','報名中',now()+interval '1 day'),('cancelled','已取消',now()+interval '1 day');
 INSERT INTO event_regs(id,user_id,event_id,status,quantity) VALUES('r1','u1','e1','registered',2),('pending','u1','e1','pending_payment',1),('cancelled','u1','cancelled','registered',1);
 INSERT INTO event_attendees VALUES('a1','r1',NULL),('a2','r1',NULL),('a3','r1','extra');
 INSERT INTO event_ticket_orders VALUES('extra','pending_payment');`);
 await Promise.all([service.enqueueTickets(),service.enqueueTickets()]);
 assert.equal((await q('SELECT * FROM line_deliveries')).rows.length,2);
 await Promise.all([service.run(),service.run()]);
 assert.equal(calls.length,2);assert.equal(new Set(calls.map(x=>x.key)).size,2);
 for(const call of calls){const msg=call.body.messages[0];assert.equal(msg.type,'flex');
  const encoded=new URL(msg.contents.hero.url).pathname.split('/').pop().slice(0,-4),token=decodeURIComponent(encoded);
  assert.ok(verifyAccessToken(token,'qr-secret').attendee);assert.ok(!JSON.stringify(call.body).includes('private@'));}
 await service.run();assert.equal(calls.length,2);
 await q("UPDATE event_ticket_orders SET status='registered' WHERE id='extra'");await service.run();assert.equal(calls.length,3);
 await q("UPDATE event_regs SET ticket_version=2 WHERE id='r1'");await service.enqueueTickets();
 assert.equal((await q("SELECT * FROM line_deliveries WHERE version=2")).rows.length,3);
});
test('PostgreSQL 引擎（PGlite）：評論只在完成用餐後24–72h，設定關閉、同日去重、作廢重查',async t=>{
 const {db,q,calls,service}=await fixture(t);
 await db.exec(`INSERT INTO users(id,line_user_id) VALUES('u2','U2'),('u3','U3');
 INSERT INTO table_orders VALUES
 ('valid','u1',100,'done',now()-interval '25 hours',NULL),('split','u1',100,'done',now()-interval '25 hours',NULL),
 ('too_new','u2',100,'done',now()-interval '23 hours',NULL),('too_old','u2',100,'done',now()-interval '73 hours',NULL),
 ('void','u2',100,'void',now()-interval '25 hours',NULL),('not_done','u2',100,'paid',now()-interval '25 hours',NULL),
 ('zero','u2',0,'done',now()-interval '25 hours',NULL),('done_recent','u3',100,'done',now()-interval '30 hours',now()-interval '1 hour');`);
 const disabled=createLineDelivery({q,env:()=>({...env,LINE_REVIEW_URL:''}),origin:()=> 'https://www.emoji.tw',buildTicket:async()=>null});
 await disabled.run();assert.equal((await q('SELECT * FROM line_deliveries')).rows.length,0);
 await q(REVIEWS);assert.equal((await q('SELECT * FROM line_deliveries')).rows.length,1);
 await q("UPDATE table_orders SET status='void' WHERE id=(SELECT source_id FROM line_deliveries LIMIT 1)");
 await service.run();assert.equal(calls.length,0);
 assert.equal((await q('SELECT state FROM line_deliveries')).rows[0].state,'skipped');
});
test('PostgreSQL 引擎（PGlite）：租約可回收，固定 retry key，過24h保證前停止重送',async t=>{
 const {q}=await fixture(t);
 await q("INSERT INTO line_deliveries(id,kind,source_id) VALUES('job','review','o1')");
 const first=(await q(CLAIM)).rows[0];assert.equal((await q(CLAIM)).rows.length,0);
 await q("UPDATE line_deliveries SET available_at=now()-interval '1 second'");
 const second=(await q(CLAIM)).rows[0];assert.equal(second.retry_key,first.retry_key);assert.equal(second.attempts,2);
 await q("UPDATE line_deliveries SET available_at=now()-interval '1 second',first_attempt_at=now()-interval '24 hours'");
 assert.equal((await q(CLAIM)).rows.length,0);
});
test('PostgreSQL 引擎：QR尚未設定的工作不耗重試期限',async t=>{
 const {db,q}=await fixture(t);
 await db.exec(`INSERT INTO events(id,status,starts_at) VALUES('e1','報名中',now()+interval '1 day');
 INSERT INTO event_regs(id,user_id,event_id,status) VALUES('r1','u1','e1','registered');`);
 const paused=createLineDelivery({q,env:()=>env,origin:()=> 'https://www.emoji.tw',buildTicket:async()=>null});
 await paused.run();const row=(await q('SELECT * FROM line_deliveries')).rows[0];
 assert.equal(row.state,'pending');assert.equal(row.attempts,0);assert.equal(row.first_attempt_at,null);
});

async function boot(t,q,hooks){
 const run=(sql,args)=>q(sql,args),module={exports:{}};
 const localRequire=name=>name==='pg'?{Pool:class{query=run;async connect(){return {query:run,release(){}};}}}:createRequire(path.join(root,'server.js'))(name);
 const context=vm.createContext({require:localRequire,module,__dirname:root,process:{env:{NODE_ENV:'test',APP_SECRET:'test-secret',ADMIN_API_KEY:'k'.repeat(32),DATABASE_URL:'x',PUBLIC_ORIGIN:'http://127.0.0.1',EVENT_QR_SECRET:'qr-secret'}},Buffer,URL,URLSearchParams,AbortSignal,Date,setTimeout,fetch:()=>{throw Error('network forbidden');},console:{log(){},warn(){},error(){}}});
 new vm.Script(readFileSync(path.join(root,'server.js'),'utf8')+'\ndbReady=true;module.exports.testHooks={notifyRegistration,fulfillEventCheckout};').runInContext(context);
 if(hooks)Object.assign(hooks,module.exports.testHooks);
 const http=module.exports.app.listen(0,'127.0.0.1');await once(http,'listening');
 t.after(()=>new Promise(resolve=>{http.close(resolve);http.closeAllConnections();}));
 return `http://127.0.0.1:${http.address().port}`;
}
test('PostgreSQL 引擎（PGlite） + HTTP：安全QR回PNG，版本/取消/退款拒絕；LINE取消立即出現在POS',async t=>{
 const {db,q}=await fixture(t),base=await boot(t,q);
 await db.exec(`INSERT INTO events(id,status) VALUES('e1','報名中');INSERT INTO event_regs(id,user_id,event_id,status) VALUES('r1','u1','e1','registered');`);
 const token=signAccessToken({sub:'u1',ent:'r1',event:'e1',plan:'event-ticket',version:1},'qr-secret',{ttlSec:3600});
 let res=await fetch(base+'/api/line/qr/'+token+'.png');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/image\/png/);assert.match(res.headers.get('cache-control'),/no-store/);assert.deepEqual([...new Uint8Array(await res.arrayBuffer()).slice(0,4)],[137,80,78,71]);
 await q("UPDATE event_regs SET ticket_version=2 WHERE id='r1'");assert.equal((await fetch(base+'/api/line/qr/'+token+'.png')).status,404);
 await q("UPDATE event_regs SET ticket_version=1,status='refunded' WHERE id='r1'");assert.equal((await fetch(base+'/api/line/qr/'+token+'.png')).status,404);
 await q("UPDATE event_regs SET status='registered' WHERE id='r1'");await q("UPDATE events SET status='已取消'");assert.equal((await fetch(base+'/api/line/qr/'+token+'.png')).status,404);
 await q(`INSERT INTO dining_reservations(id,request_id,reserve_date,reserve_time,period,party_size,name,status,line_user_id,lang)
 VALUES('d1','1016-01',(now() AT TIME ZONE 'Asia/Taipei')::date+1,'19:00','三點水',2,'Guest','confirmed',$1,'zh')`,[owner]);
 const svc=createLineService({q,env:()=>({}),origin:()=>base});assert.equal((await svc.cancelByLine('d1',owner)).ok,true);
 const session='k'.repeat(32); // existing admin API key: no synthetic member/admin rows
 res=await fetch(base+'/api/admin/reservations',{headers:{authorization:'Bearer '+session}});assert.equal(res.status,200);assert.equal((await res.json()).reservations[0].status,'cancelled');
 assert.equal((await svc.cancelByLine('d1',owner)).ok,false);
});

test('PostgreSQL 引擎 + 實際付款完成函式：付款提交後排票，LINE資料庫失敗不回滾付款',async t=>{
 const saved={LINE_CHANNEL_SECRET:process.env.LINE_CHANNEL_SECRET,LINE_CHANNEL_ACCESS_TOKEN:process.env.LINE_CHANNEL_ACCESS_TOKEN};
 Object.assign(process.env,{LINE_CHANNEL_SECRET:'test-secret',LINE_CHANNEL_ACCESS_TOKEN:'test-token'});
 t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const {db,q}=await fixture(t),hooks={};let failQueue=false;
 await boot(t,async(sql,args)=>{if(failQueue&&sql.startsWith('INSERT INTO line_deliveries'))throw Error('private@example.com');return q(sql,args);},hooks);
 await db.exec(`INSERT INTO events(id,status,starts_at) VALUES('e1','報名中',now()+interval '1 day');
 INSERT INTO event_regs(id,user_id,event_id,status,stripe_session_id,amount_due) VALUES('r1','u1','e1','pending_payment','cs1',100),('r2','u1','e1','pending_payment','cs2',100);`);
 const session=id=>({id:'cs'+id,payment_status:'paid',currency:'twd',amount_total:10000,payment_intent:'pi'+id,metadata:{kind:'event-registration',registration_id:'r'+id,event_id:'e1',user_id:'u1'}});
 assert.equal((await hooks.fulfillEventCheckout(session(1))).already,false);
 await hooks.notifyRegistration('u1','e1');
 assert.equal((await q("SELECT status FROM event_regs WHERE id='r1'")).rows[0].status,'registered');
 assert.equal((await q('SELECT * FROM line_deliveries')).rows.length,1);
 failQueue=true;assert.equal((await hooks.fulfillEventCheckout(session(2))).already,false);
 await hooks.notifyRegistration('u1','e1');
 assert.equal((await q("SELECT status FROM event_regs WHERE id='r2'")).rows[0].status,'registered');
});
