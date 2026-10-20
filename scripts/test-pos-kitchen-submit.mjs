import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),tableOrders=require('../lib/table-orders'),kitchen=require('../lib/pos-kitchen-print');
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('real mutateItems only enqueues new submission tickets, not pre-release or edited old tickets',async()=>{
 const session={id:'ts_test',table_no:'A1',status:'open',items:[{line:'old',ticket:'tk_legacy',placed_at:'2026-10-01',venue:'CAFE',price:100,qty:1},{line:'new',venue:'CAFE',price:100,qty:1}]};
 const enqueued=[],events=[];
 const client={release(){},query:async(sql)=>{events.push(sql);return {rows:sql.startsWith('SELECT')?[session]:[]};}};
 const c=vm.createContext({pool:{connect:async()=>client},loadSession:async()=>session,publicSession:s=>s,refundAppRedeems:async()=>{},kitchenPrint:{enqueue:async(q,s)=>enqueued.push(...kitchen.jobsOf(s))},inventoryConsume:async()=>0,inventoryRestore:async()=>0,stockConsume:async()=>{},stockRestore:async()=>{},tableOrders:require('../lib/table-orders.js'),contentValue:async()=>'',posInventory:require('../lib/pos-inventory'),actorOf:()=>''});
 vm.runInContext(source.slice(source.indexOf('async function mutateItems('),source.indexOf("app.post('/api/orders/:id/items'")),c);
 await c.mutateItems({params:{id:session.id},body:{}},{json(){}},items=>tableOrders.placeLines(items).items);
 assert.equal(enqueued.length,1);assert.notEqual(enqueued[0].id,'tk_legacy');assert.equal(enqueued[0].items[0].line,'new');
 assert.ok(events.includes('COMMIT'));
});
