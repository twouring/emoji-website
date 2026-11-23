// 線上預付入場單退單（KK 11/23）：實跑 server.js 路由，Stripe／DB／ezPay 都是假的
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tableOrders=require('../lib/table-orders');
const spaceRefund=require('../lib/space-refund');
const {autoActivateAt}=require('../lib/entitlements');
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const front=fs.readFileSync(new URL('../public/pos-space.js',import.meta.url),'utf8');

function harness({inAt=null,prepaid=true,entActivated=null,purchased=new Date(),existingRefunds=[],invoiceFail=false,refundRec=null,venue='STAY',brands=null}={}){
 const st={s:{id:'ts_1234567890abcdef',table_no:'E12',status:'open',venue,space:{prepaid,in_at:inAt,member_name:'李家穎'},items:[]},
  o:{id:'to_1234567890abcdef',session_id:'ts_1234567890abcdef',table_no:'E12',amount:200,status:'done',paid_at:new Date().toISOString(),invoice:{status:'issued',number:'HV32728906'},payer:{method:'stripe',stripe_session:'cs_live_x',payment_intent:'pi_x',...(refundRec?{online_refund:refundRec}:{})}},
  ent:venue==='STAY'?{id:'en_1',plan:'day_4h',purchased_at:purchased,activated_at:entActivated,starts_at:null,ends_at:null}:null,
  sql:[],created:[],yan:0,deleted:null,later:[]};
 const stripe={refunds:{list:async()=>({data:existingRefunds}),create:async(b,opt)=>{st.created.push({b,opt});return {id:'re_new',amount:b.amount,status:'succeeded'};}}};
 const client={async query(s,p=[]){st.sql.push(s);
  if(s.startsWith('SELECT * FROM table_sessions'))return {rows:[structuredClone(st.s)]};
  if(s.startsWith('SELECT * FROM table_orders'))return {rows:st.o.status==='void'?[]:[structuredClone(st.o)]};
  if(s.startsWith('SELECT')&&s.includes('FROM entitlements'))return {rows:st.ent?[{...st.ent}]:[]};
  if(s.includes("SET status='void'")){st.o.status='void';st.o.invoice=JSON.parse(p[3]);st.o.payer=JSON.parse(p[4]);}
  if(s.includes("UPDATE table_sessions SET status='closed'"))st.s.status='closed';
  if(s.startsWith('DELETE FROM entitlements')){st.deleted=p[0];}
  return {rows:[]};},release(){}};
 const routes=new Map();
 const ctx={app:{post:(path,...h)=>routes.set(path,h.at(-1))},auth:0,adminOnly:0,requireDb:0,superOrManagerPin:0,wrap:f=>f,ORDER_ID_RE:/^ts_/,pool:{connect:async()=>client},
  q:async(s,p)=>{st.later.push({s,p});return {rows:[]};},tableOrders,spaceRefund,autoActivateAt,stripe,actorOf:()=>'tester',SEL_ENT:'*',rowToEnt:r=>r||null,
  spaceErr:(res,status,error)=>res.status(status).json({error}),reverseYanForOrder:async()=>{st.yan++;},invoiceCfg:()=>({}),noInvoiceCfg:()=>'未設定',
  ezpayInvoice:{searchInvoice:async(c,o,i)=>i,invalidInvoice:async(c,o,i)=>{if(invoiceFail)throw Object.assign(Error('ezPay 暫停'),{status:502});return {...i,status:'void'};}}};
 const route='/api/admin/orders/sessions/:id/space/refund';const at=source.indexOf(`app.post('${route}'`);
 vm.runInNewContext(source.slice(at,source.indexOf('\n}));',at)+6),ctx);
 const call=async(body={reason:'客人取消'})=>{const res={code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;}};await routes.get(route)({params:{id:st.s.id},body,auth:{brands}},res);return res;};
 return {st,call};
}

test('等等空間未啟用會籍：Stripe 全額退、作廢發票、沖點、作廢單、收掉入場單、刪會籍',async()=>{
 const h=harness();const r=await h.call();
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(h.st.created.length,1);assert.equal(h.st.created[0].b.amount,20000);assert.equal(h.st.created[0].b.payment_intent,'pi_x');
 assert.equal(h.st.created[0].opt.idempotencyKey,'pos-space-refund-to_1234567890abcdef');
 assert.equal(h.st.o.status,'void');assert.equal(h.st.o.invoice.status,'void');assert.equal(h.st.yan,1);
 assert.equal(h.st.s.status,'closed');assert.equal(h.st.deleted,'en_1');assert.equal(r.body.entitlement_removed,'en_1');
 assert.equal(h.st.o.payer.online_refund.amount,200);
});
test('Stripe 後台已全額退過：不再建立退款，沿用既有那筆並完成帳務',async()=>{
 const h=harness({existingRefunds:[{id:'re_old',amount:20000,status:'succeeded'}]});const r=await h.call();
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(h.st.created.length,0);
 assert.equal(r.body.online_refund.existing,true);assert.equal(r.body.online_refund.refund_id,'re_old');assert.equal(h.st.o.status,'void');
});
test('部分退過：只退剩下的',async()=>{
 const h=harness({existingRefunds:[{id:'re_old',amount:5000,status:'succeeded'}]});const r=await h.call();
 assert.equal(r.code,200);assert.equal(h.st.created[0].b.amount,15000);
});
test('約書旅入場（沒有會籍）：一樣可以退，不刪會籍',async()=>{
 const h=harness({venue:'REST'});const r=await h.call();
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(h.st.deleted,null);assert.equal(h.st.s.status,'closed');
});
test('擋下：已入場、非線上預付、會籍已啟用、購買滿 7 天、沒填原因、別品牌',async()=>{
 for(const [opt,body,code,re] of [
  [{inAt:new Date().toISOString()},undefined,409,/已經入場/],
  [{prepaid:false},undefined,409,/不是線上已付/],
  [{entActivated:new Date()},undefined,409,/已啟用/],
  [{purchased:new Date(Date.now()-8*864e5)},undefined,409,/自動啟用/],
  [{},{reason:' '},400,/原因/],
  [{brands:['REST']},undefined,403,/自己品牌/]]){
  const h=harness(opt);const r=await h.call(body);
  assert.equal(r.code,code,JSON.stringify(r.body));assert.match(r.body.error,re);assert.equal(h.st.created.length,0);assert.equal(h.st.o.status,'done');
 }
});
test('退款成功但發票作廢失敗：先存退款紀錄；重按不再退款，補完帳務',async()=>{
 const h=harness({invoiceFail:true});const r=await h.call();
 assert.equal(r.code,502);assert.match(r.body.error,/已退款/);assert.equal(h.st.o.status,'done');
 const saved=JSON.parse(h.st.later.at(-1).p[1]).online_refund;assert.equal(saved.amount,200);
 const h2=harness({refundRec:saved});const r2=await h2.call();
 assert.equal(r2.code,200);assert.equal(h2.st.created.length,0);assert.equal(h2.st.o.status,'void');
});
test('POS 入場資訊卡：線上預付未入場才有退單鍵，送店長識別碼與原因',()=>{
 assert.match(front,/sp\.prepaid && !sp\.in_at \? `<button type="button" class="sp-bar-link" id="sp-refund">/);
 assert.match(front,/on\('sp-refund'/);assert.match(front,/askManagerPin\('退單需要店長確認'\)/);
 assert.match(front,/\/space\/refund', \{ method: 'POST', body: \{ reason \}, headers \}/);
});
