import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), tableOrders=require('../lib/table-orders.js');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=server.indexOf("app.post('/api/admin/orders/sessions/:id/checkout'");
const source=server.slice(start,server.indexOf("app.post('/api/admin/orders/:id/invoice/issue'",start));
async function checkout({table='A1',partial=false,mixed=false,reject=false}={}){
  let handler;const calls=[],session={id:'ts_1234567890',table_no:table,status:'open',items:[{line:'one',venue:'CAFE',price:100,qty:1},{line:'two',venue:mixed?'BAR':'CAFE',price:0,qty:1}]};
  const client={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM table_sessions'))return {rows:[session]};return {rows:[]};},release(){}};
  const orders={...tableOrders,posCheckout(items){if(reject)throw Object.assign(Error('rejected'),{status:400});return {lines:partial||mixed?[items[0]]:items,amount:100,subtotal:100,payer:{method:'cash'}};},menuIndex(){return new Map();}};
  vm.runInNewContext(source,{app:{post(...args){handler=args.at(-1);}},auth:0,adminOnly:0,requireDb:0,wrap:fn=>fn,ORDER_ID_RE:/^ts_/,tableOrders:orders,kitchenPrint:require('../lib/pos-kitchen-print'),contentValue:async()=>'',stockConsume:async()=>{},resolveOperator:async()=>null,pool:{connect:async()=>client},activePaymentCodes:async()=>[],actorOf:()=> 'staff',posRegister:{checkoutAllowed:()=>({})},registersOpenMap:async()=>({}),ezpayInvoice:{invoiceForm:()=>({})},uid:()=> 'to_1234567890',storeInvoiceResult:async()=>({}),inventoryConsume:async()=>0});
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
  await handler({params:{id:session.id},body:{},auth:{brands:['CAFE']}},res);
  return {calls,res};
}
test('fully settled dine-in closes atomically and finishes outstanding paid orders',async()=>{
  const {calls,res}=await checkout();
  assert.equal(res.body.closed,true);
  const close=calls.findIndex(c=>c.sql.includes("status=$3")&&c.args?.[2]==='closed');
  assert.ok(close>0);assert.ok(close<calls.findIndex(c=>c.sql==='COMMIT'));
  assert.ok(calls.some(c=>c.sql.includes("UPDATE table_orders SET status='done'")));
});
for(const [name,opts] of [['split bill',{partial:true}],['mixed brand',{mixed:true}],['takeout',{table:'W01'}]])test(name+' does not auto-clear',async()=>{
  const {calls,res}=await checkout(opts);assert.equal(res.body.closed,false);
  assert.ok(!calls.some(c=>c.sql.includes("UPDATE table_orders SET status='done'")));
});
test('failed payment never closes the session',async()=>{
  const {calls,res}=await checkout({reject:true});assert.equal(res.statusCode,400);
  assert.ok(calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')));
});
