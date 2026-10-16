import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
test('actual paintPos closure retains computed item prices for checkout printing',async()=>{
 const nodes=new Map(),printed=[],errors=[];
 const host={dataset:{},querySelector(s){if(!nodes.has(s))nodes.set(s,{value:'',disabled:false,querySelector(){return null;},querySelectorAll(){return [];}});return nodes.get(s);},querySelectorAll(){return [];}};
 const c=vm.createContext({console,setTimeout,clearTimeout,cancelAnimationFrame(){},document:{getElementById:id=>id==='pos-body'?host:null},esc:String,num:String,applicationTime:String,DATA:{payment_methods:[]},SCOPE:'CAFE',BRAND_LABEL:{CAFE:'在咖啡'},MENU_DOC:{items:[]},MenuLib:{sortItems:x=>x},OPERATOR:{id:'op'},opsHref:x=>x,ensureOperator:fn=>fn(),confirm:()=>true,toast:x=>errors.push(x)});
 vm.runInContext(src,c);
 vm.runInContext(`POS_DATA={sessions:[{id:'ts_test',table:'A1',state:'ordered',lines:[{line:'a',zh:'咖啡',qty:1,price:100}]}],orders:[]};POS_TABLE='A1';
 posTotals=()=>({picked:POS_DATA.sessions[0].lines,priceOf:()=>80,subtotal:80,total:80,discount:0,regular:100});
 bindRegisterBar=()=>{};ensureOperator=fn=>fn();updateInvoiceFields=()=>{};invoiceBody=()=>({mode:''});autoCashDrawer=async()=>null;loadPos=async()=>{};`,c);
 c.api=async()=>({order_id:'to_test',amount:80});c.printCheckoutOrder=async o=>printed.push(o);
 vm.runInContext('paintPos()',c);await nodes.get('#pos-checkout').onclick();
 assert.equal(printed.length,1,errors.join('; '));assert.equal(printed[0].items[0].price,80);
});
