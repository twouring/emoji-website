import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),kitchenPrint=require('../lib/pos-kitchen-print'),tableOrders=require('../lib/table-orders');
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function db(){
 const rows=new Map();let failed=false;
 const query=async(sql,p)=>{
  if(failed)throw Error('database unavailable');
  if(sql.startsWith('INSERT')){if(!rows.has(p[0]))rows.set(p[0],{job:JSON.parse(p[1]),claimed:false});return {rows:[]};}
  const row=rows.get(p[0]);
  if(sql.includes('FROM table_sessions'))return {rows:[...rows.values()].map(r=>({id:'ts_test',table_no:r.job.table_no,items:r.job.items}))};
  if(sql.startsWith('SELECT'))return {rows:row?[{job:row.job}]:[]};
  assert.match(sql,/claimed_at IS NULL/);
  if(!row||row.claimed)return {rows:[]};row.claimed=true;row.actor=p[1];row.operator=p[2];return {rows:[{job:row.job}]};
 };
 return {rows,query,fail:()=>failed=true};
}
const sample={id:'ts_test',table_no:'A1',items:[{ticket:'tk_test',line:'a',zh:'咖啡',qty:1,price:100,venue:'CAFE'}]};
test('real enqueue and atomic claim: simultaneous tablets, reload and paid representation print exactly once',async()=>{
 const d=db();await kitchenPrint.enqueue(d.query,[sample]);
 await kitchenPrint.enqueue(d.query,[{...sample,id:'to_payment',session_id:'ts_test',items:sample.items}]);assert.equal(d.rows.size,1);
 const claims=await Promise.all([kitchenPrint.claim(d.query,'tk_test',['CAFE'],'a','s1'),kitchenPrint.claim(d.query,'tk_test',['CAFE'],'b','s2')]);
 assert.equal(claims.filter(c=>c.claimed).length,1);
 assert.equal((await kitchenPrint.claim(d.query,'tk_test',null,'reload')).claimed,false);
 assert.equal(d.rows.get('tk_test').actor,'a');assert.equal(d.rows.get('tk_test').operator,'s1');
});
test('ownership, missing jobs and DB failure never grant a print',async()=>{
 const d=db();await kitchenPrint.enqueue(d.query,[sample]);
 assert.equal(await kitchenPrint.claim(d.query,'tk_test',['BAR'],'other'),null);
 assert.equal(await kitchenPrint.claim(d.query,'tk_missing',null,'a'),null);
 assert.equal(d.rows.get('tk_test').claimed,false);
 d.fail();await assert.rejects(kitchenPrint.claim(d.query,'tk_test',null,'a'),/database unavailable/);
});
test('actual admin middleware admits CAFE/BAR print and submit endpoints, not SPACE',()=>{
 const ctx={};vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('const FOOD_API ='),source.indexOf('async function eventEditor(')),ctx);
 for(const brand of ['CAFE','BAR','SPACE'])for(const path of ['/api/admin/orders/kitchen-print-jobs','/api/admin/orders/kitchen-print-jobs/tk_test/claim','/api/admin/orders/sessions/ts_test/place']){
  const res={code:200,status(n){this.code=n;return this;},json(){}};let next=false;
  ctx.adminOnly({path,auth:{role:'admin',brands:[brand]}},res,()=>next=true);
  assert.equal(next,brand!=='SPACE');assert.equal(res.code,brand==='SPACE'?403:200);
 }
});
test('actual claim route validates IDs and operator, uses authenticated ownership and records actor',async()=>{
 const d=db();await kitchenPrint.enqueue(d.query,[sample]);const routes=new Map();
 const ctx={app:{post:(p,...f)=>routes.set(p,f)},auth(){},adminOnly(){},requireDb(){},wrap:f=>f,q:d.query,kitchenPrint,tableOrders,actorOf:a=>a.email,resolveOperator:async(req,id)=>id==='ok'?{id}:null};
 const route='/api/admin/orders/kitchen-print-jobs/:id/claim',start=source.indexOf(`app.post('${route}'`),end=source.indexOf('\n}));',start)+6;
 vm.runInNewContext(source.slice(start,end),ctx);
 async function call(id,brands=null,operator_id){const res={code:200,status(n){this.code=n;return this;},json(o){this.body=o;return this;}};await routes.get(route).at(-1)({params:{id},body:{operator_id},auth:{email:'test@example.test',brands}},res);return res;}
 assert.equal((await call('../bad')).code,404);assert.equal((await call('tk_test',['BAR'])).code,404);
 assert.equal((await call('tk_test',null,'bad')).code,400);
 assert.equal((await call('tk_test',['CAFE'],'ok')).body.claimed,true);
 assert.equal((await call('tk_test',['CAFE'])).body.claimed,false);
 assert.equal(d.rows.get('tk_test').actor,'test@example.test');
});
test('POS checkout never creates kitchen print jobs, even for unsubmitted counter items',()=>{
 const start=source.indexOf("app.post('/api/admin/orders/sessions/:id/checkout'");
 assert.doesNotMatch(source.slice(start,source.indexOf('\n}));',start)),/kitchenPrint.enqueue/);
});
test('every submit/payment path enqueues in its existing DB transaction and both hosts start independent polling',()=>{
 const mutate=source.slice(source.indexOf('async function mutateItems('),source.indexOf("app.post('/api/orders/:id/items'"));
 assert.ok(mutate.indexOf('kitchenPrint.enqueue')<mutate.indexOf("query('COMMIT')"));
 for(const route of ['/api/orders/:id/pay']){
  const start=source.indexOf(`app.post('${route}'`);assert.ok(start>=0,route);
  const body=source.slice(start,source.indexOf('\n}));',start));assert.match(body,/kitchenPrint.enqueue/);assert.ok(body.indexOf('kitchenPrint.enqueue')<body.lastIndexOf("query('COMMIT')"));
 }
 for(const f of ['pos.html','admin.html'])assert.match(readFileSync(new URL('../public/'+f,import.meta.url),'utf8'),/startKitchenPrinting\(\)/);
});

test('帳本夾整桌累計：含已結品項、排除取消與預收抵扣、外帶不算', () => {
 const items=[{zh:'義麵',qty:1,price:298,venue:'BAR'},{zh:'茶',qty:2,price:160,venue:'BAR',order_id:'to_1'},{zh:'取消',qty:1,price:500,venue:'BAR',cancelled:true},{zh:'已預收',qty:1,price:-100,venue:'BAR',credit_of:''}];
 const t=kitchenPrint.tableTotal({table_no:'B1',items,party_votes:{}},Date.parse('2026-11-02T12:00:00Z'));
 assert.equal(t.amount,618);assert.equal(t.service,62);assert.equal(t.total,680);assert.equal(t.count,3);
 assert.equal(kitchenPrint.tableTotal({table_no:'W01',items}),null);
 assert.equal(kitchenPrint.tableTotal(null),null);
});
