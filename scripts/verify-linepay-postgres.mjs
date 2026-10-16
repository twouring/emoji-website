// Actual PostgreSQL engine, entirely synthetic data; never calls LINE Pay.
// PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node scripts/verify-linepay-postgres.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),lp=require('../lib/linepay-offline');
const {PGlite}=require(process.env.PGLITE_MODULE);
const db=new PGlite();
await db.exec(`CREATE TABLE table_sessions(id text PRIMARY KEY,table_no text,status text,items jsonb,pay_requests jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now());
CREATE TABLE table_orders(id text PRIMARY KEY,status text,items jsonb,amount int,payer jsonb,session_id text,table_no text,invoice jsonb,done_at timestamptz,paid_at timestamptz DEFAULT now());`);
assert.ok(lp.schema,'durable payment schema and DB freeze guard exist');
await db.exec(lp.schema);
await db.exec(lp.schema); // deployment migration is idempotent
await db.query("INSERT INTO table_sessions(id,table_no,status,items) VALUES('ts_test','A1','open',$1)",[JSON.stringify([{line:'a',price:120,qty:1,venue:'CAFE'}])]);
const env={LINEPAY_OFFLINE_ENABLED:'1',LINEPAY_OFFLINE_ENV:'sandbox',LINEPAY_OFFLINE_CHANNEL_ID:'1234567890',LINEPAY_OFFLINE_CHANNEL_SECRET:'synthetic',LINEPAY_OFFLINE_V2_APPROVED:'1'};
const pool={connect:async()=>({query:db.query.bind(db),release(){}})};
let sends=0,checks=0,n=0;
const service=lp.createService({pool,env,uid:()=>`lp_${++n}`,owned:()=>true,quote:async s=>({amount:120,lines:s.items}),api:{pay:async()=>{sends++;throw Error('simulated timeout');},check:async a=>{checks++;return {returnCode:'0000',info:{orderId:a.id,status:'COMPLETE',transactionId:'2019010112345678910',payInfo:[{amount:120}]}};}},finish:async(c,s,a)=>{
 await c.query("INSERT INTO table_orders(id,status,items,amount,payer) VALUES('to_test','paid',$1,120,$2)",[JSON.stringify(s.items),JSON.stringify({method:'linepay',linepay_payment:a.id})]);
 await c.query("UPDATE table_sessions SET status='closed' WHERE id=$1",[s.id]);
 return {order_id:'to_test',amount:a.amount};
}});
const a=await service.prepare('ts_test',{});
for(const sql of ["UPDATE table_sessions SET status='closed' WHERE id='ts_test'","UPDATE table_sessions SET items='[]' WHERE id='ts_test'","UPDATE table_sessions SET table_no='A2' WHERE id='ts_test'"]){await assert.rejects(db.query(sql),/LINEPAY_PAYMENT_LOCK/);}
await assert.rejects(db.query("INSERT INTO linepay_payments(id,session_id,amount,snapshot,quote,mode,channel) SELECT 'lp_duplicate',session_id,amount,snapshot,quote,mode,channel FROM linepay_payments"),/unique/);
assert.equal((await service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'})).state,'unknown');
assert.equal((await service.check('ts_test',{},{attempt_id:a.id})).state,'settled');
assert.equal((await service.pay('ts_test',{},{attempt_id:a.id,oneTimeKey:'123456789012345678'})).state,'settled');
assert.equal(sends,1);assert.equal(checks,1);
assert.equal((await db.query('SELECT count(*)::int AS n FROM table_orders')).rows[0].n,1);
assert.equal((await db.query('SELECT transaction_id FROM linepay_payments')).rows[0].transaction_id,'2019010112345678910');
await assert.rejects(db.query("UPDATE table_orders SET status='void' WHERE id='to_test'"),/LINEPAY_REFUND_REQUIRED/);
await assert.rejects(db.query("UPDATE table_orders SET amount=1 WHERE id='to_test'"),/LINEPAY_REFUND_REQUIRED/);
await db.query("UPDATE table_orders SET status='done' WHERE id='to_test'");
// Execute the production POS quote+finish SQL as well, including a failure after writes.
const orders=require('../lib/table-orders'),hooks=require('../lib/linepay-pos').createHooks({tableOrders:orders,uid:p=>p+(++n),contentValue:async()=>'',resolveOperator:async()=>({id:'op_test',name:'合成員工'}),activePaymentCodes:async()=>['linepay'],registersOpenMap:async()=>({}),posRegister:{checkoutAllowed:()=>({})},ezpayInvoice:{invoiceForm:()=>({requested:false})},actorOf:()=> 'synthetic'});
await db.query("INSERT INTO table_sessions(id,table_no,status,items) VALUES('ts_pos','A2','open',$1)",[JSON.stringify([{line:'real_sql',price:240,qty:1,venue:'CAFE',placed_at:'test'}])]);
let breakFinish=true,posCalls=0;
const ok=a=>({returnCode:'0000',info:{orderId:a.id,status:'COMPLETE',transactionId:'2019010112345678911',payInfo:[{amount:240}]}});
const pos=lp.createService({pool,env,uid:p=>p+(++n),...hooks,api:{pay:async a=>{posCalls++;return ok(a);},check:async a=>ok(a)},finish:async(...args)=>{const out=await hooks.finish(...args);if(breakFinish){breakFinish=false;throw Error('synthetic failure after settlement writes');}return out;}});
const pa=await pos.prepare('ts_pos',{brands:['CAFE']},{operator_id:'op_test',amount:1});assert.equal(pa.amount,240);
await assert.rejects(pos.pay('ts_pos',{brands:['CAFE']},{attempt_id:pa.id,oneTimeKey:'123456789012345678'}),/synthetic failure/);
assert.equal((await db.query('SELECT state FROM linepay_payments WHERE id=$1',[pa.id])).rows[0].state,'unknown');
assert.equal((await db.query("SELECT count(*)::int AS n FROM table_orders WHERE session_id='ts_pos'")).rows[0].n,0);
const settled=await pos.check('ts_pos',{brands:['CAFE']},{attempt_id:pa.id});assert.equal(settled.state,'settled');assert.equal(settled.result.closed,true);
assert.equal((await db.query("SELECT status FROM table_sessions WHERE id='ts_pos'")).rows[0].status,'closed');
const po=(await db.query("SELECT * FROM table_orders WHERE session_id='ts_pos'")).rows;assert.equal(po.length,1);assert.equal(po[0].amount,240);assert.equal(po[0].payer.linepay_transaction,'2019010112345678911');assert.equal(po[0].status,'done');assert.equal(posCalls,1);
await db.close();
console.log('PASS PostgreSQL schema, session freeze, active uniqueness, timeout recovery, production POS quote+settlement SQL, rollback after writes, single-charge recovery, lossless ID, manual-refund protection; provider calls synthetic only.');
