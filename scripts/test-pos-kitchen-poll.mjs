import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('poll is read-only and does not backfill pre-release orders as new kitchen jobs',async()=>{
 const queries=[];let handler;
 const ctx={app:{get:(p,...f)=>handler=f.at(-1)},auth:0,adminOnly:0,requireDb:0,wrap:f=>f,
 tableOrders:{visibleVenues:()=>['CAFE'],orderOwnedByVenues:()=>true},
 kitchenPrint:{enqueue:()=>{throw Error('must not create jobs from old orders during poll');}},
 q:async(sql)=>{queries.push(sql);assert.match(sql,/^SELECT job FROM pos_kitchen_print_jobs/);return {rows:[{job:{id:'tk_new',items:[]}}]};}};
 const start=source.indexOf("app.get('/api/admin/orders/kitchen-print-jobs'");
 vm.runInNewContext(source.slice(start,source.indexOf('\n}));',start)+6),ctx);
 let out;await handler({query:{},auth:{}},{json:r=>out=r});
 assert.equal(queries.length,1);assert.equal(out.jobs[0].id,'tk_new');
});
