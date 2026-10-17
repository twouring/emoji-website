import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),T=require('../lib/table-orders');
const row=(id,day,venue='CAFE',payer={})=>({id,paid_at:new Date(day),status:'paid',table_no:'A1',amount:100,payer,items:[{item_id:'i',zh:'茶',venue,qty:1,price:100,guest:'g'}]});
test('analytics filters business-day range, void and venue; pg Dates and first member visit',()=>{
 const rows=[row('1','2026-10-15T18:00:00Z','CAFE',{member_id:'old'}),row('2','2026-10-16T04:00:00Z','CAFE',{member_id:'new'}),row('3','2026-10-16T04:00:00Z','BAR'),row('4','2026-10-17T04:00:00Z'),{...row('5','2026-10-16T04:00:00Z'),status:'void'}];
 const d=T.analyticsSummary(rows,{from:'2026-10-16',to:'2026-10-16',venues:['CAFE'],firstPaid:{old:new Date('2026-10-01T04:00Z'),new:new Date('2026-10-16T04:00Z')}});
 assert.equal(d.orders,1);assert.equal(d.amount,100);assert.equal(d.qty,1);assert.equal(d.customers.new_members,1);assert.equal(d.customers.qr.orders,1);
});
test('analytics range accepts calendar dates only and defaults to exactly seven business days',()=>{
 const r=T.analyticsRange({},new Date('2026-10-17T04:00:00Z'));
 assert.equal(r.from,'2026-10-11');assert.equal(r.to,'2026-10-17');
 assert.throws(()=>T.analyticsRange({to:'2026-02-30'}),/日期/);
 assert.throws(()=>T.analyticsRange({from:'2026-10-18',to:'2026-10-17'}),/日期/);
 assert.equal(T.analyticsRange({from:'2020-01-01',to:'2026-10-17'}).from,'2026-07-17');
});
test('analytics HTTP handler binds business-day edges and applies brand ownership',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8'),queries=[];let handler,result;
 const ctx={tableOrders:T,Date,Object,String,auth(){},adminOnly(){},requireDb(){},wrap:f=>f,app:{get:(...args)=>handler=args.at(-1)},q:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('GROUP BY 1')?[{mid:'new',at:new Date('2026-10-16T04:00Z')}]:[row('1','2026-10-16T04:00Z','CAFE',{member_id:'new'}),row('2','2026-10-16T04:00Z','BAR')]};}};
 const start=source.indexOf("app.get('/api/admin/analytics'");
 vm.runInNewContext(source.slice(start,source.indexOf('/* 台新手機付日結',start)),ctx);
 await handler({auth:{brands:['CAFE']},query:{from:'2026-10-16',to:'2026-10-16'}},{json:d=>result=d});
 assert.equal(queries[0].args[0].toISOString(),'2026-10-15T19:00:00.000Z');assert.equal(queries[0].args[1].toISOString(),'2026-10-16T19:00:00.000Z');assert.equal(result.orders,1);assert.equal(result.customers.new_members,1);
});
test('analytics route returns HTTP 400 for invalid ranges before querying the database',async()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=require('express')();let queries=0;
 const ctx=vm.createContext({app,tableOrders:T,console:{error(){}},auth:(req,res,next)=>{req.auth={brands:['CAFE']};next();},adminOnly:(req,res,next)=>next(),requireDb:(req,res,next)=>next(),q:async()=>{queries++;throw Error('database unavailable');}});
 const wrapStart=source.indexOf('const wrap = fn =>');
 vm.runInContext(source.slice(wrapStart,source.indexOf("app.post('/api/twilio/events/status'",wrapStart)),ctx);
 const start=source.indexOf("app.get('/api/admin/analytics'");
 vm.runInContext(source.slice(start,source.indexOf('/* 台新手機付日結',start)),ctx);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}/api/admin/analytics`;
  for(const query of [{from:'bad',to:'2026-10-17'},{from:'2026-02-30',to:'2026-10-17'},{from:'2026-10-18',to:'2026-10-17'}]){
   const response=await fetch(base+'?'+new URLSearchParams(query));
   assert.equal(response.status,400);
   let message;try{T.analyticsRange(query);}catch(e){message=e.message;}
   assert.deepEqual(await response.json(),{error:message});
  }
  assert.equal(queries,0);
  const response=await fetch(base+'?from=2026-10-16&to=2026-10-17');
  assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'伺服器處理失敗。'});assert.equal(queries,1);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('brand middleware admits analytics and both tabs have reachable loaders',()=>{
 const s=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const re=vm.runInNewContext(s.match(/const FOOD_API = ([^;]+);/)[1]);assert.equal(re.test('/api/admin/analytics'),true);
 const h=fs.readFileSync(new URL('../public/pos.html',import.meta.url),'utf8'),js=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
 for(const [id,fn] of [['products','Products'],['customers','Customers']]){assert.match(h,new RegExp(id+':tab'+fn));assert.match(h,new RegExp('load'+fn+'\\(\\)'));assert.match(js,new RegExp('function load'+fn+'\\('));}
});
test('sales charts and tables show category labels, never raw cat codes',()=>{
 const js=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
 assert.match(js,/const cats=\(d\.categories\|\|\[\]\)\.slice\(0,8\)\.map\(r=>\[catLabel\(r\.cat\)/);
 assert.match(js,/const catQty=\(d\.categories\|\|\[\]\)\.slice\(0,8\)\.map\(r=>\[catLabel\(r\.cat\)/);
 assert.match(js,/BRAND_LABEL\[i\.venue\]\|\|i\.venue,catLabel\(i\.cat\)/);
 assert.match(js,/\(d\.categories\|\|\[\]\)\.map\(r=>\[catLabel\(r\.cat\),r\.qty/);
 assert.doesNotMatch(js,/\.map\(r=>\[r\.cat,/);
});
