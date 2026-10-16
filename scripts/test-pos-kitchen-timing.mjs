import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
test('counter additions after submission create a new unsent line instead of changing an already printed ticket',()=>{
 const orders=require('../lib/table-orders');
 const menu=new Map([['coffee',{id:'coffee',price:100,zh:'咖啡',venue:'CAFE'}]]);
 const first=orders.posAddLine([],menu,{item_id:'coffee',qty:1});
 const placed=orders.placeLines(first).items;
 const next=orders.posAddLine(placed,menu,{item_id:'coffee',qty:1});
 assert.equal(next.length,2);assert.equal(next[0].qty,1);assert.equal(next[1].placed_at,undefined);
});
test('mixed-brand submission creates separate claimable jobs for each locked POS brand',()=>{
 const {jobsOf}=require('../lib/pos-kitchen-print');
 const jobs=jobsOf([{id:'ts_mix',table_no:'A1',items:[{line:'a',ticket:'tk_mix',venue:'CAFE',qty:1,price:100},{line:'b',ticket:'tk_mix',venue:'BAR',qty:1,price:200}]}]);
 assert.equal(jobs.length,2);assert.equal(new Set(jobs.map(j=>j.id)).size,2);
 assert.ok(jobs.every(j=>new Set(j.items.map(l=>l.venue)).size===1));
});
test('submission jobs survive payment representation, split payment and merge without duplicate lines',()=>{
 const {jobsOf}=require('../lib/pos-kitchen-print');
 const a={line:'a',ticket:'tk_one',placed_at:'2026-10-15',zh:'咖啡',qty:1,price:100,venue:'CAFE'};
 const b={...a,line:'b',zh:'茶'};
 const sources=[{id:'ts_1',table_no:'A1',items:[a,b]}, {id:'to_1',session_id:'ts_1',table_no:'A1',items:[{...a,order_id:'to_1'}]}];
 const jobs=jobsOf(sources);assert.equal(jobs.length,1);assert.equal(jobs[0].id,'tk_one');assert.equal(jobs[0].items.length,2);
 assert.equal(jobsOf([{...sources[1],status:'void'}]).length,0);
 assert.equal(jobsOf([{id:'ts_1',items:[{...a,ticket:null,placed_at:null}]}]).length,0);
 assert.equal(jobsOf([{...sources[1],items:[{...a,ticket:null}]}])[0].id,'to_1');
});
const src=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
function browser({ready=true,fail=false}={}){
 const db=new Set(),calls=[],messages=[];
 const c=vm.createContext({console,setTimeout:()=>1,clearTimeout(){},DATA:{},OPERATOR:{id:'s1'},SCOPE:'',navigator:{userAgent:ready?'StarWebPRNTBrowser':'Safari'},toast:s=>messages.push(s),api:async(path,opt)=>{
  calls.push(path);if(!opt)return {jobs:[{id:'tk_one',items:[]}]};
  if(db.has(path))return {claimed:false};db.add(path);return {claimed:true,job:{id:'tk_one',items:[]}};
 }});
 vm.runInContext(src,c);vm.runInContext('StarWebPrintBuilder=function(){};StarWebPrintTrader=function(){};',c);
 c.prints=[];c.fail=fail;vm.runInContext('printOrder=async o=>{prints.push(o.id);if(fail)throw Error("timeout");return true;}',c);
 return {c,db,calls,messages};
}
test('printer first load catches pending job on every tab, reload uses server claim',async()=>{
 const {c,calls}=browser();await vm.runInContext('pollKitchenPrinting()',c);await vm.runInContext('pollKitchenPrinting()',c);
 assert.deepEqual([...c.prints],['tk_one']);assert.ok(calls.includes('/admin/orders/kitchen-print-jobs'));
});
test('printer failure stops claiming later tickets until explicit operator resume',async()=>{
 const {c,calls}=browser({fail:true});
 c.api=async(path,opt)=>{calls.push(path);if(!opt)return {jobs:[{id:'tk_one'},{id:'tk_two'}]};return {claimed:true,job:{id:path.includes('tk_one')?'tk_one':'tk_two'}};};
 await vm.runInContext('pollKitchenPrinting()',c);await vm.runInContext('pollKitchenPrinting()',c);
 assert.equal(calls.filter(p=>p.includes('/claim')).length,1);
 vm.runInContext('fail=false;confirm=()=>true;resumeKitchenPrinting();',c);await vm.runInContext('pollKitchenPrinting()',c);
 assert.deepEqual([...c.prints],['tk_one','tk_two']);
});
test('resume control is hidden unless paused and requires explicit confirmation',()=>{
 assert.match(src,/if\(st==='paused'\)return `[^`]*id="pos-print-resume"[^`]*`;/);assert.doesNotMatch(src.replace(/if\(st==='paused'\)return `[^`]*`;/,''),/pos-print-resume"/);
 const {c}=browser();vm.runInContext('KITCHEN_PRINT_PAUSED=true;confirm=()=>false;',c);
 vm.runInContext('resumeKitchenPrinting()',c);assert.equal(vm.runInContext('KITCHEN_PRINT_PAUSED',c),true);
 vm.runInContext('confirm=()=>true;resumeKitchenPrinting()',c);assert.equal(vm.runInContext('KITCHEN_PRINT_PAUSED',c),false);
});
test('checkout page shows a running/paused/unavailable auto-print status label',()=>{
 assert.match(src,/\$\{kitchenPrintStatusHtml\(\)\}/);
 const {c}=browser();
 assert.equal(vm.runInContext('kitchenPrintStatus().state',c),'running');assert.match(vm.runInContext('kitchenPrintStatusHtml()',c),/自動出單運行中/);
 vm.runInContext('KITCHEN_PRINT_PAUSED=true',c);assert.equal(vm.runInContext('kitchenPrintStatus().state',c),'paused');assert.match(vm.runInContext('kitchenPrintStatusHtml()',c),/id="pos-print-resume"/);
 const off=browser({ready:false}).c;assert.equal(vm.runInContext('kitchenPrintStatus().state',off),'unavailable');assert.match(vm.runInContext('kitchenPrintStatusHtml()',off),/未自動出單/);assert.doesNotMatch(vm.runInContext('kitchenPrintStatusHtml()',off),/pos-print-resume/);
});
test('ordinary browser never consumes a printer claim',async()=>{
 const {c,calls}=browser({ready:false});await vm.runInContext('pollKitchenPrinting()',c);assert.equal(calls.length,0);
});
test('claim transport ambiguity never automatically retries in the same browser; other jobs remain pending',async()=>{
 const {c,calls,messages}=browser();
 c.api=async(path,opt)=>{calls.push(path);if(!opt)return {jobs:[{id:'tk_one'},{id:'tk_two'}]};throw Error('lost response');};
 await vm.runInContext('pollKitchenPrinting()',c);await vm.runInContext('pollKitchenPrinting()',c);
 assert.equal(calls.filter(p=>p.includes('tk_one/claim')).length,1);assert.equal(c.prints.length,0);assert.ok(messages.some(m=>m.includes('lost response')));
});
test('SDK false outcome is not silently successful and native quarantine consumes no more claims',async()=>{
 const {c,calls,messages}=browser();vm.runInContext('printOrder=async()=>false;',c);
 await vm.runInContext('pollKitchenPrinting()',c);assert.ok(messages.some(m=>m.includes('未確認')));
 const before=calls.length;vm.runInContext('STAR_NATIVE_UNCERTAIN={};',c);await vm.runInContext('pollKitchenPrinting()',c);assert.equal(calls.length,before);
});
test('ambiguous hardware failure is claimed once and warns to manually inspect, no automatic retry',async()=>{
 const {c,messages}=browser({fail:true});await vm.runInContext('pollKitchenPrinting()',c);await vm.runInContext('pollKitchenPrinting()',c);
 assert.equal(c.prints.length,1);assert.ok(messages.some(m=>m.includes('補印')));
});
