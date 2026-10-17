import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
const R=createRequire(import.meta.url)('../lib/pos-register.js');
const summary=R.expectedCash({opening_cash:1000,cash_sales:200,moves:[{type:'in',amount:50},{type:'out',amount:20}]});
const opts={accounts:{linepay:100,taishin:300,transfer:0,custom_wallet:40},order_total:640};
const body=()=>({counted_cash:1230,cash_confirmed:true,accounts:Object.fromEntries(Object.entries(opts.accounts).map(([c,actual])=>[c,{actual,confirmed:true}]))});
test('daily close requires explicit cash and every account including zero',()=>{
 assert.throws(()=>R.closeRegister({...body(),cash_confirmed:false},summary,opts),/確認/);
 const b=body();delete b.accounts.transfer;assert.throws(()=>R.closeRegister(b,summary,opts),/確認|實收/);
 for(const v of [null,'',' ',Infinity,NaN,false]){const b=body();b.accounts.linepay.actual=v;assert.throws(()=>R.closeRegister(b,summary,opts),/實收/);}
 for(const v of [null,'',' ',Infinity,NaN,false])assert.throws(()=>R.closeRegister({...body(),counted_cash:v},summary,opts),/點鈔/);
 const unconfirmed=body();unconfirmed.accounts.linepay.confirmed=false;assert.throws(()=>R.closeRegister(unconfirmed,summary,opts),/確認/);
 const c=body();c.accounts.injected={actual:0,confirmed:true};assert.throws(()=>R.closeRegister(c,summary,opts),/帳戶/);
});
test('cash and account reasons cannot cancel each other; final reason is separate',()=>{
 const b=body();b.counted_cash-=10;b.accounts.linepay.actual+=10;
 assert.throws(()=>R.closeRegister(b,summary,opts),/說明|原因/);
 b.note='找零短少';assert.throws(()=>R.closeRegister(b,summary,opts),/原因/);
 b.accounts.linepay.reason='跨日入帳';const c=R.closeRegister(b,summary,opts);assert.equal(c.total_diff,0);assert.equal(c.cash_actual,190);
 b.accounts.linepay.actual=100;assert.throws(()=>R.closeRegister(b,summary,opts),/總額|總差異/);
 b.total_reason='短少待追查';assert.equal(R.closeRegister(b,summary,opts).total_reason,b.total_reason);
});
test('authoritative order amount, merged cards and frozen report preserve reconciliation',()=>{
 assert.deepEqual(R.accountsOf({cash:50,card:10,taishin:20,linepay:2}),{linepay:2,taishin:30,transfer:0});
 const c=R.closeRegister(body(),summary,opts);assert.equal(c.total_pos,640);assert.equal(c.total_actual,640);
 const rep=R.registerReport({closed_at:'2026-10-17',...c},summary,{amount:640},[]);
 assert.deepEqual(rep.accounts,c.accounts);assert.equal(rep.total_actual,640);assert.equal(rep.total_reason,'');
});
test('close route uses authoritative brand sales and stale guard; reprints stored report',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const close=server.slice(server.indexOf("app.post('/api/admin/registers/:id/close'"),server.indexOf("app.post('/api/admin/registers/:id/reopen'"));
 assert.match(close,/req\.body\?\.reconciliation_version!==version/);
 assert.match(close,/accounts:s\.summary\.reconciliation_accounts,labels:s\.summary\.account_labels,order_total:s\.sales\.amount/);
 assert.match(close,/JSON\.stringify\(report\)/);
 assert.match(server,/r\.closed_at\?r\.report:s\.report/);
 const ui=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
 assert.ok(ui.indexOf('sales-kpis')<ui.indexOf('${REG_DATA?accountConfirmBlock(REG_DATA)+registerBlock(REG_DATA)'));
 assert.match(ui,/各帳戶確認/); // 日結頁在開關帳前先列各帳戶逐一確認。
 assert.match(ui,/帳務參考（另行逐項確認）/);
 assert.match(ui,/lpVenueTable/); // 保留 main 的 LINE Pay 店別歸屬與明細。
 const spec=ui.slice(ui.indexOf('function registerReportSpec('),ui.indexOf('// 有接 mPOP'));
 assert.match(spec,/rep\.accounts/);
 assert.match(spec,/rep\.total_reason/);
 assert.match(ui,/rep\.total_reason/);
});

test('real close handler rejects stale or invalid bodies without writing and freezes validated report',async()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/admin/registers/:id/close'");
 const route=server.slice(start,server.indexOf("/* 重開",start));
 let handler,writes=[];
 const fixture={sales:{amount:640},moves:[],summary:{...summary,reconciliation_accounts:opts.accounts,account_labels:{custom_wallet:'錢包'}}};
 const ctx=vm.createContext({app:{post:(...args)=>{handler=args.at(-1);}},auth:0,adminOnly:0,requireDb:0,wrap:fn=>fn,
  loadOpenRegister:async()=>({id:'reg',venue:'CAFE',day:'2026-10-17',opening_cash:1000}),registerSummary:async()=>fixture,
  posRegister:R,actorOf:()=> 'test-operator',q:async(sql,params)=>{writes.push({sql,params});return {rowCount:1};}});
 vm.runInContext(route,ctx);
 const call=async payload=>{let status=200,result;const res={status(n){status=n;return this;},json(v){result=v;return this;}};await handler({body:payload,auth:{}},res);return {status,result};};
 const version=JSON.stringify([summary.expected,summary.opening_cash,summary.cash_in,summary.cash_out,640,opts.accounts]);
 assert.equal((await call({...body(),reconciliation_version:'old'})).status,409);assert.equal(writes.length,0);
 assert.equal((await call({...body(),cash_confirmed:false,reconciliation_version:version})).status,400);assert.equal(writes.length,0);
 const out=await call({...body(),reconciliation_version:version});assert.equal(out.status,200);assert.equal(writes.length,1);
 const frozen=JSON.parse(writes[0].params[10]);assert.equal(frozen.accounts.custom_wallet.label,'錢包');assert.equal(frozen.total_pos,640);assert.equal(frozen.total_diff,0);assert.equal(out.result.report.total_actual,640);
});

test('Star report spec prints stored reconciliation and leaves legacy reports usable',()=>{
 const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
 const ctx=vm.createContext({num:v=>String(v??0),BRAND_LABEL:{CAFE:'在咖啡'},applicationTime:v=>v||'',payMethodLabel:c=>c});
 vm.runInContext(source.slice(source.indexOf('function registerReportSpec('),source.indexOf('// 有接 mPOP')),ctx);
 const report={venue:'CAFE',day:'2026-10-17',closed_at:'2026-10-17',...R.closeRegister(body(),summary,opts),total_reason:'保存原因'};
 const spec=ctx.registerReportSpec(report,'關帳單');
 assert.ok(spec.some(x=>x.text==='逐項帳戶核對'));assert.ok(spec.some(x=>x.text==='總差異原因：保存原因'));
 assert.ok(spec.some(x=>x.left==='帳戶總額'&&x.right==='640'));
 assert.doesNotThrow(()=>ctx.registerReportSpec({venue:'CAFE'},'舊關帳單'));
});
