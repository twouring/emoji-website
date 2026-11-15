import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const register=require('../lib/pos-register.js');

test('臨時收支 API：照片驗證與媒體儲存成功後才寫帳，失敗不得寫入',async()=>{
  const src=server.slice(server.indexOf('const cashReceiptUpload='),server.indexOf('/* 打賞支付（現金）寫進',server.indexOf('const cashReceiptUpload=')));
  let route,stored=true,writes=[],uploadCount=0;
  const ctx=vm.createContext({multer:require('multer'),crypto,auth:0,adminOnly:0,requireDb:0,wrap:x=>x,
    app:{post:(url,...rest)=>{route=rest.at(-1);}},sniffImageType:()=> 'image/jpeg',
    igPublisher:{uploadAsset:async()=>{uploadCount++;return stored?'/ig-media/assets/receipt.jpg':null;}},
    posRegister:register,loadOpenRegister:async()=>({id:'rg_1',venue:'CAFE',day:'2026-11-15'}),
    uid:()=> 'cm_1',actorOf:()=> '同仁',registerSummary:async()=>({summary:{expected:1050}}),
    q:async(sql,args)=>{writes.push({sql,args});return {rows:[{created_at:'2026-11-15T10:00:00Z'}]};}});
  vm.runInContext(src,ctx);
  const invoke=async(photo)=>{let status=200,result;const res={status(n){status=n;return this;},json(v){result=v;return this;}};
    try{await route({file:photo,body:{type:'in',amount:'50',reason:'補零錢'},auth:{}},res);}catch(e){status=e.status||500;result={error:e.message};}
    return {status,result};};
  assert.equal((await invoke(null)).status,400);assert.equal(writes.length,0);
  stored=false;assert.equal((await invoke({buffer:Buffer.from('test')})).status,503);assert.equal(writes.length,0);
  stored=true;const out=await invoke({buffer:Buffer.from('test')});assert.equal(out.status,201);
  assert.equal(out.result.receipt_photo,'/ig-media/assets/receipt.jpg');assert.equal(writes.length,1);
  assert.match(writes[0].sql,/receipt_photo/);assert.equal(writes[0].args.at(-1),out.result.receipt_photo);
  assert.equal(uploadCount,2);
});

test('日結 UI 三段順序、照片必填、關帳後零用金憑單與金額',()=>{
  assert.match(ui,/id="close-step-1"/);assert.match(ui,/id="close-step-2"/);
  assert.ok(ui.indexOf('<h3>核對帳戶</h3>')<ui.indexOf('<h3>收現金、關帳</h3>'));assert.match(ui,/class="reg-take"/);assert.ok(!ui.includes('reg-pack-note'));
  assert.match(ui,/data-reg-petty=/);assert.match(ui,/function pettyCashReceiptSpec\(rep\)/);
  assert.match(ui,/id="reg-cash-photo" type="file"[^>]*capture="environment"/);
  assert.match(ui,/先拍發票／憑證，記帳成功後才會開錢櫃/);
  assert.match(ui,/await uploadCashMove\(r\.id,/);assert.match(ui,/await manualCashDrawer\('臨時'/);
  assert.match(ui,/if\(!receipt&&!REG_CASH_EDIT\?\.receipt_photo\)/);
  const src=ui.slice(ui.indexOf('function pettyCashReceiptSpec('),ui.indexOf('async function printPettyCashReceipt('));
  const ctx=vm.createContext({num:x=>String(x),BRAND_LABEL:{CAFE:'在咖啡'},applicationTime:x=>x});vm.runInContext(src,ctx);
  const slip=ctx.pettyCashReceiptSpec({venue:'CAFE',day:'2026-11-15',closed_at:'date',opening_cash:3000,cash_in:500,cash_out:200,moves:[{type:'in',amount:500,reason:'補零錢',receipt_photo:'/x'}]});
  assert.ok(slip.some(x=>x.left==='應取零用金'&&x.right==='NT$3300'));
  assert.ok(slip.some(x=>x.text==='憑證照片已存檔'));
  const summary=register.expectedCash({opening_cash:3000,cash_sales:1000,moves:[{type:'in',amount:500},{type:'out',amount:200}]});
  const close=register.closeRegister({counted_cash:4300,cash_confirmed:true,accounts:{linepay:{actual:0,confirmed:true},ctbc:{actual:0,confirmed:true},transfer:{actual:0,confirmed:true}}},summary);
  assert.equal(close.keep_cash,0);assert.equal(close.take_cash,4300);
  assert.throws(()=>register.closeRegister({counted_cash:3200,cash_confirmed:true,note:'短缺',accounts:{linepay:{actual:0,confirmed:true},ctbc:{actual:0,confirmed:true},transfer:{actual:0,confirmed:true}}},summary),/點鈔不足應有零用金/);
});
