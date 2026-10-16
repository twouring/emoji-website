import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
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
 assert.ok(ui.indexOf('sales-kpis')<ui.indexOf('${REG_DATA?registerBlock(REG_DATA)'));
 assert.match(ui,/外部帳務參考（需逐項確認）/);
 assert.match(ui,/rep\.total_reason/);
});
