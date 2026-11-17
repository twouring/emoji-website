// POS 作廢／取消品項的線上刷卡自動退款（KK 11/17）：實跑 server.js 的兩支作廢路由，TapPay／Stripe 全部是假的
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tableOrders=require('../lib/table-orders');
const onlineRefund=require('../lib/online-refund');
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const ops=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const base=extra=>({id:'to_1234567890abcdef',session_id:'ts_1234567890abcdef',table_no:'S1',amount:300,status:'paid',paid_at:new Date().toISOString(),payer:{},invoice:{},tappay:{},items:[{line:'a',price:200,qty:1,venue:'STAY'},{line:'b',price:100,qty:1,venue:'STAY'}],...extra});
const stripeOrder=()=>base({payer:{method:'stripe',online:true,card_qr:true,stripe_session:'cs_1',payment_intent:'pi_1'}});
const tappayOrder=()=>base({tappay:{rec_trade_id:'D2026111700001'},payer:{name:'客人'}});

function harness(o,{stripeFail=false,tappayFail=false,invoiceFail=false}={}){
 const routes=new Map(),sql=[],refunds=[],tapCalls=[];
 const stripe={refunds:{create:async(body,opt)=>{if(stripeFail)throw Error('card_declined');refunds.push({body,opt});return {id:'re_'+refunds.length,amount:body.amount??o.amount*100,status:'succeeded'};}}};
 const fetcher=async(url,init)=>{tapCalls.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>tappayFail?{status:88,msg:'refund fail'}:{status:0,refund_id:'TR1',refund_amount:JSON.parse(init.body).amount??o.amount}};};
 const lib={...onlineRefund,refundOrder:(ord,opt)=>onlineRefund.refundOrder(ord,{...opt,fetcher}),refundPart:(ord,a,k,opt)=>onlineRefund.refundPart(ord,a,k,{...opt,fetcher})};
 const client={async query(s,p=[]){sql.push({s,p});
  if(s.includes('FROM table_orders')&&s.startsWith('SELECT session_id'))return {rows:[{session_id:o.session_id}]};
  if(s.includes('FROM table_orders'))return {rows:[structuredClone(o)]};
  if(s.includes('FROM table_sessions'))return {rows:[{id:o.session_id,items:o.items.map(l=>({...l,order_id:o.id})),status:'closed',table_no:o.table_no}]};
  if(s.includes('FROM linepay_payments'))return {rows:[]};
  if(s.includes("SET status='void'")){o.status='void';o.payer=JSON.parse(p[4]);}
  if(s.includes('UPDATE table_orders SET items')){o.items=JSON.parse(p[1]);o.amount=p[2];o.payer=JSON.parse(p[3]);}
  if(s.includes('UPDATE table_orders SET payer=COALESCE')){o.payer={...o.payer,...JSON.parse(p[1])};}
  return {rows:[]};},release(){}};
 const ctx={app:{post:(path,...h)=>routes.set(path,h.at(-1))},auth:0,adminOnly:0,requireDb:0,wrap:f=>f,ORDER_ID_RE:/^to_/,pool:{connect:async()=>client},tableOrders:{...tableOrders,tappayConfig:()=>({partnerKey:'pk',merchantId:'m',mode:'sandbox'})},onlineRefund:lib,stripe,actorOf:()=> 'tester',reverseYanForOrder:async()=>{},
  ezpayInvoice:{config:()=>({}),searchInvoice:async(c,x,i)=>i,invalidInvoice:async(c,x,i)=>{if(invoiceFail)throw Object.assign(Error('ezPay 暫停'),{status:502});return {...i,status:'void'};}}};
 for(const route of ['/api/admin/orders/:id/void','/api/admin/orders/:id/items/:line/void']){const st=source.indexOf(`app.post('${route}'`);vm.runInNewContext(source.slice(st,source.indexOf('\n}));',st)+6),ctx);}
 const call=async(route,params,body={reason:'客人取消'})=>{const res={code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;}};await routes.get(route)({params,body,auth:{brands:null}},res);return res;};
 return {o,sql,refunds,tapCalls,voidAll:()=>call('/api/admin/orders/:id/void',{id:o.id}),voidLine:line=>call('/api/admin/orders/:id/items/:line/void',{id:o.id,line})};
}

test('Stripe（櫃檯線上刷卡 QR）作廢：先全額退款、再作廢，退款紀錄寫進 payer',async()=>{
 const h=harness(stripeOrder());const r=await h.voidAll();
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(h.o.status,'void');
 assert.equal(h.refunds.length,1);assert.equal(h.refunds[0].body.payment_intent,'pi_1');assert.equal(h.refunds[0].body.amount,undefined,'沒取消過品項＝全額退');
 assert.equal(h.refunds[0].opt.idempotencyKey,'pos-void-'+h.o.id);
 assert.equal(r.body.online_refund.provider,'stripe');assert.equal(r.body.online_refund.amount,300);assert.equal(h.o.payer.online_refund.refund_id,'re_1');
});
test('TapPay（桌邊線上刷卡）作廢：打 TapPay Refund API 全額退',async()=>{
 const h=harness(tappayOrder());const r=await h.voidAll();
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(h.o.status,'void');
 assert.equal(h.tapCalls.length,1);assert.match(h.tapCalls[0].url,/sandbox\.tappaysdk\.com\/tpc\/transaction\/refund$/);
 assert.equal(h.tapCalls[0].body.rec_trade_id,'D2026111700001');assert.equal(h.tapCalls[0].body.amount,undefined);assert.match(h.tapCalls[0].body.bank_refund_id,/^[A-Za-z0-9]{1,20}$/);
 assert.equal(h.o.payer.online_refund.provider,'tappay');
});
test('退款失敗：不作廢、回錯誤，帳不動',async()=>{
 for(const [o,opt] of [[stripeOrder(),{stripeFail:true}],[tappayOrder(),{tappayFail:true}]]){
  const h=harness(o,opt);const r=await h.voidAll();
  assert.equal(r.code,502);assert.match(r.body.error,/退款失敗.*單據未作廢/);assert.equal(h.o.status,'paid');
  assert.ok(!h.sql.some(x=>x.s.includes("SET status='void'")));
 }
});
test('已退款但發票作廢失敗：先存退款紀錄，重按作廢不會再退一次',async()=>{
 const o=stripeOrder();o.invoice={status:'issued',number:'AB12345678'};
 const h=harness(o,{invoiceFail:true});let r=await h.voidAll();
 assert.equal(r.code,502);assert.match(r.body.error,/已退款，請重新按作廢/);assert.equal(h.o.status,'paid');assert.ok(h.o.payer.online_refund);
 const h2=harness(h.o);r=await h2.voidAll();
 assert.equal(r.code,200);assert.equal(h2.o.status,'void');assert.equal(h2.refunds.length,0,'第二次不再退款');assert.equal(r.body.online_refund.refund_id,'re_1');
});
test('現金單作廢：不碰任何金流',async()=>{
 const h=harness(base({payer:{method:'cash'}}));const r=await h.voidAll();
 assert.equal(r.code,200);assert.equal(h.refunds.length+h.tapCalls.length,0);assert.equal(r.body.online_refund,null);
});
test('取消單一品項：Stripe／TapPay 自動部分退款該項金額；之後整張作廢只退剩下的',async()=>{
 const h=harness(stripeOrder());let r=await h.voidLine('b');
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.refund,100);assert.equal(h.refunds[0].body.amount,10000);assert.equal(h.o.amount,200);
 assert.equal(r.body.online_refund.amount,100);assert.ok(h.o.payer.online_refunds[`line-${h.o.id}-b`]);
 const h2=harness(h.o);r=await h2.voidAll();
 assert.equal(r.code,200);assert.equal(h2.refunds[0].body.amount,20000,'已部分退款＝只退剩下 200');
 const t=harness(tappayOrder());r=await t.voidLine('b');
 assert.equal(r.code,200);assert.equal(t.tapCalls[0].body.amount,100);
});
test('取消品項退款失敗：品項不取消',async()=>{
 const h=harness(stripeOrder(),{stripeFail:true});const r=await h.voidLine('b');
 assert.equal(r.code,502);assert.match(r.body.error,/品項未取消/);assert.equal(h.o.amount,300);
});
test('lib：Stripe 單缺 payment_intent 擋下；非線上刷卡回 null',()=>{
 assert.throws(()=>onlineRefund.target({payer:{method:'stripe'}}),/付款編號/);
 assert.equal(onlineRefund.target({payer:{method:'cash'}}),null);
 assert.equal(onlineRefund.tappayRefundId('void-to_x').length,20);
});
test('POS：線上刷卡單作廢／取消品項先確認會退款，成功訊息帶退款金額',()=>{
 assert.match(ops,/const onlineCardOf=o=>o\?\.tappay\?\.rec_trade_id\?'TapPay ':o\?\.payer\?\.method==='stripe'\?'Stripe ':''/);
 assert.match(ops,/作廢會自動退款 NT\$\$\{num\(order\.amount\)\} 到客人的卡/);
 assert.match(ops,/會自動退這項的金額到客人的卡/);
 assert.match(ops,/return onlineRefundText\(out\.online_refund\)\+\(out\.reopened\?/);
});
