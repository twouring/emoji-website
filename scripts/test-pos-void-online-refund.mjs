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
  entities:require('../lib/entities.js'),invoiceCfg:()=>({}),noInvoiceCfg:()=>'尚未設定 ezPay',
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
 assert.match(ops,/const onlineCardOf=o=>o\?\.tappay\?\.rec_trade_id\?'TapPay ':o\?\.payer\?\.method==='stripe'&&!o\.payer\.stripe_manual\?'Stripe ':''/);
 assert.match(ops,/作廢會自動退款 NT\$\$\{num\(order\.amount\)\} 到客人的卡/);
 assert.match(ops,/會自動退這項的金額到客人的卡/);
 assert.match(ops,/const rf=out\.cash_refund>0\|\|typeof voidRefundInfo!=='function'\?null:voidRefundInfo\(/);
});

test('作廢單一定標示有沒有退款（查單、桌上已結帳列、收據）',()=>{
 const c=vm.createContext({num:n=>String(n),PAY_LABEL:{cash:'現金',ctbc:'信用卡',linepay:'LINE Pay',stripe:'Stripe 線上刷卡'}});
 vm.runInContext(ops.match(/const payMethodLabel=[^\n]+/)[0].replace('const ','var '),c);
 const src=ops.slice(ops.indexOf('const voidRefundInfo='),ops.indexOf('const invoiceHtml=o=>{'));
 vm.runInContext(src.replace('const voidRefundInfo=','var voidRefundInfo=').replace('const voidRefundPill=','var voidRefundPill='),c);
 const f=o=>c.voidRefundInfo({id:'to_1',status:'void',amount:300,...o});
 assert.equal(c.voidRefundInfo({status:'paid'}),null);
 assert.deepEqual({...f({payer:{method:'stripe',online_refund:{provider:'stripe',amount:300}}})},{done:true,text:'已退款 NT$300 到客人的卡（Stripe）'});
 assert.equal(f({tappay:{rec_trade_id:'R'},payer:{online_refund:{provider:'tappay',amount:300}}}).text,'已退款 NT$300 到客人的卡（TapPay）');
 assert.match(f({payer:{method:'stripe'}}).text,/^未退款：線上刷卡/);
 assert.deepEqual({...f({payer:{method:'cash',drawer_refunds:{'refund:to_1':300}}})},{done:true,text:'已退現金 NT$300'});
 assert.equal(f({payer:{method:'cash'}}).done,false);assert.match(f({payer:{method:'cash'}}).text,/只更正帳務，沒有退給客人/);
 assert.match(f({payer:{method:'ctbc'}}).text,/^未退款：信用卡 NT\$300，系統不會自動退/);
 assert.match(f({payer:{payments:[{method:'cash',amount:100},{method:'linepay',amount:200}],drawer_refunds:{'refund:to_1':100}}}).text,/已退現金 NT\$100；LINE Pay NT\$200 未退/);
 assert.match(c.voidRefundPill({id:'to_1',status:'void',amount:300,payer:{method:'cash'}}),/pill-wait">未退款/);
 for(const s of ["return `<span class=\"pill pill-bad\">已作廢</span>${voidRefundPill(o)}`","<b>${esc(voidRefundInfo(o).text)}</b>","spec.push({kind:'left',text:voidRefundInfo(o).text,size:18})","已作廢</span>${voidRefundPill(o)} <span"])assert.ok(ops.includes(s),s);
});

test('登記已完成退款：只限作廢單、自動退過或登記過擋下、金額與方式驗證',()=>{
 const v={id:'to_1',status:'void',amount:300,payer:{method:'ctbc'}};
 const r=onlineRefund.manualRefund(v,{method:'card'},{by:'pos',operator:{name:'小明'}});
 assert.equal(r.amount,300);assert.equal(r.label,'刷卡機退刷');assert.equal(r.operator,'小明');
 assert.equal(onlineRefund.manualRefund(v,{method:'cash',amount:120}).amount,120);
 assert.throws(()=>onlineRefund.manualRefund({...v,status:'paid'},{method:'card'}),/只有作廢單/);
 assert.throws(()=>onlineRefund.manualRefund({...v,payer:{online_refund:{amount:300}}},{method:'card'}),/已自動退款/);
 assert.throws(()=>onlineRefund.manualRefund({...v,payer:{manual_refund:r}},{method:'card'}),/已登記過/);
 assert.throws(()=>onlineRefund.manualRefund(v,{method:'bitcoin'}),/退款方式/);
 assert.throws(()=>onlineRefund.manualRefund(v,{method:'card',amount:301}),/1–300/);
 assert.throws(()=>onlineRefund.manualRefund(v,{method:'other'}),/寫明/);
});
test('登記已完成退款路由：寫 payer.manual_refund、不動金額；非作廢單 409',async()=>{
 const st=source.indexOf("app.post('/api/admin/orders/:id/refund-done'");assert.ok(st>0);
 const run=async(o,body)=>{let handler;const client={async query(s,p=[]){if(s.includes('FROM table_orders'))return {rows:[structuredClone(o)]};if(s.startsWith('UPDATE table_orders SET payer')){o.payer=JSON.parse(p[1]);}return {rows:[]};},release(){}};
  vm.runInNewContext(source.slice(st,source.indexOf('\n}));',st)+6),{app:{post:(p,...h)=>handler=h.at(-1)},auth:0,adminOnly:0,requireDb:0,wrap:f=>f,ORDER_ID_RE:/^to_/,pool:{connect:async()=>client},tableOrders,onlineRefund,posScope:()=>null,resolveOperator:async()=>({id:'st_1',name:'小明'}),actorOf:()=> 'pos:CAFE'});
  const res={code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;}};await handler({params:{id:o.id},body,auth:{}},res);return res;};
 const o={id:'to_1',status:'void',amount:300,payer:{method:'linepay'},items:[{venue:'CAFE'}]};
 let r=await run(o,{method:'linepay',operator_id:'st_1'});
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(o.payer.manual_refund.method,'linepay');assert.equal(o.payer.manual_refund.operator,'小明');assert.equal(o.amount,300);
 r=await run(o,{method:'linepay'});assert.equal(r.code,409);
 r=await run({...o,status:'paid',payer:{}},{method:'card'});assert.equal(r.code,409);
});
test('POS：未退款的作廢單有「已完成退款」鈕，登記後顯示已退款',()=>{
 const c=vm.createContext({num:n=>String(n),esc:String,PAY_LABEL:{cash:'現金',ctbc:'信用卡'}});
 vm.runInContext(ops.match(/const payMethodLabel=[^\n]+/)[0].replace('const ','var '),c);
 const src=ops.slice(ops.indexOf('const voidRefundInfo='),ops.indexOf('const invoiceHtml=o=>{'));
 vm.runInContext(src.replace(/\nconst (\w+)=/g,'\nvar $1=').replace(/^const /,'var '),c);
 const v={id:'to_1',status:'void',amount:300,payer:{method:'ctbc'}};
 assert.match(c.refundDoneBtn(v),/data-refund-done="to_1">已完成退款/);
 const done={...v,payer:{...v.payer,manual_refund:{method:'card',label:'刷卡機退刷',amount:300,operator:'小明'}}};
 assert.equal(c.refundDoneBtn(done),'');assert.equal(c.voidRefundInfo(done).text,'已退款 NT$300（刷卡機退刷；小明 登記）');
 assert.equal(c.refundDoneBtn({...v,payer:{method:'stripe',online_refund:{provider:'stripe',amount:300}}}),'');
 assert.ok(ops.includes("${refundDoneBtn(o)}</div>`;};"),'查單有按鈕');assert.ok(ops.includes("${o.status==='void'?refundDoneBtn(o):"),'桌上已結帳列有按鈕');
 assert.ok(ops.includes("api('/admin/orders/'+o.id+'/refund-done'"));
});
