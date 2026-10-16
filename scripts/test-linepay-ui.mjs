import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
function context(){const calls=[],messages=[],printed=[],c=vm.createContext({console,setTimeout,clearTimeout,esc:String,num:String,document:{},toast:s=>messages.push(s),api:async(path,options)=>{calls.push({path,...options});if(path.endsWith('/prepare'))return {id:'lp_test',state:'prepared',amount:240,mode:'production'};return {id:'lp_test',state:'settled',amount:240,order:{id:'to_test'},result:{order_id:'to_test'}};}});vm.runInContext(source,c);vm.runInContext("OPERATOR={id:'op'};invoiceBody=()=>({mode:'paper'});pickLinepayCode=async()=> '123456789012345678';posConfirm=async()=>true;loadPos=async()=>{}",c);c.printCheckoutOrder=async o=>printed.push(o);return {c,calls,messages,printed};}
test('new payment entry is visibly disabled with blocking, existing manual LINE Pay path remains separate',()=>{
 const {c}=context();assert.equal(typeof c.linepayPanelHtml,'function');
 const html=c.linepayPanelHtml({id:'ts_test'}, {enabled:false,blockers:['缺少付款 API 憑證']});
 assert.match(html,/disabled/);assert.match(html,/缺少付款 API 憑證/);assert.match(html,/API/);
 assert.match(source,/id="pos-checkout"/);
});
test('explicit API action prepares server quote then charges once and prints persisted order',async()=>{
 const {c,calls,printed}=context();
 await c.linepayCheckout({id:'ts_test',table:'A1'},{});
 assert.deepEqual(calls.map(x=>x.path),['/admin/orders/sessions/ts_test/linepay/prepare','/admin/orders/sessions/ts_test/linepay/pay']);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].body)),{operator_id:'op',invoice:{mode:'paper'}});
 assert.deepEqual(JSON.parse(JSON.stringify(calls[1].body)),{attempt_id:'lp_test',oneTimeKey:'123456789012345678'});
 assert.equal(printed.length,1);
});
test('unknown result entry only queries original intent and never scans or charges',async()=>{
 const {c,calls}=context();vm.runInContext("pickLinepayCode=()=>{throw Error('must not scan again')}",c);
 await c.linepayCheckout({id:'ts_test',table:'A1',linepay:{id:'lp_test',state:'unknown'}},{});
 assert.deepEqual(calls.map(x=>x.path),['/admin/orders/sessions/ts_test/linepay/check']);
});
test('cancelling scan cancels only prepared intent; never sends a charge',async()=>{
 const {c,calls}=context();vm.runInContext('pickLinepayCode=async()=>null',c);
 await c.linepayCheckout({id:'ts_test',table:'A1'},{});
 assert.deepEqual(calls.map(x=>x.path),['/admin/orders/sessions/ts_test/linepay/prepare','/admin/orders/sessions/ts_test/linepay/cancel']);
});
