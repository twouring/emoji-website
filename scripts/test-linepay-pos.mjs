import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),orders=require('../lib/table-orders');
let pos;try{pos=require('../lib/linepay-pos');}catch{}
const s={id:'ts_test',table_no:'A1',status:'open',items:[{line:'a',venue:'CAFE',price:120,qty:2,placed_at:'test'}]};
const deps={tableOrders:orders,contentValue:async()=>'',resolveOperator:async()=>({id:'op_test',name:'測試員'}),activePaymentCodes:async()=>['linepay'],registersOpenMap:async()=>({}),posRegister:{checkoutAllowed:()=>({warning:''})},ezpayInvoice:{invoiceForm:i=>i},actorOf:()=> 'staff'};
test('real POS quote uses saved item prices and authenticated operator; refuses altered options',async()=>{
 assert.ok(pos,'POS integration exists');
 const hooks=pos.createHooks(deps);
 const q=await hooks.quote(s,{brands:['CAFE']},{amount:1,operator_id:'op_test',invoice:{mode:'paper'}},{});
 assert.equal(q.amount,240);assert.equal(q.payer.operator_id,'op_test');assert.equal(q.invoice.mode,'paper');
 for(const body of [{lines:['a']},{member:true},{discount:{type:'amount',value:1}},{payments:[{method:'cash',amount:240}]},{prepay:1},{quantities:{a:1}},{member_id:'someone'}])await assert.rejects(hooks.quote(s,{},body,{}),e=>e.status===400);
 await assert.rejects(pos.createHooks({...deps,resolveOperator:async()=>null}).quote(s,{},{},{}),e=>e.status===400);
 assert.equal(hooks.owned(s,{brands:['BAR']}),false);
});

test('both existing manual checkout and TapPay reject before payment or ledger writes while LINE Pay is unresolved',async()=>{
 const fs=await import('node:fs'),vm=await import('node:vm'),source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const [startText,endText] of [["app.post('/api/admin/orders/sessions/:id/checkout'","app.post('/api/admin/orders/:id/invoice/issue'"],["app.post('/api/orders/:id/pay'","// 取餐通知"]]){
  let handler;const writes=[],client={query:async(sql)=>{if(sql.startsWith('SELECT * FROM table_sessions'))return {rows:[{id:'ts_1234567890',status:'open',items:[]}]};if(sql.includes('FROM linepay_payments'))return {rows:[{id:'lp_test'}]};writes.push(sql);return {rows:[]};},release(){}};
  const start=source.indexOf(startText),snippet=source.slice(start,source.indexOf(endText,start));
  vm.runInNewContext(snippet,{app:{post(...args){handler=args.at(-1);}},auth:0,adminOnly:0,requireDb:0,wrap:f=>f,rateLimit:()=>0,ORDER_ID_RE:/^ts_/,pool:{connect:async()=>client},resolveOperator:async()=>null,contentValue:async()=>'',tableOrders:{...orders,menuIndex:()=>new Map(),tappayConfig:()=>({}),payer:()=>({}),payByPrime:()=>{throw Error('provider must never be contacted');}}});
  const res={status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
  await handler({params:{id:'ts_1234567890'},auth:{brands:['CAFE']},body:{}},res);
  assert.equal(res.code,423);assert.ok(!writes.some(s=>/INSERT|UPDATE/.test(s)));
 }
});
